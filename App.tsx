import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, PieChart, Plus, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import {
  AppTab,
  AppSettings,
  AssetHolding,
  AssetImportCandidate,
  AssetPerformanceSnapshot,
  AssetQuote,
  AssetRecurringPlan,
  AssetTradeRecord,
  AutoBookkeepingSettings,
  CaptureAttemptLog,
  Category,
  FundQuoteSourceOption,
  FundQuoteSourceTestResult,
  LLMConfig,
  LLMConfigTestResult,
  RecurringFrequency,
  RecurringProfile,
  Transaction,
  WalletBackupData,
  WalletSnapshot,
} from './types';
import Dashboard from './components/Dashboard';
import Stats from './components/Stats';
import Analysis from './components/Analysis';
import AddTransaction from './components/AddTransaction';
import Settings from './components/Settings';
import {
  addNativeCaptureListener,
  addNativeDeepLinkListener,
  addNativeStatusListener,
  buildDefaultSnapshot,
  consumePendingNativeDeepLink,
  defaultAutoBookkeepingSettings,
  deleteNativeRecurringProfile,
  deleteNativeTransaction,
  getNativeAutoBookkeepingStatus,
  hasLegacyWebStorage,
  isAndroidNative,
  loadNativeSnapshot,
  loadWebSnapshot,
  normalizeSnapshot,
  openNativeAccessibilitySettings,
  saveNativeCategory,
  saveNativeLlmConfig,
  saveNativeRecurringProfile,
  saveNativeSnapshot,
  saveNativeTransaction,
  saveWebSnapshot,
  testNativeModelConfig,
  retryNativeCaptureLog,
  analyzeNativeAssetScreenshot,
  deleteNativeAssetHolding,
  deleteNativeAssetRecurringPlan,
  saveNativeAssetHolding,
  saveNativeAssetRecurringPlan,
  syncNativeAssetQuotes,
  syncWebAssetQuotes,
  testNativeFundQuoteSource,
} from './services/walletStore';
import { mergeBackupData } from './services/dataBackup';
import { Cloud, getCloudStatus } from './services/cloudSync';
import { getNativeAccountId } from './services/nativeScope';
import {
  advanceAssetRecurringPlanPastDate,
  applyAssetRecurringPurchaseWithQuote,
  buildAssetPerformanceSnapshot,
  buildAssetPositions,
  getAssetQuoteConfirmedDate,
  isDelayedSettlementFund,
  isLikelyMarketOpenForHolding,
  mergeAssetPerformanceHistory,
} from './services/assetEngine';

const App: React.FC = () => {
  const runningInAndroid = isAndroidNative();
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [pendingEditTransactionId, setPendingEditTransactionId] = useState('');

  const [snapshotMeta, setSnapshotMeta] = useState<Pick<WalletSnapshot, 'storeVersion' | 'migratedFromWebStorage' | 'localRevision' | 'cloudAccountId'>>({
    storeVersion: 1,
    migratedFromWebStorage: false,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [captureLogs, setCaptureLogs] = useState<CaptureAttemptLog[]>([]);
  const [categories, setCategories] = useState<Category[]>(buildDefaultSnapshot().categories);
  const [recurringProfiles, setRecurringProfiles] = useState<RecurringProfile[]>([]);
  const [assetHoldings, setAssetHoldings] = useState<AssetHolding[]>([]);
  const [assetQuoteCache, setAssetQuoteCache] = useState<AssetQuote[]>([]);
  const [assetRecurringPlans, setAssetRecurringPlans] = useState<AssetRecurringPlan[]>([]);
  const [assetPerformanceHistory, setAssetPerformanceHistory] = useState<AssetPerformanceSnapshot[]>([]);
  const [assetTradeRecords, setAssetTradeRecords] = useState<AssetTradeRecord[]>([]);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(buildDefaultSnapshot().llmConfig);
  const [appSettings, setAppSettings] = useState<AppSettings>(buildDefaultSnapshot().appSettings);
  const [autoBookkeepingSettings, setAutoBookkeepingSettings] = useState<AutoBookkeepingSettings>(defaultAutoBookkeepingSettings());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncingAssets, setIsSyncingAssets] = useState(false);
  const [assetSyncNotice, setAssetSyncNotice] = useState('');
  const isHydratingRef = useRef(false);
  const llmConfigSaveRequestRef = useRef(0);
  const llmConfigPendingRef = useRef(0);
  const appliedRevisionRef = useRef({accountId: '', revision: 0});
  const hasLoadedRef = useRef(false);
  const [storageError, setStorageError] = useState('');

  const getTodayKey = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };

  const applySnapshot = useCallback((snapshot: WalletSnapshot) => {
    if (snapshot.cloudAccountId) {
      if (snapshot.cloudAccountId !== getNativeAccountId()) return;
      if (appliedRevisionRef.current.accountId === snapshot.cloudAccountId &&
          (snapshot.localRevision ?? 0) < appliedRevisionRef.current.revision) return;
      appliedRevisionRef.current = {accountId: snapshot.cloudAccountId, revision: snapshot.localRevision ?? 0};
    }
    hasLoadedRef.current = true;
    setSnapshotMeta({
      storeVersion: snapshot.storeVersion,
      migratedFromWebStorage: snapshot.migratedFromWebStorage,
      localRevision: snapshot.localRevision,
      cloudAccountId: snapshot.cloudAccountId,
    });
    setTransactions(snapshot.transactions);
    setCaptureLogs(snapshot.captureLogs);
    setCategories(snapshot.categories);
    setRecurringProfiles(snapshot.recurringProfiles);
    setAssetHoldings(snapshot.assetHoldings);
    setAssetQuoteCache(snapshot.assetQuoteCache);
    setAssetRecurringPlans(snapshot.assetRecurringPlans);
    setAssetPerformanceHistory(snapshot.assetPerformanceHistory);
    setAssetTradeRecords(snapshot.assetTradeRecords);
    if (llmConfigPendingRef.current === 0) setLlmConfig(snapshot.llmConfig);
    setAppSettings(snapshot.appSettings);
    setAutoBookkeepingSettings(snapshot.autoBookkeepingSettings);
  }, []);

  const calculateNextDate = (dateStr: string, frequency: RecurringFrequency): string => {
    const date = new Date(dateStr);
    switch (frequency) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly': {
        const currentMonth = date.getMonth();
        date.setMonth(currentMonth + 1);
        if (date.getMonth() !== (currentMonth + 1) % 12) {
          date.setDate(0);
        }
        break;
      }
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }
    return date.toISOString().split('T')[0];
  };

  const processRecurringTransactions = useCallback((profiles: RecurringProfile[], currentTransactions: Transaction[]) => {
    const today = new Date().toISOString().split('T')[0];
    const newTransactions: Transaction[] = [];
    const existingIds = new Set(currentTransactions.map(transaction => transaction.id));
    const updatedProfiles = profiles.map((profile) => ({ ...profile }));
    let hasUpdates = false;

    updatedProfiles.forEach((profile) => {
      while (profile.nextDueDate <= today) {
        hasUpdates = true;
        const executionId = 'recurring:' + profile.id + ':' + profile.nextDueDate;
        if (!existingIds.has(executionId)) newTransactions.push({
          id: executionId,
          amount: profile.amount,
          type: profile.type,
          categoryId: profile.categoryId,
          date: profile.nextDueDate,
          note: `(自动) ${profile.note}`,
          createdBy: 'recurring',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingIds.add(executionId);
        profile.nextDueDate = calculateNextDate(profile.nextDueDate, profile.frequency);
      }
    });

    return { hasUpdates, updatedProfiles, newTransactions };
  }, []);

  const buildCurrentSnapshot = useCallback(
    (): WalletSnapshot =>
      normalizeSnapshot({
        storeVersion: snapshotMeta.storeVersion,
        migratedFromWebStorage: snapshotMeta.migratedFromWebStorage,
        localRevision: snapshotMeta.localRevision,
        cloudAccountId: snapshotMeta.cloudAccountId,
        transactions,
        captureLogs,
        categories,
        recurringProfiles,
        assetHoldings,
        assetQuoteCache,
        assetRecurringPlans,
        assetPerformanceHistory,
        assetTradeRecords,
        llmConfig,
        appSettings,
        autoBookkeepingSettings,
      }),
    [
      assetHoldings,
      assetPerformanceHistory,
      assetTradeRecords,
      assetQuoteCache,
      assetRecurringPlans,
      autoBookkeepingSettings,
      captureLogs,
      categories,
      llmConfig,
      appSettings,
      recurringProfiles,
      snapshotMeta,
      transactions,
    ],
  );

  const refreshNativeSnapshot = useCallback(async () => {
    const snapshot = normalizeSnapshot(await loadNativeSnapshot());
    applySnapshot(snapshot);
  }, [applySnapshot]);

  useEffect(() => {
    if (!runningInAndroid) return;
    let disposed = false;
    let previousAccount = getNativeAccountId();
    const update = async () => {
      const status = await getCloudStatus();
      if (disposed) return;
      if (status.accountId !== previousAccount) {
        previousAccount = status.accountId;
        setIsAddModalOpen(false);
        setEditingTransaction(null);
        setPendingEditTransactionId('');
      }
      await refreshNativeSnapshot();
    };
    const listener = Cloud.addListener('cloudChanged', event => {
      if (event.dataChanged) void update().catch(() => {});
    });
    const sync = () => {
      if (document.visibilityState === 'visible') void Cloud.syncNow().catch(() => {});
    };
    const timer = window.setInterval(sync, 60000);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    void getCloudStatus().then(sync).catch(() => {});
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
      void listener.then(handle => handle.remove());
    };
  }, [runningInAndroid, refreshNativeSnapshot]);

  useEffect(() => {
    const onError = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setStorageError(event.reason instanceof Error ? event.reason.message : '操作失败');
    };
    window.addEventListener('unhandledrejection', onError);
    return () => window.removeEventListener('unhandledrejection', onError);
  }, []);

  const mergeWithLegacyWebStorage = useCallback(
    async (nativeSnapshot: WalletSnapshot) => {
      if (!hasLegacyWebStorage() || nativeSnapshot.migratedFromWebStorage) {
        return nativeSnapshot;
      }

      const webSnapshot = loadWebSnapshot();
      const migratedSnapshot = normalizeSnapshot({
        ...nativeSnapshot,
        transactions: webSnapshot.transactions.length ? webSnapshot.transactions : nativeSnapshot.transactions,
        categories: webSnapshot.categories.length ? webSnapshot.categories : nativeSnapshot.categories,
        recurringProfiles: webSnapshot.recurringProfiles.length ? webSnapshot.recurringProfiles : nativeSnapshot.recurringProfiles,
        assetHoldings: webSnapshot.assetHoldings.length ? webSnapshot.assetHoldings : nativeSnapshot.assetHoldings,
        assetQuoteCache: webSnapshot.assetQuoteCache.length ? webSnapshot.assetQuoteCache : nativeSnapshot.assetQuoteCache,
        assetRecurringPlans: webSnapshot.assetRecurringPlans.length ? webSnapshot.assetRecurringPlans : nativeSnapshot.assetRecurringPlans,
        assetPerformanceHistory: webSnapshot.assetPerformanceHistory.length
          ? webSnapshot.assetPerformanceHistory
          : nativeSnapshot.assetPerformanceHistory,
        assetTradeRecords: webSnapshot.assetTradeRecords.length
          ? webSnapshot.assetTradeRecords
          : nativeSnapshot.assetTradeRecords,
        llmConfig: webSnapshot.llmConfig,
        appSettings: webSnapshot.appSettings,
        migratedFromWebStorage: true,
        autoBookkeepingSettings: {
          ...nativeSnapshot.autoBookkeepingSettings,
          ...webSnapshot.autoBookkeepingSettings,
        },
      });

      return saveNativeSnapshot(migratedSnapshot);
    },
    [],
  );

  const processAssetRecurringPlans = useCallback(
    async (snapshot: WalletSnapshot): Promise<{ snapshot: WalletSnapshot; hasUpdates: boolean }> => {
      const today = getTodayKey();
      const holdings = snapshot.assetHoldings.map((holding) => ({ ...holding }));
      const plans = snapshot.assetRecurringPlans.map((plan) => ({ ...plan }));
      const tradeRecords = snapshot.assetTradeRecords.map((record) => ({ ...record }));
      const quoteMap = new Map(snapshot.assetQuoteCache.map((quote) => [`${quote.assetType}:${quote.code}`, quote]));
      let hasUpdates = false;
      const fetchHoldingQuote = async (holding: AssetHolding) => {
        const quotes = runningInAndroid
          ? await syncNativeAssetQuotes([holding], snapshot.appSettings.fundQuoteSource)
          : await syncWebAssetQuotes([holding], snapshot.appSettings.fundQuoteSource);
        quotes.forEach((quote) => {
          quoteMap.set(`${quote.assetType}:${quote.code}`, quote);
        });
        return quotes.find((item) => item.assetType === holding.assetType && item.code === holding.code) ?? null;
      };

      const pendingTradeEntries = tradeRecords
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => record.status === 'pending')
        .sort((left, right) => new Date(left.record.occurredAt).getTime() - new Date(right.record.occurredAt).getTime());

      for (const { record, index } of pendingTradeEntries) {
        if (record.amount <= 0) {
          continue;
        }

        const holdingIndex = holdings.findIndex((holding) => holding.id === record.holdingId);
        if (holdingIndex < 0 || holdings[holdingIndex].assetType !== 'fund') {
          continue;
        }

        const quote = await fetchHoldingQuote(holdings[holdingIndex]);
        const confirmedDate = getAssetQuoteConfirmedDate(quote);
        const confirmedPrice = quote?.confirmedPrice && quote.confirmedPrice > 0
          ? quote.confirmedPrice
          : quote?.priceSource === 'confirmed'
            ? quote.price
            : 0;
        const tradeDate = record.occurredAt.split('T')[0];
        if (!confirmedDate || confirmedDate < tradeDate || confirmedPrice <= 0) {
          continue;
        }

        const settledAt = new Date().toISOString();
        const currentHolding = holdings[holdingIndex];
        let settledShares = record.amount / confirmedPrice;
        let nextShares = currentHolding.shares;
        let nextCostAmount = currentHolding.costAmount;

        if (!Number.isFinite(settledShares) || settledShares <= 0) {
          continue;
        }

        if (record.tradeType === 'sell') {
          settledShares = Math.min(settledShares, currentHolding.shares);
          if (settledShares <= 0) {
            continue;
          }
          const averageCost = currentHolding.shares > 0 ? currentHolding.costAmount / currentHolding.shares : 0;
          nextShares = currentHolding.shares - settledShares;
          nextCostAmount = nextShares <= 0 ? 0 : Math.max(0, currentHolding.costAmount - averageCost * settledShares);
        } else {
          nextShares = currentHolding.shares + settledShares;
          nextCostAmount = currentHolding.costAmount + record.amount;
        }

        holdings[holdingIndex] = {
          ...currentHolding,
          shares: nextShares,
          costAmount: nextCostAmount,
          name: quote?.name || currentHolding.name,
          updatedAt: settledAt,
        };
        tradeRecords[index] = {
          ...record,
          name: quote?.name || record.name,
          status: 'completed',
          shares: settledShares,
          price: confirmedPrice,
          priceSource: 'confirmed',
          settledAt,
        };
        hasUpdates = true;
      }

      for (const plan of plans) {
        if (!plan.enabled || plan.amount <= 0) {
          continue;
        }

        const holdingIndex = holdings.findIndex((holding) => holding.id === plan.holdingId);
        if (holdingIndex < 0 || holdings[holdingIndex].assetType !== 'fund') {
          continue;
        }

        if (plan.nextDueDate > today) {
          continue;
        }

        const currentHolding = holdings[holdingIndex];
        const quote = await fetchHoldingQuote(currentHolding);
        const holdingForRule = {
          ...currentHolding,
          name: quote?.name || currentHolding.name,
        };

        if (quote && !isLikelyMarketOpenForHolding(today, quote, holdingForRule)) {
          continue;
        }

        if (isDelayedSettlementFund(holdingForRule)) {
          const confirmedDate = getAssetQuoteConfirmedDate(quote);
          const confirmedPrice = quote?.confirmedPrice && quote.confirmedPrice > 0
            ? quote.confirmedPrice
            : quote?.priceSource === 'confirmed'
              ? quote.price
              : 0;
          const executionDate = plan.nextDueDate <= today ? plan.nextDueDate : '';
          const alreadyRecorded = tradeRecords.some(
            (record) =>
              record.tradeType === 'recurring' &&
              record.source === 'recurring' &&
              record.recurringPlanId === plan.id &&
              record.occurredAt.startsWith(executionDate),
          );
          if (!executionDate || alreadyRecorded) {
            continue;
          }

          if (confirmedDate && confirmedDate >= executionDate && confirmedPrice > 0) {
            const addedShares = plan.amount / confirmedPrice;
            holdings[holdingIndex] = {
              ...holdingForRule,
              shares: holdingForRule.shares + addedShares,
              costAmount: holdingForRule.costAmount + plan.amount,
              updatedAt: new Date().toISOString(),
            };
            Object.assign(plan, advanceAssetRecurringPlanPastDate(plan, executionDate));
            tradeRecords.unshift({
              id: 'asset-recurring:' + plan.id + ':' + executionDate,
              holdingId: currentHolding.id,
              assetType: currentHolding.assetType,
              code: currentHolding.code,
              name: quote?.name || currentHolding.name,
              tradeType: 'recurring',
              source: 'recurring',
              status: 'completed',
              recurringPlanId: plan.id,
              shares: addedShares,
              amount: plan.amount,
              price: confirmedPrice,
              priceSource: 'confirmed',
              occurredAt: `${executionDate}T00:00:00.000Z`,
              createdAt: new Date().toISOString(),
              settledAt: new Date().toISOString(),
            });
          } else {
            Object.assign(plan, advanceAssetRecurringPlanPastDate(plan, executionDate));
            tradeRecords.unshift({
              id: 'asset-recurring:' + plan.id + ':' + executionDate,
              holdingId: currentHolding.id,
              assetType: currentHolding.assetType,
              code: currentHolding.code,
              name: quote?.name || currentHolding.name,
              tradeType: 'recurring',
              source: 'recurring',
              status: 'pending',
              recurringPlanId: plan.id,
              shares: 0,
              amount: plan.amount,
              price: 0,
              occurredAt: `${executionDate}T00:00:00.000Z`,
              createdAt: new Date().toISOString(),
            });
          }
          hasUpdates = true;
          continue;
        }

        const execution = quote ? applyAssetRecurringPurchaseWithQuote(currentHolding, plan, quote, today) : null;
        if (!execution) {
          continue;
        }

        holdings[holdingIndex] = execution.holding;
        Object.assign(plan, execution.plan);
        tradeRecords.unshift({
          id: 'asset-recurring:' + plan.id + ':' + (execution.executionDate ?? today),
          holdingId: currentHolding.id,
          assetType: currentHolding.assetType,
          code: currentHolding.code,
          name: quote.name || currentHolding.name,
          tradeType: 'recurring',
          source: 'recurring',
          status: 'completed',
          recurringPlanId: plan.id,
          shares: execution.addedShares,
          amount: plan.amount,
          price: quote.price,
          priceSource: quote.priceSource,
          occurredAt: `${execution.executionDate ?? today}T00:00:00.000Z`,
          createdAt: new Date().toISOString(),
          settledAt: new Date().toISOString(),
        });
        hasUpdates = true;
      }

      if (!hasUpdates) {
        return { snapshot, hasUpdates: false };
      }

      return {
        snapshot: normalizeSnapshot({
          ...snapshot,
          assetHoldings: holdings,
          assetRecurringPlans: plans,
          assetTradeRecords: tradeRecords,
          assetQuoteCache: Array.from(quoteMap.values()),
        }),
        hasUpdates,
      };
    },
    [runningInAndroid],
  );

  const resolveSnapshotOnLoad = useCallback(
    async (snapshot: WalletSnapshot) => {
      const recurringResult = processRecurringTransactions(snapshot.recurringProfiles, snapshot.transactions);
      let updatedSnapshot = normalizeSnapshot(
        recurringResult.hasUpdates
          ? {
              ...snapshot,
              transactions: [...recurringResult.newTransactions, ...snapshot.transactions],
              recurringProfiles: recurringResult.updatedProfiles,
            }
          : snapshot,
      );

      const assetRecurringResult = await processAssetRecurringPlans(updatedSnapshot);
      updatedSnapshot = assetRecurringResult.snapshot;

      if (!recurringResult.hasUpdates && !assetRecurringResult.hasUpdates) {
        return snapshot;
      }

      if (runningInAndroid) {
        return saveNativeSnapshot(updatedSnapshot);
      }

      saveWebSnapshot(updatedSnapshot);
      return updatedSnapshot;
    },
    [processAssetRecurringPlans, processRecurringTransactions, runningInAndroid],
  );

  const refreshAutoBookkeepingStatus = useCallback(async () => {
    if (!runningInAndroid) {
      return;
    }

    const status = await getNativeAutoBookkeepingStatus();
    setAutoBookkeepingSettings((previous) => ({
      ...previous,
      ...status,
    }));
  }, [runningInAndroid]);

  const queueDeepLink = useCallback((url?: string) => {
    if (!url) {
      return;
    }

    const match = url.match(/^smartwallet:\/\/transaction\/([^/]+)\/edit$/i);
    if (match?.[1]) {
      setPendingEditTransactionId(decodeURIComponent(match[1]));
      setActiveTab(AppTab.DASHBOARD);
    }
  }, []);

  const openTransactionDetails = useCallback(
    async (transaction: Transaction) => {
      let transactionToOpen = transaction;

      if (transaction.needsReview) {
        const reviewedTransaction: Transaction = {
          ...transaction,
          needsReview: false,
          updatedAt: new Date().toISOString(),
        };

        try {
          if (runningInAndroid) {
            const nextSnapshot = await saveNativeTransaction(reviewedTransaction);
            applySnapshot(nextSnapshot);
            transactionToOpen =
              nextSnapshot.transactions.find((item) => item.id === reviewedTransaction.id) ?? reviewedTransaction;
          } else {
            const nextSnapshot = normalizeSnapshot({
              ...buildCurrentSnapshot(),
              transactions: transactions.map((item) => (item.id === reviewedTransaction.id ? reviewedTransaction : item)),
            });
            applySnapshot(nextSnapshot);
            transactionToOpen =
              nextSnapshot.transactions.find((item) => item.id === reviewedTransaction.id) ?? reviewedTransaction;
          }
        } catch (error) {
          console.error('Failed to clear review state before opening transaction', error);
        }
      }

      setEditingTransaction(transactionToOpen);
      setIsAddModalOpen(true);
    },
    [applySnapshot, buildCurrentSnapshot, runningInAndroid, transactions],
  );

  useEffect(() => {
    let isMounted = true;
    let captureHandle: { remove: () => Promise<void> } | null = null;
    let statusHandle: { remove: () => Promise<void> } | null = null;
    let deepLinkHandle: { remove: () => Promise<void> } | null = null;

    const initialize = async () => {
      isHydratingRef.current = true;

      try {
        if (runningInAndroid) await getCloudStatus();
        let initialSnapshot = runningInAndroid ? await loadNativeSnapshot() : normalizeSnapshot(loadWebSnapshot());
        if (runningInAndroid) {
          initialSnapshot = await mergeWithLegacyWebStorage(initialSnapshot);
        }

        const resolvedSnapshot = await resolveSnapshotOnLoad(initialSnapshot);
        if (!isMounted) {
          return;
        }

        applySnapshot(resolvedSnapshot);

        if (runningInAndroid) {
          const status = await getNativeAutoBookkeepingStatus();
          setAutoBookkeepingSettings((previous) => ({
            ...previous,
            ...status,
          }));

          captureHandle = await addNativeCaptureListener(async () => {
            await refreshNativeSnapshot();
            await refreshAutoBookkeepingStatus();
          });

          statusHandle = await addNativeStatusListener((statusPayload) => {
            if (!statusPayload) {
              return;
            }
            setAutoBookkeepingSettings((previous) => ({
              ...previous,
              ...statusPayload,
            }));
            void refreshNativeSnapshot();
          });

          deepLinkHandle = await addNativeDeepLinkListener((url) => {
            queueDeepLink(typeof url === 'string' ? url : undefined);
          });

          queueDeepLink(await consumePendingNativeDeepLink());
        }
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : '数据读取失败');
        return;
      } finally {
        if (isMounted) {
          setIsInitialized(true);
        }
        isHydratingRef.current = false;
      }
    };

    void initialize();

    return () => {
      isMounted = false;
      void captureHandle?.remove();
      void statusHandle?.remove();
      void deepLinkHandle?.remove();
    };
  }, [
    applySnapshot,
    mergeWithLegacyWebStorage,
    queueDeepLink,
    refreshAutoBookkeepingStatus,
    refreshNativeSnapshot,
    resolveSnapshotOnLoad,
    runningInAndroid,
  ]);

  useEffect(() => {
    if (!pendingEditTransactionId) {
      return;
    }

    const targetTransaction = transactions.find((transaction) => transaction.id === pendingEditTransactionId);
    if (!targetTransaction) {
      return;
    }

    setPendingEditTransactionId('');
    void openTransactionDetails(targetTransaction);
  }, [openTransactionDetails, pendingEditTransactionId, transactions]);

  useEffect(() => {
    if (!assetSyncNotice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAssetSyncNotice('');
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [assetSyncNotice]);

  useEffect(() => {
    if (!isInitialized || isHydratingRef.current || runningInAndroid) {
      return;
    }

    saveWebSnapshot(buildCurrentSnapshot());
  }, [buildCurrentSnapshot, isInitialized, runningInAndroid]);

  const handleAddTransaction = async (data: Omit<Transaction, 'id'>) => {
    const now = new Date().toISOString();
    const newTransaction: Transaction = {
      id: uuidv4(),
      createdBy: 'manual',
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    if (runningInAndroid) {
      applySnapshot(await saveNativeTransaction(newTransaction));
      return;
    }

    setTransactions((previous) => [newTransaction, ...previous]);
  };

  const handleUpdateTransaction = async (id: string, data: Partial<Transaction>) => {
    const originalTransaction = transactions.find((transaction) => transaction.id === id);
    if (!originalTransaction) {
      return;
    }

    const updatedTransaction: Transaction = {
      ...originalTransaction,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (runningInAndroid) {
      applySnapshot(await saveNativeTransaction(updatedTransaction));
      return;
    }

    setTransactions((previous) =>
      previous.map((transaction) => (transaction.id === id ? updatedTransaction : transaction)),
    );
  };

  const handleEditRequest = (transaction: Transaction) => {
    void openTransactionDetails(transaction);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setEditingTransaction(null);
  };

  const handleAddRecurring = async (data: Omit<RecurringProfile, 'id' | 'nextDueDate'>) => {
    const newProfile: RecurringProfile = {
      id: uuidv4(),
      nextDueDate: data.startDate,
      ...data,
    };
    const today = new Date().toISOString().split('T')[0];

    if (newProfile.nextDueDate <= today) {
      const result = processRecurringTransactions([newProfile], transactions);
      if (result.hasUpdates) {
        if (runningInAndroid) {
          applySnapshot(
            await saveNativeSnapshot(
              normalizeSnapshot({
                ...buildCurrentSnapshot(),
                transactions: [...result.newTransactions, ...transactions],
                recurringProfiles: [...recurringProfiles, result.updatedProfiles[0]],
              }),
            ),
          );
          return;
        }

        setTransactions((previous) => [...result.newTransactions, ...previous]);
        setRecurringProfiles((previous) => [...previous, result.updatedProfiles[0]]);
        return;
      }
    }

    if (runningInAndroid) {
      applySnapshot(await saveNativeRecurringProfile(newProfile));
      return;
    }

    setRecurringProfiles((previous) => [...previous, newProfile]);
  };

  const handleDeleteRecurring = async (id: string) => {
    if (!window.confirm('确定要删除此规则吗？')) {
      return;
    }

    if (runningInAndroid) {
      applySnapshot(await deleteNativeRecurringProfile(id));
      return;
    }

    setRecurringProfiles((previous) => previous.filter((profile) => profile.id !== id));
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!window.confirm('确认删除？')) {
      return;
    }

    if (runningInAndroid) {
      applySnapshot(await deleteNativeTransaction(id));
      return;
    }

    setTransactions((previous) => previous.filter((transaction) => transaction.id !== id));
  };

  const handleAddCategory = async (category: Category) => {
    if (runningInAndroid) {
      applySnapshot(await saveNativeCategory(category));
      return;
    }

    applySnapshot(
      normalizeSnapshot({
        ...buildCurrentSnapshot(),
        categories: [...categories, category],
      }),
    );
  };

  const handleImportBackup = async (importedData: WalletBackupData, mode: 'append' | 'overwrite') => {
    if (runningInAndroid && mode === 'overwrite' && (await getCloudStatus()).loggedIn) {
      const ticket = await Cloud.prepareRestore();
      if (!window.confirm('将替换此账户所有设备的账本。继续？')) return;
      await Cloud.restore({ticket, data: importedData});
      await refreshNativeSnapshot();
      alert('恢复完成');
      return;
    }
    if (mode === 'overwrite' && !window.confirm('将替换本机账本。继续？')) return;

    const mergedData = mergeBackupData(
      {
        transactions,
        categories,
        recurringProfiles,
        assetHoldings,
        assetRecurringPlans,
        assetPerformanceHistory,
        assetTradeRecords,
      },
      importedData,
      mode,
    );

    const nextSnapshot = normalizeSnapshot({
      ...buildCurrentSnapshot(),
      transactions: mergedData.transactions,
      categories: mergedData.categories,
      recurringProfiles: mergedData.recurringProfiles,
      assetHoldings: mergedData.assetHoldings,
      assetRecurringPlans: mergedData.assetRecurringPlans,
      assetPerformanceHistory: mergedData.assetPerformanceHistory,
      assetTradeRecords: mergedData.assetTradeRecords,
    });

    if (runningInAndroid) {
      applySnapshot(await saveNativeSnapshot(nextSnapshot, 'append'));
    } else {
      applySnapshot(nextSnapshot);
    }

    alert(
      mode === 'overwrite'
        ? `成功恢复 ${mergedData.transactions.length} 条交易和 ${mergedData.assetHoldings.length} 个持仓。`
        : `成功追加 ${importedData.transactions.length} 条交易和 ${importedData.assetHoldings.length} 个持仓。`,
    );
  };

  const handleUpdateLLMConfig = async (config: LLMConfig) => {
    setLlmConfig(config);

    if (!runningInAndroid) {
      return;
    }

    const requestId = ++llmConfigSaveRequestRef.current;
    llmConfigPendingRef.current++;
    try {
      const savedSnapshot = await saveNativeLlmConfig(config);
      if (requestId === llmConfigSaveRequestRef.current) setLlmConfig(savedSnapshot.llmConfig);
    } finally {
      llmConfigPendingRef.current--;
    }
  };

  const handleOpenAccessibilitySettings = async () => {
    if (!runningInAndroid) {
      return;
    }

    const status = await openNativeAccessibilitySettings();
    setAutoBookkeepingSettings((previous) => ({
      ...previous,
      ...status,
    }));
  };

  const handleTestModelConfig = async (): Promise<LLMConfigTestResult> => testNativeModelConfig();

  const handleRetryCaptureLog = async (logId: string) => {
    if (!runningInAndroid) {
      return;
    }

    const status = await retryNativeCaptureLog(logId);
    setAutoBookkeepingSettings((previous) => ({
      ...previous,
      ...status,
    }));
  };

  const syncAssetQuotesForSnapshot = useCallback(
    async (holdings: AssetHolding[], baseSnapshot: WalletSnapshot) => {
      if (baseSnapshot.assetHoldings.length === 0 || isSyncingAssets) {
        return;
      }

      setIsSyncingAssets(true);
      try {
        const recurringResult = await processAssetRecurringPlans(baseSnapshot);
        const workingSnapshot = recurringResult.snapshot;
        const quotes = runningInAndroid
          ? await syncNativeAssetQuotes(workingSnapshot.assetHoldings, workingSnapshot.appSettings.fundQuoteSource)
          : await syncWebAssetQuotes(workingSnapshot.assetHoldings, workingSnapshot.appSettings.fundQuoteSource);
        const quoteMap = new Map<string, AssetQuote>(
          workingSnapshot.assetQuoteCache.map((quote) => [`${quote.assetType}:${quote.code}`, quote]),
        );
        quotes.forEach((quote) => {
          quoteMap.set(`${quote.assetType}:${quote.code}`, quote);
        });
        const quoteNameMap = new Map<string, AssetQuote>(
          quotes.filter((quote) => quote.name.trim()).map((quote) => [`${quote.assetType}:${quote.code}`, quote]),
        );
        const assetHoldingsWithNames = workingSnapshot.assetHoldings.map((holding) => {
          const quote = quoteNameMap.get(`${holding.assetType}:${holding.code}`);
          const quoteName = quote?.name.trim();
          if (!quoteName || holding.name === quoteName) {
            return holding;
          }
          return {
            ...holding,
            name: quoteName,
            updatedAt: quote.syncedAt || new Date().toISOString(),
          };
        });
        const updatedQuoteCache = Array.from(quoteMap.values());
        const benchmarkQuote = updatedQuoteCache.find((quote) => quote.assetType === 'index' && quote.code === '000001');
        const nextPerformanceSnapshot = buildAssetPerformanceSnapshot(
          buildAssetPositions(assetHoldingsWithNames, updatedQuoteCache),
          benchmarkQuote,
        );
        const nextSnapshot = normalizeSnapshot({
          ...workingSnapshot,
          assetHoldings: assetHoldingsWithNames,
          assetQuoteCache: updatedQuoteCache,
          assetPerformanceHistory: mergeAssetPerformanceHistory(
            workingSnapshot.assetPerformanceHistory,
            nextPerformanceSnapshot,
          ),
        });

        if (runningInAndroid) {
          applySnapshot(await saveNativeSnapshot(nextSnapshot));
        } else {
          applySnapshot(nextSnapshot);
        }
        setAssetSyncNotice('');
      } catch (error) {
        console.error('Failed to sync asset quotes', error);
        setAssetSyncNotice('行情同步失败');
      } finally {
        setIsSyncingAssets(false);
      }
    },
    [applySnapshot, isSyncingAssets, processAssetRecurringPlans, runningInAndroid],
  );

  const handleAddAssetHolding = async (data: Omit<AssetHolding, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const assetHolding: AssetHolding = {
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      ...data,
    };

    if (runningInAndroid) {
      const nextSnapshot = await saveNativeAssetHolding(assetHolding);
      applySnapshot(nextSnapshot);
      void syncAssetQuotesForSnapshot(nextSnapshot.assetHoldings, nextSnapshot);
      return;
    }

    const nextSnapshot = normalizeSnapshot({
      ...buildCurrentSnapshot(),
      assetHoldings: [assetHolding, ...assetHoldings],
    });
    applySnapshot(nextSnapshot);
    void syncAssetQuotesForSnapshot(nextSnapshot.assetHoldings, nextSnapshot);
  };

  const handleUpdateAssetHolding = async (
    id: string,
    data: Omit<AssetHolding, 'id' | 'createdAt' | 'updatedAt'>,
    tradeRecord?: Omit<AssetTradeRecord, 'id' | 'createdAt'>,
  ) => {
    const original = assetHoldings.find((holding) => holding.id === id);
    if (!original) {
      return;
    }

    const assetHolding: AssetHolding = {
      ...original,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    const nextTradeRecord: AssetTradeRecord | null = tradeRecord
      ? {
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          ...tradeRecord,
        }
      : null;

    if (runningInAndroid) {
      if (nextTradeRecord) {
        const nextSnapshot = normalizeSnapshot({
          ...buildCurrentSnapshot(),
          assetHoldings: assetHoldings.map((holding) => (holding.id === id ? assetHolding : holding)),
          assetTradeRecords: [nextTradeRecord, ...assetTradeRecords],
        });
        applySnapshot(await saveNativeSnapshot(nextSnapshot));
        void syncAssetQuotesForSnapshot(nextSnapshot.assetHoldings, nextSnapshot);
        return;
      }

      const nextSnapshot = await saveNativeAssetHolding(assetHolding);
      applySnapshot(nextSnapshot);
      void syncAssetQuotesForSnapshot(nextSnapshot.assetHoldings, nextSnapshot);
      return;
    }

    const nextSnapshot = normalizeSnapshot({
      ...buildCurrentSnapshot(),
      assetHoldings: assetHoldings.map((holding) => (holding.id === id ? assetHolding : holding)),
      assetTradeRecords: nextTradeRecord ? [nextTradeRecord, ...assetTradeRecords] : assetTradeRecords,
    });
    applySnapshot(nextSnapshot);
    void syncAssetQuotesForSnapshot(nextSnapshot.assetHoldings, nextSnapshot);
  };

  const handleDeleteAssetHolding = async (id: string) => {
    if (!window.confirm('确认删除？')) {
      return;
    }

    if (runningInAndroid) {
      applySnapshot(await deleteNativeAssetHolding(id));
      return;
    }

    setAssetHoldings((previous) => previous.filter((holding) => holding.id !== id));
    setAssetRecurringPlans((previous) => previous.filter((plan) => plan.holdingId !== id));
    setAssetQuoteCache((previous) => {
      const deleted = assetHoldings.find((holding) => holding.id === id);
      if (!deleted) {
        return previous;
      }
      return previous.filter((quote) => quote.assetType !== deleted.assetType || quote.code !== deleted.code);
    });
  };

  const handleSaveAssetRecurringPlan = async (data: Omit<AssetRecurringPlan, 'id' | 'createdAt' | 'updatedAt'>, existingId?: string) => {
    const now = new Date().toISOString();
    const existingPlan = existingId ? assetRecurringPlans.find((plan) => plan.id === existingId) : null;
    const plan: AssetRecurringPlan = {
      id: existingPlan?.id ?? uuidv4(),
      createdAt: existingPlan?.createdAt ?? now,
      updatedAt: now,
      ...data,
    };
    const nextSnapshot = normalizeSnapshot({
      ...buildCurrentSnapshot(),
      assetRecurringPlans: existingPlan
        ? assetRecurringPlans.map((item) => (item.id === existingPlan.id ? plan : item))
        : [plan, ...assetRecurringPlans],
    });

    if (runningInAndroid) {
      const savedSnapshot = await saveNativeAssetRecurringPlan(plan);
      applySnapshot(savedSnapshot);
      void syncAssetQuotesForSnapshot(savedSnapshot.assetHoldings, savedSnapshot);
      return;
    }

    applySnapshot(nextSnapshot);
    void syncAssetQuotesForSnapshot(nextSnapshot.assetHoldings, nextSnapshot);
  };

  const handleDeleteAssetRecurringPlan = async (id: string) => {
    const nextSnapshot = normalizeSnapshot({
      ...buildCurrentSnapshot(),
      assetRecurringPlans: assetRecurringPlans.filter((plan) => plan.id !== id),
    });

    if (runningInAndroid) {
      applySnapshot(await deleteNativeAssetRecurringPlan(id));
      return;
    }

    applySnapshot(nextSnapshot);
  };

  const handleSyncAssetQuotes = useCallback(async () => {
    await syncAssetQuotesForSnapshot(assetHoldings, buildCurrentSnapshot());
  }, [assetHoldings, buildCurrentSnapshot, syncAssetQuotesForSnapshot]);

  const handleAnalyzeAssetScreenshot = async (imageBase64: string): Promise<AssetImportCandidate[]> => {
    if (!runningInAndroid) {
      throw new Error('当前环境不支持截图识别');
    }

    const result = await analyzeNativeAssetScreenshot(imageBase64);
    if (!result.ok) {
      throw new Error(result.message || '识别失败');
    }
    return result.holdings;
  };

  const handleUpdateAppSettings = async (settings: AppSettings) => {
    const fundQuoteSourceChanged = settings.fundQuoteSource !== appSettings.fundQuoteSource;
    const nextSnapshot = normalizeSnapshot({
      ...buildCurrentSnapshot(),
      appSettings: settings,
    });

    if (runningInAndroid) {
      const savedSnapshot = await saveNativeSnapshot(nextSnapshot);
      applySnapshot(savedSnapshot);
      if (fundQuoteSourceChanged) {
        await syncAssetQuotesForSnapshot(savedSnapshot.assetHoldings, savedSnapshot);
      }
      return;
    }

    applySnapshot(nextSnapshot);
    if (fundQuoteSourceChanged) {
      await syncAssetQuotesForSnapshot(nextSnapshot.assetHoldings, nextSnapshot);
    }
  };

  const handleTestFundQuoteSource = async (
    source: FundQuoteSourceOption,
  ): Promise<FundQuoteSourceTestResult> => {
    if (!runningInAndroid) {
      return { source, ok: false, message: '当前环境不可检测' };
    }
    const target = assetHoldings.find((holding) => holding.assetType === 'fund');
    return testNativeFundQuoteSource(source, target?.code || '004388', target?.name || '');
  };

  const renderContent = () => {
    switch (activeTab) {
      case AppTab.DASHBOARD:
        return (
          <Dashboard
            transactions={transactions}
            categories={categories}
            onEdit={handleEditRequest}
            onDelete={handleDeleteTransaction}
          />
        );
      case AppTab.STATS:
        return <Stats transactions={transactions} categories={categories} />;
      case AppTab.ANALYSIS:
        return (
          <Analysis
            transactions={transactions}
            expenseAverageMonths={appSettings.expenseAverageMonths}
            assetHoldings={assetHoldings}
            assetQuoteCache={assetQuoteCache}
            assetRecurringPlans={assetRecurringPlans}
            assetPerformanceHistory={assetPerformanceHistory}
            assetTradeRecords={assetTradeRecords}
            onAddAssetHolding={handleAddAssetHolding}
            onUpdateAssetHolding={handleUpdateAssetHolding}
            onDeleteAssetHolding={handleDeleteAssetHolding}
            onSaveAssetRecurringPlan={handleSaveAssetRecurringPlan}
            onDeleteAssetRecurringPlan={handleDeleteAssetRecurringPlan}
            onSyncAssetQuotes={handleSyncAssetQuotes}
            onAnalyzeAssetScreenshot={handleAnalyzeAssetScreenshot}
          />
        );
      case AppTab.SETTINGS:
        return (
          <Settings
            transactions={transactions}
            categories={categories}
            recurringProfiles={recurringProfiles}
            assetHoldings={assetHoldings}
            assetRecurringPlans={assetRecurringPlans}
            assetPerformanceHistory={assetPerformanceHistory}
            assetTradeRecords={assetTradeRecords}
            llmConfig={llmConfig}
            autoBookkeepingSettings={autoBookkeepingSettings}
            appSettings={appSettings}
            captureLogs={captureLogs}
            onUpdateLLMConfig={handleUpdateLLMConfig}
            onUpdateAppSettings={handleUpdateAppSettings}
            onTestFundQuoteSource={handleTestFundQuoteSource}
            onImport={handleImportBackup}
            onDeleteRecurring={handleDeleteRecurring}
            onOpenAccessibilitySettings={handleOpenAccessibilitySettings}
            onTestModelConfig={handleTestModelConfig}
            onRefreshAutoBookkeepingStatus={refreshAutoBookkeepingStatus}
            onRetryCaptureLog={handleRetryCaptureLog}
          />
        );
      default:
        return (
          <Dashboard
            transactions={transactions}
            categories={categories}
            onEdit={handleEditRequest}
            onDelete={handleDeleteTransaction}
          />
        );
    }
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case AppTab.DASHBOARD:
        return '我的账本';
      case AppTab.STATS:
        return '数据统计';
      case AppTab.ANALYSIS:
        return '资产管理';
      case AppTab.SETTINGS:
        return '设置';
      default:
        return '记账';
    }
  };

  if (storageError && !hasLoadedRef.current) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
      <p role="alert" className="text-danger">{storageError}</p>
      <button onClick={() => window.location.reload()} className="rounded-xl bg-primary px-6 py-3 text-white">重试</button>
    </div>;
  }

  return (
    <div className="min-h-screen bg-background text-primary font-sans relative">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-6 h-16 flex items-center justify-between transition-all">
        <h1 className="text-2xl font-bold tracking-tight text-primary">{getHeaderTitle()}</h1>
      </header>

      <main
        className="max-w-2xl mx-auto p-4 pb-20 min-h-screen animate-fade-in"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        {storageError && <div role="alert" className="mb-4 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">
          <span>{storageError}</span><button onClick={() => setStorageError('')} className="ml-3">关闭</button>
        </div>}
        {renderContent()}
      </main>

      {assetSyncNotice && (
        <div className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg" role="status">
          {assetSyncNotice}
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-lg border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-5 h-16 items-center">
          <NavButton active={activeTab === AppTab.DASHBOARD} onClick={() => setActiveTab(AppTab.DASHBOARD)} icon={LayoutDashboard} />
          <NavButton active={activeTab === AppTab.STATS} onClick={() => setActiveTab(AppTab.STATS)} icon={PieChart} />

          <div className="relative flex items-center justify-center">
            <button
              onClick={() => {
                setEditingTransaction(null);
                setIsAddModalOpen(true);
              }}
              className="absolute -top-6 w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-zinc-200 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
            >
              <Plus className="w-7 h-7" />
            </button>
          </div>

          <NavButton active={activeTab === AppTab.ANALYSIS} onClick={() => setActiveTab(AppTab.ANALYSIS)} icon={BarChart3} />
          <NavButton active={activeTab === AppTab.SETTINGS} onClick={() => setActiveTab(AppTab.SETTINGS)} icon={SettingsIcon} />
        </div>
      </nav>

      <AddTransaction
        isOpen={isAddModalOpen}
        onClose={handleCloseAddModal}
        onAdd={handleAddTransaction}
        onUpdate={handleUpdateTransaction}
        onDelete={handleDeleteTransaction}
        onAddRecurring={handleAddRecurring}
        categories={categories}
        onAddCategory={handleAddCategory}
        editData={editingTransaction}
      />
    </div>
  );
};

const NavButton = ({ active, onClick, icon: Icon }: any) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 ${
      active ? 'text-primary' : 'text-zinc-300 hover:text-zinc-500'
    }`}
  >
    <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 2} />
    {active && <span className="w-1 h-1 bg-primary rounded-full mt-1"></span>}
  </button>
);

export default App;
