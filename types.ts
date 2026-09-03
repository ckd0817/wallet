export type TransactionType = 'expense' | 'income';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
}

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  date: string; // ISO string
  note: string;
  createdBy?: 'manual' | 'recurring' | 'screenshot_capture';
  merchantName?: string;
  pickupCode?: string;
  sourcePackage?: string;
  needsReview?: boolean;
  captureSummary?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CaptureAttemptStatus = 'processing' | 'success' | 'failed';

export interface CaptureAttemptLog {
  id: string;
  capturedAt: string;
  status: CaptureAttemptStatus;
  failureStage?: string;
  failureReason?: string;
  imagePath: string;
  assistantReplyRaw?: string;
  assistantReplyParsed?: Record<string, unknown> | null;
  httpStatus?: number;
  responseBodyRaw?: string;
  transactionId?: string;
  summary?: string;
  merchantName?: string;
  pickupCode?: string;
  amount?: number;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringProfile {
  id: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  note: string;
  frequency: RecurringFrequency;
  startDate: string;
  nextDueDate: string;
}

export type AssetType = 'stock' | 'fund';
export type AssetQuoteType = AssetType | 'index';
export type AssetMarket = 'sh' | 'sz' | 'fund' | 'us';
export type AssetCurrency = 'CNY' | 'USD';
export type AssetRecurringFrequency = 'daily' | 'weekly' | 'monthly';
export type AssetTradeType = 'buy' | 'sell' | 'recurring';
export type AssetTradeSource = 'manual' | 'recurring';
export type AssetQuotePriceSource = 'estimated' | 'confirmed';
export type AssetTradeStatus = 'pending' | 'completed';
export type FundQuoteSource = 'eastmoney' | 'sina' | 'tencent' | 'legacy';
export type FundQuoteSourceOption = FundQuoteSource;

export interface FundQuoteSourceTestResult {
  source: FundQuoteSourceOption;
  ok: boolean;
  message: string;
  quoteTime?: string;
}

export interface AssetHolding {
  id: string;
  assetType: AssetType;
  code: string;
  market: AssetMarket;
  currency?: AssetCurrency;
  name: string;
  shares: number;
  costAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetQuote {
  assetType: AssetQuoteType;
  code: string;
  name: string;
  price: number;
  changePercent: number;
  quoteTime: string;
  source: string;
  syncedAt: string;
  currency?: AssetCurrency;
  priceSource?: AssetQuotePriceSource;
  estimatedPrice?: number;
  confirmedPrice?: number;
  confirmedDate?: string;
  error?: string;
}

export interface AssetImportCandidate {
  assetType: AssetType;
  code: string;
  market: AssetMarket;
  currency?: AssetCurrency;
  name: string;
  shares: number;
  costAmount: number;
  totalCost?: number;
  unitCost?: number;
  marketValue?: number;
  holdingProfit?: number;
  profitRate?: number;
  costSource?: 'total_cost' | 'unit_cost' | 'market_minus_profit' | 'market_by_rate' | 'missing';
}

export interface AssetRecurringPlan {
  id: string;
  holdingId: string;
  amount: number;
  frequency: AssetRecurringFrequency;
  startDate: string;
  nextDueDate: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetPerformanceSnapshot {
  date: string;
  marketValue: number;
  costAmount: number;
  totalProfit: number;
  totalProfitRate: number;
  dailyProfit: number;
  dailyProfitRate: number;
  benchmarkName: string;
  benchmarkChangePercent: number;
  capturedAt: string;
}

export interface AssetTradeRecord {
  id: string;
  holdingId: string;
  assetType: AssetType;
  code: string;
  name: string;
  currency?: AssetCurrency;
  tradeType: AssetTradeType;
  source: AssetTradeSource;
  status?: AssetTradeStatus;
  recurringPlanId?: string;
  shares: number;
  amount: number;
  price: number;
  occurredAt: string;
  createdAt: string;
  settledAt?: string;
  priceSource?: AssetQuotePriceSource | 'manual';
}

export interface AssetScreenshotAnalysisResult {
  ok: boolean;
  message: string;
  holdings: AssetImportCandidate[];
  assistantReplyRaw?: string;
  responseBodyRaw?: string;
  failureStage?: string;
}

export interface DailyStats {
  date: string;
  income: number;
  expense: number;
}

export interface CategoryStats {
  name: string;
  value: number;
  color: string;
}

export enum AppTab {
  DASHBOARD = 'DASHBOARD',
  STATS = 'STATS',
  ANALYSIS = 'ANALYSIS',
  SETTINGS = 'SETTINGS',
}

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  modelName: string;
  timeoutMs: number;
  capturePrompt: string;
}

export interface LLMConfigTestResult {
  ok: boolean;
  message: string;
  elapsedMs: number;
  httpStatus: number;
  endpoint: string;
  modelName: string;
  assistantReplyRaw?: string;
  responseBodyRaw?: string;
  failureStage?: string;
}

export interface AutoBookkeepingSettings {
  accessibilityEnabled: boolean;
  notificationPermissionGranted: boolean;
  lastCaptureAt: number;
  lastError: string;
}

export interface AppSettings {
  expenseAverageMonths: number;
  fundQuoteSource: FundQuoteSource;
}

export interface WalletSnapshot {
  localRevision?: number;
  cloudAccountId?: string;
  storeVersion: number;
  migratedFromWebStorage: boolean;
  transactions: Transaction[];
  captureLogs: CaptureAttemptLog[];
  categories: Category[];
  recurringProfiles: RecurringProfile[];
  assetHoldings: AssetHolding[];
  assetQuoteCache: AssetQuote[];
  assetRecurringPlans: AssetRecurringPlan[];
  assetPerformanceHistory: AssetPerformanceSnapshot[];
  assetTradeRecords: AssetTradeRecord[];
  llmConfig: LLMConfig;
  appSettings: AppSettings;
  autoBookkeepingSettings: AutoBookkeepingSettings;
}

export interface WalletBackupData {
  transactions: Transaction[];
  categories: Category[];
  recurringProfiles: RecurringProfile[];
  assetHoldings: AssetHolding[];
  assetRecurringPlans: AssetRecurringPlan[];
  assetPerformanceHistory: AssetPerformanceSnapshot[];
  assetTradeRecords: AssetTradeRecord[];
}

export interface WalletBackupFile {
  format: 'smartwallet-backup';
  version: 2;
  exportedAt: string;
  data: WalletBackupData;
}
