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
  sessionActive: boolean;
  notificationPermissionGranted: boolean;
  lastCaptureAt: number;
  lastError: string;
}

export interface WalletSnapshot {
  storeVersion: number;
  migratedFromWebStorage: boolean;
  transactions: Transaction[];
  captureLogs: CaptureAttemptLog[];
  categories: Category[];
  recurringProfiles: RecurringProfile[];
  llmConfig: LLMConfig;
  autoBookkeepingSettings: AutoBookkeepingSettings;
}

export interface WalletBackupData {
  transactions: Transaction[];
  categories: Category[];
  recurringProfiles: RecurringProfile[];
}

export interface WalletBackupFile {
  format: 'smartwallet-backup';
  version: 1;
  exportedAt: string;
  data: WalletBackupData;
}
