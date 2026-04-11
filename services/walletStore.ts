import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

import { DEFAULT_CATEGORIES, mergeDefaultCategories } from '../constants';
import {
  AutoBookkeepingSettings,
  CaptureAttemptLog,
  Category,
  LLMConfig,
  LLMConfigTestResult,
  RecurringProfile,
  Transaction,
  WalletSnapshot,
} from '../types';
import { normalizeCategoryState } from './categoryState';

const STORAGE_KEYS = {
  transactions: 'smartwallet_transactions',
  captureLogs: 'smartwallet_capture_logs',
  categories: 'smartwallet_categories',
  recurringProfiles: 'smartwallet_recurring',
  llmConfig: 'smartwallet_llm_config',
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
}

interface ScreenCaptureBookkeepingPlugin {
  getStatus(): Promise<AutoBookkeepingSettings>;
  startSession(): Promise<AutoBookkeepingSettings>;
  stopSession(): Promise<AutoBookkeepingSettings>;
  captureNow(): Promise<AutoBookkeepingSettings>;
  testModelConfig(): Promise<LLMConfigTestResult>;
  consumePendingDeepLink(): Promise<{ url?: string }>;
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

export const DEFAULT_CAPTURE_PROMPT = [
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

export const defaultLlmConfig = (): LLMConfig => ({
  apiKey: '',
  baseUrl: '',
  modelName: '',
  timeoutMs: 20000,
  capturePrompt: DEFAULT_CAPTURE_PROMPT,
});

export const defaultAutoBookkeepingSettings = (): AutoBookkeepingSettings => ({
  sessionActive: false,
  notificationPermissionGranted: false,
  lastCaptureAt: 0,
  lastError: '',
});

export const buildDefaultSnapshot = (): WalletSnapshot => ({
  storeVersion: 1,
  migratedFromWebStorage: false,
  transactions: [],
  captureLogs: [],
  categories: DEFAULT_CATEGORIES,
  recurringProfiles: [],
  llmConfig: defaultLlmConfig(),
  autoBookkeepingSettings: defaultAutoBookkeepingSettings(),
});

const normalizeLlmConfig = (llmConfig?: Partial<LLMConfig> | null): LLMConfig => {
  const defaults = defaultLlmConfig();
  const merged = llmConfig ?? {};
  const capturePrompt =
    typeof merged.capturePrompt === 'string' && merged.capturePrompt.trim().length > 0
      ? merged.capturePrompt
      : DEFAULT_CAPTURE_PROMPT;

  return {
    apiKey: typeof merged.apiKey === 'string' ? merged.apiKey : defaults.apiKey,
    baseUrl: typeof merged.baseUrl === 'string' ? merged.baseUrl : defaults.baseUrl,
    modelName: typeof merged.modelName === 'string' ? merged.modelName : defaults.modelName,
    timeoutMs: typeof merged.timeoutMs === 'number' ? merged.timeoutMs : defaults.timeoutMs,
    capturePrompt: capturePrompt === LEGACY_CAPTURE_PROMPT ? DEFAULT_CAPTURE_PROMPT : capturePrompt,
  };
};

const normalizeCaptureLogs = (captureLogs?: CaptureAttemptLog[] | null) =>
  Array.isArray(captureLogs)
    ? [...captureLogs].sort(
        (left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime(),
      )
    : [];

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
    llmConfig: normalizeLlmConfig(parseStoredValue<Partial<LLMConfig>>(STORAGE_KEYS.llmConfig, {})),
    autoBookkeepingSettings: {
      ...snapshot.autoBookkeepingSettings,
      ...parseStoredValue<Partial<AutoBookkeepingSettings>>(STORAGE_KEYS.autoBookkeepingSettings, {}),
    },
  };
};

export const saveWebSnapshot = (snapshot: WalletSnapshot) => {
  localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(snapshot.transactions));
  localStorage.setItem(STORAGE_KEYS.captureLogs, JSON.stringify(snapshot.captureLogs));
  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(snapshot.categories));
  localStorage.setItem(STORAGE_KEYS.recurringProfiles, JSON.stringify(snapshot.recurringProfiles));
  localStorage.setItem(STORAGE_KEYS.llmConfig, JSON.stringify(snapshot.llmConfig));
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
    llmConfig: normalizeLlmConfig(snapshot?.llmConfig ?? {}),
    autoBookkeepingSettings: {
      ...defaults.autoBookkeepingSettings,
      ...(snapshot?.autoBookkeepingSettings ?? {}),
    },
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

export const getNativeAutoBookkeepingStatus = async () => {
  if (!isAndroidNative()) {
    return defaultAutoBookkeepingSettings();
  }

  return {
    ...defaultAutoBookkeepingSettings(),
    ...(await ScreenCaptureBookkeeping.getStatus()),
  };
};

export const startNativeCaptureSession = async () => {
  if (!isAndroidNative()) {
    return defaultAutoBookkeepingSettings();
  }

  return {
    ...defaultAutoBookkeepingSettings(),
    ...(await ScreenCaptureBookkeeping.startSession()),
  };
};

export const stopNativeCaptureSession = async () => {
  if (!isAndroidNative()) {
    return defaultAutoBookkeepingSettings();
  }

  return {
    ...defaultAutoBookkeepingSettings(),
    ...(await ScreenCaptureBookkeeping.stopSession()),
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
