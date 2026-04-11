import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, PieChart, Plus, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import {
  AppTab,
  AutoBookkeepingSettings,
  CaptureAttemptLog,
  Category,
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
  captureNativeNow,
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
  saveNativeCategory,
  saveNativeLlmConfig,
  saveNativeRecurringProfile,
  saveNativeSnapshot,
  saveNativeTransaction,
  saveWebSnapshot,
  startNativeCaptureSession,
  testNativeModelConfig,
  stopNativeCaptureSession,
} from './services/walletStore';
import { mergeBackupData } from './services/dataBackup';

const App: React.FC = () => {
  const runningInAndroid = isAndroidNative();
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [pendingEditTransactionId, setPendingEditTransactionId] = useState('');

  const [snapshotMeta, setSnapshotMeta] = useState<Pick<WalletSnapshot, 'storeVersion' | 'migratedFromWebStorage'>>({
    storeVersion: 1,
    migratedFromWebStorage: false,
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [captureLogs, setCaptureLogs] = useState<CaptureAttemptLog[]>([]);
  const [categories, setCategories] = useState<Category[]>(buildDefaultSnapshot().categories);
  const [recurringProfiles, setRecurringProfiles] = useState<RecurringProfile[]>([]);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(buildDefaultSnapshot().llmConfig);
  const [autoBookkeepingSettings, setAutoBookkeepingSettings] = useState<AutoBookkeepingSettings>(defaultAutoBookkeepingSettings());
  const [isInitialized, setIsInitialized] = useState(false);
  const isHydratingRef = useRef(false);

  const applySnapshot = useCallback((snapshot: WalletSnapshot) => {
    setSnapshotMeta({
      storeVersion: snapshot.storeVersion,
      migratedFromWebStorage: snapshot.migratedFromWebStorage,
    });
    setTransactions(snapshot.transactions);
    setCaptureLogs(snapshot.captureLogs);
    setCategories(snapshot.categories);
    setRecurringProfiles(snapshot.recurringProfiles);
    setLlmConfig(snapshot.llmConfig);
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
    const updatedProfiles = profiles.map((profile) => ({ ...profile }));
    let hasUpdates = false;

    updatedProfiles.forEach((profile) => {
      while (profile.nextDueDate <= today) {
        hasUpdates = true;
        newTransactions.push({
          id: uuidv4(),
          amount: profile.amount,
          type: profile.type,
          categoryId: profile.categoryId,
          date: profile.nextDueDate,
          note: `(自动) ${profile.note}`,
          createdBy: 'recurring',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
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
        transactions,
        captureLogs,
        categories,
        recurringProfiles,
        llmConfig,
        autoBookkeepingSettings,
      }),
    [autoBookkeepingSettings, captureLogs, categories, llmConfig, recurringProfiles, snapshotMeta, transactions],
  );

  const refreshNativeSnapshot = useCallback(async () => {
    const snapshot = normalizeSnapshot(await loadNativeSnapshot());
    applySnapshot(snapshot);
  }, [applySnapshot]);

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
        llmConfig: webSnapshot.llmConfig,
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

  const resolveSnapshotOnLoad = useCallback(
    async (snapshot: WalletSnapshot) => {
      const recurringResult = processRecurringTransactions(snapshot.recurringProfiles, snapshot.transactions);
      if (!recurringResult.hasUpdates) {
        return snapshot;
      }

      const updatedSnapshot = normalizeSnapshot({
        ...snapshot,
        transactions: [...recurringResult.newTransactions, ...snapshot.transactions],
        recurringProfiles: recurringResult.updatedProfiles,
      });

      if (runningInAndroid) {
        return saveNativeSnapshot(updatedSnapshot);
      }

      saveWebSnapshot(updatedSnapshot);
      return updatedSnapshot;
    },
    [processRecurringTransactions, runningInAndroid],
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

  useEffect(() => {
    let isMounted = true;
    let captureHandle: { remove: () => Promise<void> } | null = null;
    let statusHandle: { remove: () => Promise<void> } | null = null;
    let deepLinkHandle: { remove: () => Promise<void> } | null = null;

    const initialize = async () => {
      isHydratingRef.current = true;

      try {
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

    setEditingTransaction(targetTransaction);
    setIsAddModalOpen(true);
    setPendingEditTransactionId('');
  }, [pendingEditTransactionId, transactions]);

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
    setEditingTransaction(transaction);
    setIsAddModalOpen(true);
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
    if (mode === 'overwrite' && !window.confirm('警告：覆盖模式将替换现有交易、分类和周期规则。继续吗？')) {
      return;
    }

    const mergedData = mergeBackupData(
      {
        transactions,
        categories,
        recurringProfiles,
      },
      importedData,
      mode,
    );

    const nextSnapshot = normalizeSnapshot({
      ...buildCurrentSnapshot(),
      transactions: mergedData.transactions,
      categories: mergedData.categories,
      recurringProfiles: mergedData.recurringProfiles,
    });

    if (runningInAndroid) {
      applySnapshot(await saveNativeSnapshot(nextSnapshot));
    } else {
      applySnapshot(nextSnapshot);
    }

    alert(
      mode === 'overwrite'
        ? `成功恢复 ${mergedData.transactions.length} 条交易和 ${mergedData.categories.length} 个分类。`
        : `成功追加 ${importedData.transactions.length} 条交易，并合并 ${importedData.categories.length} 个分类。`,
    );
  };

  const handleUpdateLLMConfig = async (config: LLMConfig) => {
    if (runningInAndroid) {
      applySnapshot(await saveNativeLlmConfig(config));
      return;
    }

    setLlmConfig(config);
  };

  const handleStartCaptureSession = async () => {
    if (!runningInAndroid) {
      return;
    }

    const status = await startNativeCaptureSession();
    setAutoBookkeepingSettings((previous) => ({
      ...previous,
      ...status,
    }));
  };

  const handleStopCaptureSession = async () => {
    if (!runningInAndroid) {
      return;
    }

    const status = await stopNativeCaptureSession();
    setAutoBookkeepingSettings((previous) => ({
      ...previous,
      ...status,
    }));
  };

  const handleCaptureNow = async () => {
    if (!runningInAndroid) {
      return;
    }

    const status = await captureNativeNow();
    setAutoBookkeepingSettings((previous) => ({
      ...previous,
      ...status,
    }));
  };

  const handleTestModelConfig = async (): Promise<LLMConfigTestResult> => testNativeModelConfig();

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
        return <Analysis transactions={transactions} categories={categories} />;
      case AppTab.SETTINGS:
        return (
          <Settings
            transactions={transactions}
            categories={categories}
            recurringProfiles={recurringProfiles}
            llmConfig={llmConfig}
            autoBookkeepingSettings={autoBookkeepingSettings}
            captureLogs={captureLogs}
            onUpdateLLMConfig={handleUpdateLLMConfig}
            onImport={handleImportBackup}
            onDeleteRecurring={handleDeleteRecurring}
            onStartCaptureSession={handleStartCaptureSession}
            onStopCaptureSession={handleStopCaptureSession}
            onCaptureNow={handleCaptureNow}
            onTestModelConfig={handleTestModelConfig}
            onRefreshAutoBookkeepingStatus={refreshAutoBookkeepingStatus}
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
        return '财务分析';
      case AppTab.SETTINGS:
        return '设置';
      default:
        return '记账';
    }
  };

  return (
    <div className="min-h-screen bg-background text-primary font-sans relative">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-6 h-16 flex items-center justify-between transition-all">
        <h1 className="text-2xl font-bold tracking-tight text-primary">{getHeaderTitle()}</h1>
      </header>

      <main
        className="max-w-2xl mx-auto p-4 pb-20 min-h-screen animate-fade-in"
        style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
      >
        {renderContent()}
      </main>

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
