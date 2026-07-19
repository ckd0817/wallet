import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

import { DEFAULT_CATEGORIES, mergeDefaultCategories } from '../constants';
import {
  AutoBookkeepingSettings,
  AppSettings,
  AssetHolding,
  AssetPerformanceSnapshot,
  AssetQuote,
  AssetRecurringPlan,
  AssetScreenshotAnalysisResult,
  AssetTradeRecord,
  CaptureAttemptLog,
  Category,
  LLMConfig,
  LLMConfigTestResult,
  RecurringProfile,
  Transaction,
  WalletSnapshot,
} from '../types';
import {
  normalizeAssetHolding,
  normalizeAssetPerformanceSnapshot,
  normalizeAssetQuote,
  parseFundQuoteResponse,
  parseTencentStockQuoteResponse,
} from './assetEngine';
import { normalizeCategoryState } from './categoryState';

const STORAGE_KEYS = {
  transactions: 'smartwallet_transactions',
  captureLogs: 'smartwallet_capture_logs',
  categories: 'smartwallet_categories',
  recurringProfiles: 'smartwallet_recurring',
  assetHoldings: 'smartwallet_asset_holdings',
  assetQuoteCache: 'smartwallet_asset_quote_cache',
  assetRecurringPlans: 'smartwallet_asset_recurring_plans',
  assetPerformanceHistory: 'smartwallet_asset_performance_history',
  assetTradeRecords: 'smartwallet_asset_trade_records',
  llmConfig: 'smartwallet_llm_config',
  appSettings: 'smartwallet_app_settings',
  autoBookkeepingSettings: 'smartwallet_auto_bookkeeping',
} as const;

interface WalletDataPlugin {
  loadSnapshot(): Promise<WalletSnapshot>;
  saveSnapshot(options: { snapshot: WalletSnapshot }): Promise<WalletSnapshot>;
  upsertTransaction(options: { transaction: Transaction }): Promise<WalletSnapshot>;
  deleteTransaction(options: { id: string }): Promise<WalletSnapshot>;
  replaceTransactions(options: { transactions: Transaction[] }): Promise<WalletSnapshot>;
  upsertCategory(options: { category: Category }): Promise<WalletSnapshot>;
  upsertRecurringProfile(options: { recurringProfile: RecurringProfile }): Promise<WalletSnapshot>;
  deleteRecurringProfile(options: { id: string }): Promise<WalletSnapshot>;
  saveLlmConfig(options: { llmConfig: LLMConfig }): Promise<WalletSnapshot>;
  upsertAssetHolding(options: { assetHolding: AssetHolding }): Promise<WalletSnapshot>;
  deleteAssetHolding(options: { id: string }): Promise<WalletSnapshot>;
  syncAssetQuotes(options: { assetHoldings: AssetHolding[] }): Promise<{ quotes: AssetQuote[] }>;
  analyzeAssetScreenshot(options: { imageBase64: string }): Promise<AssetScreenshotAnalysisResult>;
}

interface ScreenCaptureBookkeepingPlugin {
  getStatus(): Promise<AutoBookkeepingSettings>;
  openAccessibilitySettings(): Promise<AutoBookkeepingSettings>;
  captureNow(): Promise<AutoBookkeepingSettings>;
  retryCaptureLog(options: { logId: string }): Promise<AutoBookkeepingSettings>;
  testModelConfig(): Promise<LLMConfigTestResult>;
  consumePendingDeepLink(): Promise<{ url?: string }>;
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  requestIgnoreBatteryOptimization(): Promise<{ ignoring?: boolean }>;
  addListener(
    eventName: 'captureRecorded' | 'statusChanged' | 'deepLinkReceived',
    listenerFunc: (payload: { transaction?: Transaction; status?: AutoBookkeepingSettings; url?: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const WalletData = registerPlugin<WalletDataPlugin>('WalletData');
const ScreenCaptureBookkeeping = registerPlugin<ScreenCaptureBookkeepingPlugin>('ScreenCaptureBookkeeping');

export const isAndroidNative = () => Capacitor.getPlatform() === 'android';

const LEGACY_CAPTURE_PROMPT = [
  '你正在分析一张支付结果页截图。',
  '今天的本地日期是 {{today_date}}。在推断 occurredAt 时优先使用这个日期；只有截图里明确出现其他日期时，才使用截图中的日期。',
  '只支持“支出类支付成功页”。如果截图不是支付成功结果页，或者是收入、退款、转账等非支出场景，请返回 supported=false。',
  '必须且只能从这些支出分类中选择一个 categoryId：{{expense_categories}}。',
  '只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {"supported":true|false,"transactionType":"expense|income|refund|unknown","amount":number,"merchantName":"...","occurredAt":"YYYY-MM-DD","categoryId":"...","note":"...","confidence":0-1,"summary":"..."}。',
].join('\n');

const PREVIOUS_DEFAULT_CAPTURE_PROMPT = [
  '你正在分析一张付款、收款或退款结果截图。',
  '今天的本地日期是 {{today_date}}。在推断 occurredAt 时优先使用这个日期；只有截图里明确出现其他日期时，才使用截图中的日期。',
  '你只能识别两种交易类型：expense 或 income。',
  '付款成功、消费支出、扣款成功等记为 expense。',
  '收款到账、退款到账、报销到账等记为 income。',
  '如果截图不足以确认是一笔有效入账记录，或者无法确认金额，就仍然只返回 JSON，并将 amount 设为 0，categoryId 设为空字符串，summary 写明原因。',
  '如果 transactionType=expense，categoryId 必须且只能从这些支出分类中选择：{{expense_categories}}。',
  '如果 transactionType=income，categoryId 必须且只能从这些收入分类中选择：{{income_categories}}。',
  '只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {"transactionType":"expense|income","amount":number,"merchantName":"...","occurredAt":"YYYY-MM-DD","categoryId":"...","note":"...","summary":"..."}。',
].join('\n');

const SUMMARY_CAPTURE_PROMPT = [
  '你正在分析一张付款、收款或退款结果截图。',
  '今天的本地日期是 {{today_date}}。在推断 occurredAt 时优先使用这个日期；只有截图里明确出现其他日期时，才使用截图中的日期。',
  '你只能识别两种交易类型：expense 或 income。',
  '付款成功、消费支出、扣款成功等记为 expense。',
  '收款到账、退款到账、报销到账等记为 income。',
  '如果截图不足以确认是一笔有效入账记录，或者无法确认金额，就仍然只返回 JSON，并将 amount 设为 0，categoryId 设为空字符串，summary 写明原因。',
  '如果截图里同时出现多笔支出记录，优先记录最新的一条，不要同时输出两条或多条记录。',
  '如果 transactionType=expense，categoryId 必须且只能从这些支出分类中选择：{{expense_categories}}。',
  '如果 transactionType=income，categoryId 必须且只能从这些收入分类中选择：{{income_categories}}。',
  '只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {"transactionType":"expense|income","amount":number,"merchantName":"...","occurredAt":"YYYY-MM-DD","categoryId":"...","note":"...","summary":"..."}。',
].join('\n');

export const DEFAULT_CAPTURE_PROMPT = [
  '你正在分析一张付款、收款或退款结果截图。',
  '今天的本地日期是 {{today_date}}。在推断 occurredAt 时优先使用这个日期；只有截图里明确出现其他日期时，才使用截图中的日期。',
  '你只能识别两种交易类型：expense 或 income。',
  '付款成功、消费支出、扣款成功等记为 expense。',
  '收款到账、退款到账、报销到账等记为 income。',
  'note 只写一条简短备注，包含原来需要放在摘要里的关键信息，不要再额外输出 summary。',
  '如果截图里出现取餐号、取餐码、餐号、柜号、口令等用于取餐的号码或短码，写入 pickupCode；没有就写空字符串。',
  '如果截图不足以确认是一笔有效入账记录，或者无法确认金额，就仍然只返回 JSON，并将 amount 设为 0，categoryId 设为空字符串，note 写明原因。',
  '如果截图里同时出现多笔支出记录，优先记录最新的一条，不要同时输出两条或多条记录。',
  '如果 transactionType=expense，categoryId 必须且只能从这些支出分类中选择：{{expense_categories}}。',
  '如果 transactionType=income，categoryId 必须且只能从这些收入分类中选择：{{income_categories}}。',
  '只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {"transactionType":"expense|income","amount":number,"merchantName":"...","occurredAt":"YYYY-MM-DD","categoryId":"...","note":"...","pickupCode":"..."}。',
].join('\n');

export const defaultLlmConfig = (): LLMConfig => ({
  apiKey: '',
  baseUrl: '',
  modelName: '',
  timeoutMs: 20000,
  capturePrompt: DEFAULT_CAPTURE_PROMPT,
});

export const defaultAutoBookkeepingSettings = (): AutoBookkeepingSettings => ({
  accessibilityEnabled: false,
  notificationPermissionGranted: false,
  lastCaptureAt: 0,
  lastError: '',
});

export const defaultAppSettings = (): AppSettings => ({
  expenseAverageMonths: 1,
});

export const buildDefaultSnapshot = (): WalletSnapshot => ({
  storeVersion: 1,
  migratedFromWebStorage: false,
  transactions: [],
  captureLogs: [],
  categories: DEFAULT_CATEGORIES,
  recurringProfiles: [],
  assetHoldings: [],
  assetQuoteCache: [],
  assetRecurringPlans: [],
  assetPerformanceHistory: [],
  assetTradeRecords: [],
  llmConfig: defaultLlmConfig(),
  appSettings: defaultAppSettings(),
  autoBookkeepingSettings: defaultAutoBookkeepingSettings(),
});

const normalizeLlmConfig = (llmConfig?: Partial<LLMConfig> | null): LLMConfig => {
  const defaults = defaultLlmConfig();
  const merged = llmConfig ?? {};
  const capturePrompt =
    typeof merged.capturePrompt === 'string' && merged.capturePrompt.trim().length > 0
      ? merged.capturePrompt
      : DEFAULT_CAPTURE_PROMPT;
  const normalizedCapturePrompt = capturePrompt.trim();

  return {
    apiKey: typeof merged.apiKey === 'string' ? merged.apiKey : defaults.apiKey,
    baseUrl: typeof merged.baseUrl === 'string' ? merged.baseUrl : defaults.baseUrl,
    modelName: typeof merged.modelName === 'string' ? merged.modelName : defaults.modelName,
    timeoutMs: typeof merged.timeoutMs === 'number' ? merged.timeoutMs : defaults.timeoutMs,
    capturePrompt:
      normalizedCapturePrompt === LEGACY_CAPTURE_PROMPT ||
      normalizedCapturePrompt === PREVIOUS_DEFAULT_CAPTURE_PROMPT ||
      normalizedCapturePrompt === SUMMARY_CAPTURE_PROMPT
        ? DEFAULT_CAPTURE_PROMPT
        : capturePrompt,
  };
};

const normalizeCaptureLogs = (captureLogs?: CaptureAttemptLog[] | null) =>
  Array.isArray(captureLogs)
    ? [...captureLogs].sort(
        (left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime(),
      )
    : [];

const normalizeAssetHoldings = (assetHoldings?: AssetHolding[] | null) =>
  Array.isArray(assetHoldings)
    ? assetHoldings.map((holding) => normalizeAssetHolding(holding)).filter((holding): holding is AssetHolding => Boolean(holding))
    : [];

const normalizeAssetQuotes = (assetQuotes?: AssetQuote[] | null) =>
  Array.isArray(assetQuotes)
    ? assetQuotes.map((quote) => normalizeAssetQuote(quote)).filter((quote): quote is AssetQuote => Boolean(quote))
    : [];

const normalizeAssetRecurringPlans = (assetRecurringPlans?: AssetRecurringPlan[] | null) =>
  Array.isArray(assetRecurringPlans)
    ? assetRecurringPlans
        .filter((plan) => plan && typeof plan.holdingId === 'string' && plan.holdingId)
        .map((plan) => ({
          id: typeof plan.id === 'string' && plan.id ? plan.id : `${plan.holdingId}-${Date.now()}`,
          holdingId: plan.holdingId,
          amount: typeof plan.amount === 'number' && Number.isFinite(plan.amount) ? Math.max(0, plan.amount) : 0,
          frequency: plan.frequency === 'daily' || plan.frequency === 'weekly' || plan.frequency === 'monthly' ? plan.frequency : 'monthly',
          startDate: typeof plan.startDate === 'string' && plan.startDate ? plan.startDate : new Date().toISOString().split('T')[0],
          nextDueDate: typeof plan.nextDueDate === 'string' && plan.nextDueDate ? plan.nextDueDate : new Date().toISOString().split('T')[0],
          enabled: typeof plan.enabled === 'boolean' ? plan.enabled : true,
          createdAt: typeof plan.createdAt === 'string' && plan.createdAt ? plan.createdAt : new Date().toISOString(),
          updatedAt: typeof plan.updatedAt === 'string' && plan.updatedAt ? plan.updatedAt : new Date().toISOString(),
        }))
    : [];

const normalizeAssetPerformanceHistory = (assetPerformanceHistory?: AssetPerformanceSnapshot[] | null) =>
  Array.isArray(assetPerformanceHistory)
    ? assetPerformanceHistory
        .map((snapshot) => normalizeAssetPerformanceSnapshot(snapshot))
        .filter((snapshot): snapshot is AssetPerformanceSnapshot => Boolean(snapshot))
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-370)
    : [];

const normalizeAssetTradeRecords = (assetTradeRecords?: AssetTradeRecord[] | null) =>
  Array.isArray(assetTradeRecords)
    ? assetTradeRecords
        .filter((record) => record && typeof record.holdingId === 'string' && record.holdingId)
        .map((record) => {
          const shares = typeof record.shares === 'number' && Number.isFinite(record.shares) ? Math.max(0, record.shares) : 0;
          const amount = typeof record.amount === 'number' && Number.isFinite(record.amount) ? Math.max(0, record.amount) : 0;
          return {
            id: typeof record.id === 'string' && record.id ? record.id : `${record.holdingId}-${Date.now()}`,
            holdingId: record.holdingId,
            assetType: record.assetType === 'stock' ? 'stock' : 'fund',
            code: typeof record.code === 'string' ? record.code : '',
            name: typeof record.name === 'string' ? record.name : '',
            tradeType:
              record.tradeType === 'sell' || record.tradeType === 'recurring' || record.tradeType === 'buy'
                ? record.tradeType
                : 'buy',
            source: record.source === 'recurring' ? 'recurring' : 'manual',
            status: record.status === 'pending' ? 'pending' : 'completed',
            recurringPlanId: typeof record.recurringPlanId === 'string' && record.recurringPlanId ? record.recurringPlanId : undefined,
            shares,
            amount,
            price:
              typeof record.price === 'number' && Number.isFinite(record.price)
                ? Math.max(0, record.price)
                : shares > 0
                  ? amount / shares
                  : 0,
            occurredAt:
              typeof record.occurredAt === 'string' && record.occurredAt ? record.occurredAt : new Date().toISOString(),
            createdAt:
              typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : new Date().toISOString(),
            settledAt:
              typeof record.settledAt === 'string' && record.settledAt ? record.settledAt : undefined,
            priceSource:
              record.priceSource === 'estimated' || record.priceSource === 'confirmed' || record.priceSource === 'manual'
                ? record.priceSource
                : undefined,
          } satisfies AssetTradeRecord;
        })
        .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    : [];

const normalizeAutoBookkeepingSettings = (
  autoBookkeepingSettings?: Partial<AutoBookkeepingSettings> | Record<string, unknown> | null,
): AutoBookkeepingSettings => {
  const defaults = defaultAutoBookkeepingSettings();
  const merged = autoBookkeepingSettings ?? {};

  return {
    accessibilityEnabled:
      typeof merged.accessibilityEnabled === 'boolean' ? merged.accessibilityEnabled : defaults.accessibilityEnabled,
    notificationPermissionGranted:
      typeof merged.notificationPermissionGranted === 'boolean'
        ? merged.notificationPermissionGranted
        : defaults.notificationPermissionGranted,
    lastCaptureAt: typeof merged.lastCaptureAt === 'number' ? merged.lastCaptureAt : defaults.lastCaptureAt,
    lastError: typeof merged.lastError === 'string' ? merged.lastError : defaults.lastError,
  };
};

const normalizeAppSettings = (appSettings?: Partial<AppSettings> | Record<string, unknown> | null): AppSettings => {
  const months = appSettings?.expenseAverageMonths;
  return {
    expenseAverageMonths:
      typeof months === 'number' && Number.isInteger(months) ? Math.min(12, Math.max(1, months)) : 1,
  };
};

const parseStoredValue = <T>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Failed to parse ${key}`, error);
    return fallback;
  }
};

export const loadWebSnapshot = (): WalletSnapshot => {
  const snapshot = buildDefaultSnapshot();
  const storedCategories = parseStoredValue<Category[]>(STORAGE_KEYS.categories, snapshot.categories);

  return {
    ...snapshot,
    migratedFromWebStorage: true,
    transactions: parseStoredValue<Transaction[]>(STORAGE_KEYS.transactions, []),
    captureLogs: normalizeCaptureLogs(parseStoredValue<CaptureAttemptLog[]>(STORAGE_KEYS.captureLogs, [])),
    categories: mergeDefaultCategories(storedCategories),
    recurringProfiles: parseStoredValue<RecurringProfile[]>(STORAGE_KEYS.recurringProfiles, []),
    assetHoldings: normalizeAssetHoldings(parseStoredValue<AssetHolding[]>(STORAGE_KEYS.assetHoldings, [])),
    assetQuoteCache: normalizeAssetQuotes(parseStoredValue<AssetQuote[]>(STORAGE_KEYS.assetQuoteCache, [])),
    assetRecurringPlans: normalizeAssetRecurringPlans(parseStoredValue<AssetRecurringPlan[]>(STORAGE_KEYS.assetRecurringPlans, [])),
    assetPerformanceHistory: normalizeAssetPerformanceHistory(
      parseStoredValue<AssetPerformanceSnapshot[]>(STORAGE_KEYS.assetPerformanceHistory, []),
    ),
    assetTradeRecords: normalizeAssetTradeRecords(parseStoredValue<AssetTradeRecord[]>(STORAGE_KEYS.assetTradeRecords, [])),
    llmConfig: normalizeLlmConfig(parseStoredValue<Partial<LLMConfig>>(STORAGE_KEYS.llmConfig, {})),
    appSettings: normalizeAppSettings(parseStoredValue<Record<string, unknown>>(STORAGE_KEYS.appSettings, {})),
    autoBookkeepingSettings: normalizeAutoBookkeepingSettings(
      parseStoredValue<Record<string, unknown>>(STORAGE_KEYS.autoBookkeepingSettings, {}),
    ),
  };
};

export const saveWebSnapshot = (snapshot: WalletSnapshot) => {
  localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(snapshot.transactions));
  localStorage.setItem(STORAGE_KEYS.captureLogs, JSON.stringify(snapshot.captureLogs));
  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(snapshot.categories));
  localStorage.setItem(STORAGE_KEYS.recurringProfiles, JSON.stringify(snapshot.recurringProfiles));
  localStorage.setItem(STORAGE_KEYS.assetHoldings, JSON.stringify(snapshot.assetHoldings));
  localStorage.setItem(STORAGE_KEYS.assetQuoteCache, JSON.stringify(snapshot.assetQuoteCache));
  localStorage.setItem(STORAGE_KEYS.assetRecurringPlans, JSON.stringify(snapshot.assetRecurringPlans));
  localStorage.setItem(STORAGE_KEYS.assetPerformanceHistory, JSON.stringify(snapshot.assetPerformanceHistory));
  localStorage.setItem(STORAGE_KEYS.assetTradeRecords, JSON.stringify(snapshot.assetTradeRecords));
  localStorage.setItem(STORAGE_KEYS.llmConfig, JSON.stringify(snapshot.llmConfig));
  localStorage.setItem(STORAGE_KEYS.appSettings, JSON.stringify(snapshot.appSettings));
  localStorage.setItem(STORAGE_KEYS.autoBookkeepingSettings, JSON.stringify(snapshot.autoBookkeepingSettings));
};

export const hasLegacyWebStorage = () =>
  Object.values(STORAGE_KEYS).some((key) => localStorage.getItem(key) !== null);

export const normalizeSnapshot = (snapshot?: Partial<WalletSnapshot> | null): WalletSnapshot => {
  const defaults = buildDefaultSnapshot();
  const normalizedCategoryState = normalizeCategoryState({
    categories: snapshot?.categories ?? defaults.categories,
    transactions: snapshot?.transactions ?? defaults.transactions,
    recurringProfiles: snapshot?.recurringProfiles ?? defaults.recurringProfiles,
  });

  return {
    ...defaults,
    ...snapshot,
    transactions: normalizedCategoryState.transactions,
    captureLogs: normalizeCaptureLogs(snapshot?.captureLogs ?? defaults.captureLogs),
    categories: normalizedCategoryState.categories,
    recurringProfiles: normalizedCategoryState.recurringProfiles,
    assetHoldings: normalizeAssetHoldings(snapshot?.assetHoldings ?? defaults.assetHoldings),
    assetQuoteCache: normalizeAssetQuotes(snapshot?.assetQuoteCache ?? defaults.assetQuoteCache),
    assetRecurringPlans: normalizeAssetRecurringPlans(snapshot?.assetRecurringPlans ?? defaults.assetRecurringPlans),
    assetPerformanceHistory: normalizeAssetPerformanceHistory(
      snapshot?.assetPerformanceHistory ?? defaults.assetPerformanceHistory,
    ),
    assetTradeRecords: normalizeAssetTradeRecords(snapshot?.assetTradeRecords ?? defaults.assetTradeRecords),
    llmConfig: normalizeLlmConfig(snapshot?.llmConfig ?? {}),
    appSettings: normalizeAppSettings(snapshot?.appSettings ?? {}),
    autoBookkeepingSettings: normalizeAutoBookkeepingSettings(snapshot?.autoBookkeepingSettings ?? {}),
  };
};

export const loadNativeSnapshot = async () => normalizeSnapshot(await WalletData.loadSnapshot());

export const saveNativeSnapshot = async (snapshot: WalletSnapshot) =>
  normalizeSnapshot(await WalletData.saveSnapshot({ snapshot }));

export const saveNativeTransaction = async (transaction: Transaction) =>
  normalizeSnapshot(await WalletData.upsertTransaction({ transaction }));

export const deleteNativeTransaction = async (id: string) =>
  normalizeSnapshot(await WalletData.deleteTransaction({ id }));

export const replaceNativeTransactions = async (transactions: Transaction[]) =>
  normalizeSnapshot(await WalletData.replaceTransactions({ transactions }));

export const saveNativeRecurringProfile = async (recurringProfile: RecurringProfile) =>
  normalizeSnapshot(await WalletData.upsertRecurringProfile({ recurringProfile }));

export const deleteNativeRecurringProfile = async (id: string) =>
  normalizeSnapshot(await WalletData.deleteRecurringProfile({ id }));

export const saveNativeCategory = async (category: Category) =>
  normalizeSnapshot(await WalletData.upsertCategory({ category }));

export const saveNativeLlmConfig = async (llmConfig: LLMConfig) =>
  normalizeSnapshot(await WalletData.saveLlmConfig({ llmConfig }));

export const saveNativeAssetHolding = async (assetHolding: AssetHolding) =>
  normalizeSnapshot(await WalletData.upsertAssetHolding({ assetHolding }));

export const deleteNativeAssetHolding = async (id: string) =>
  normalizeSnapshot(await WalletData.deleteAssetHolding({ id }));

export const syncNativeAssetQuotes = async (assetHoldings: AssetHolding[]) => {
  const result = await WalletData.syncAssetQuotes({ assetHoldings });
  return normalizeAssetQuotes(result.quotes);
};

export const analyzeNativeAssetScreenshot = async (imageBase64: string): Promise<AssetScreenshotAnalysisResult> =>
  WalletData.analyzeAssetScreenshot({ imageBase64 });

export const syncWebAssetQuotes = async (assetHoldings: AssetHolding[]) => {
  const syncedAt = new Date().toISOString();
  const quotes: AssetQuote[] = [];
  const stocks = assetHoldings.filter((holding) => holding.assetType === 'stock');
  const funds = assetHoldings.filter((holding) => holding.assetType === 'fund');

  if (stocks.length > 0 || assetHoldings.length > 0) {
    const stockTargets = stocks.map((holding) => `${holding.market}${holding.code}`);
    const query = [...stockTargets, 'sh000001'].join(',');
    const response = await fetch(`https://qt.gtimg.cn/q=${encodeURIComponent(query)}`);
    quotes.push(...parseTencentStockQuoteResponse(await response.text(), syncedAt));
  }

  for (const holding of funds) {
    const response = await fetch(`https://fundgz.1234567.com.cn/js/${holding.code}.js?rt=${Date.now()}`);
    const quote = parseFundQuoteResponse(await response.text(), syncedAt);
    if (quote) {
      quotes.push(quote);
    }
  }

  return normalizeAssetQuotes(quotes);
};

export const getNativeAutoBookkeepingStatus = async () => {
  if (!isAndroidNative()) {
    return defaultAutoBookkeepingSettings();
  }

  return {
    ...defaultAutoBookkeepingSettings(),
    ...(await ScreenCaptureBookkeeping.getStatus()),
  };
};

export const openNativeAccessibilitySettings = async () => {
  if (!isAndroidNative()) {
    return defaultAutoBookkeepingSettings();
  }

  return {
    ...defaultAutoBookkeepingSettings(),
    ...(await ScreenCaptureBookkeeping.openAccessibilitySettings()),
  };
};

export const captureNativeNow = async () => {
  if (!isAndroidNative()) {
    return defaultAutoBookkeepingSettings();
  }

  return {
    ...defaultAutoBookkeepingSettings(),
    ...(await ScreenCaptureBookkeeping.captureNow()),
  };
};

export const retryNativeCaptureLog = async (logId: string) => {
  if (!isAndroidNative()) {
    return defaultAutoBookkeepingSettings();
  }

  return {
    ...defaultAutoBookkeepingSettings(),
    ...(await ScreenCaptureBookkeeping.retryCaptureLog({ logId })),
  };
};

export const testNativeModelConfig = async (): Promise<LLMConfigTestResult> => {
  if (!isAndroidNative()) {
    return {
      ok: false,
      message: '当前环境不支持原生模型测试',
      elapsedMs: 0,
      httpStatus: 0,
      endpoint: '',
      modelName: '',
      assistantReplyRaw: '',
      responseBodyRaw: '',
      failureStage: 'platform',
    };
  }

  const result = await ScreenCaptureBookkeeping.testModelConfig();
  return {
    ok: false,
    message: '',
    elapsedMs: 0,
    httpStatus: 0,
    endpoint: '',
    modelName: '',
    assistantReplyRaw: '',
    responseBodyRaw: '',
    failureStage: '',
    ...result,
  };
};

export const consumePendingNativeDeepLink = async () => {
  if (!isAndroidNative()) {
    return '';
  }

  const { url } = await ScreenCaptureBookkeeping.consumePendingDeepLink();
  return url ?? '';
};

export const isNativeIgnoringBatteryOptimizations = async (): Promise<boolean> => {
  if (!isAndroidNative()) {
    return true;
  }

  const { ignoring } = await ScreenCaptureBookkeeping.isIgnoringBatteryOptimizations();
  return ignoring;
};

export const requestNativeIgnoreBatteryOptimization = async (): Promise<boolean> => {
  if (!isAndroidNative()) {
    return true;
  }

  await ScreenCaptureBookkeeping.requestIgnoreBatteryOptimization();
  return isNativeIgnoringBatteryOptimizations();
};

export const addNativeCaptureListener = async (
  listener: (transaction?: Transaction) => void,
): Promise<PluginListenerHandle | null> => {
  if (!isAndroidNative()) {
    return null;
  }

  return ScreenCaptureBookkeeping.addListener('captureRecorded', ({ transaction }) => listener(transaction));
};

export const addNativeStatusListener = async (
  listener: (status?: AutoBookkeepingSettings) => void,
): Promise<PluginListenerHandle | null> => {
  if (!isAndroidNative()) {
    return null;
  }

  return ScreenCaptureBookkeeping.addListener('statusChanged', ({ status }) => listener(status));
};

export const addNativeDeepLinkListener = async (
  listener: (url?: string) => void,
): Promise<PluginListenerHandle | null> => {
  if (!isAndroidNative()) {
    return null;
  }

  return ScreenCaptureBookkeeping.addListener('deepLinkReceived', ({ url }) => listener(url));
};
