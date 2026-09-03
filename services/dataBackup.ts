import { mergeDefaultCategories } from '../constants';
import { WalletBackupData, WalletBackupFile, WalletSnapshot } from '../types';
import { normalizeAssetHolding, normalizeAssetPerformanceSnapshot } from './assetEngine';

const BACKUP_FORMAT = 'smartwallet-backup';
const BACKUP_VERSION = 2;

const COLLECTIONS: Array<keyof WalletBackupData> = [
  'transactions', 'categories', 'recurringProfiles', 'assetHoldings',
  'assetRecurringPlans', 'assetPerformanceHistory', 'assetTradeRecords',
];

export const validateBackupData = (value: unknown) => {
  if (!isRecord(value)) throw new Error('备份数据结构无效');
  for (const kind of COLLECTIONS) {
    const records = value[kind];
    if (records === undefined) continue;
    if (!Array.isArray(records)) throw new Error('备份数据格式无效');
    const ids = new Set<string>();
    for (const record of records) {
      if (!isRecord(record)) throw new Error('备份包含无效记录');
      const id = record[kind === 'assetPerformanceHistory' ? 'date' : 'id'];
      if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('备份记录编号缺失或重复');
      ids.add(id);
      for (const [key, child] of Object.entries(record)) {
        if (typeof child === 'number' && !Number.isFinite(child)) throw new Error('备份包含无效数值');
        if (['amount','shares','costAmount'].includes(key) &&
            (typeof child !== 'number' || child < 0)) throw new Error('备份包含无效金额或份额');
      }
      if (['transactions','recurringProfiles'].includes(kind)) {
        if (typeof record.amount !== 'number' || !['income','expense'].includes(String(record.type)) ||
            typeof record.categoryId !== 'string') throw new Error('账单格式无效');
      }
      if (kind === 'assetHoldings' && (typeof record.shares !== 'number' ||
          typeof record.costAmount !== 'number' || !['fund','stock'].includes(String(record.assetType)))) {
        throw new Error('持仓格式无效');
      }
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeBackupData = (value: unknown): WalletBackupData => {
  const record = isRecord(value) ? value : {};

  return {
    transactions: Array.isArray(record.transactions) ? (record.transactions as WalletBackupData['transactions']) : [],
    categories: mergeDefaultCategories(
      Array.isArray(record.categories) ? (record.categories as WalletBackupData['categories']) : [],
    ),
    recurringProfiles: Array.isArray(record.recurringProfiles)
      ? (record.recurringProfiles as WalletBackupData['recurringProfiles'])
      : [],
    assetHoldings: Array.isArray(record.assetHoldings)
      ? (record.assetHoldings as WalletBackupData['assetHoldings'])
          .map((holding) => normalizeAssetHolding(holding))
          .filter((holding): holding is WalletBackupData['assetHoldings'][number] => Boolean(holding))
      : [],
    assetRecurringPlans: Array.isArray(record.assetRecurringPlans)
      ? (record.assetRecurringPlans as WalletBackupData['assetRecurringPlans'])
      : [],
    assetPerformanceHistory: Array.isArray(record.assetPerformanceHistory)
      ? (record.assetPerformanceHistory as WalletBackupData['assetPerformanceHistory'])
          .map((snapshot) => normalizeAssetPerformanceSnapshot(snapshot))
          .filter((snapshot): snapshot is WalletBackupData['assetPerformanceHistory'][number] => Boolean(snapshot))
      : [],
    assetTradeRecords: Array.isArray(record.assetTradeRecords)
      ? (record.assetTradeRecords as WalletBackupData['assetTradeRecords'])
      : [],
  };
};

const mergeById = <T extends { id: string }>(current: T[], imported: T[]) => {
  const merged = new Map<string, T>();

  (current ?? []).forEach((item) => {
    merged.set(item.id, item);
  });

  (imported ?? []).forEach((item) => {
    if (!merged.has(item.id)) {
      merged.set(item.id, item);
    }
  });

  return Array.from(merged.values());
};

const mergeByDate = <T extends { date: string }>(current: T[], imported: T[]) => {
  const merged = new Map<string, T>();

  (current ?? []).forEach((item) => {
    merged.set(item.date, item);
  });

  (imported ?? []).forEach((item) => {
    if (!merged.has(item.date)) merged.set(item.date, item);
  });

  return Array.from(merged.values()).sort((left, right) => left.date.localeCompare(right.date));
};

export const buildBackupPayload = (
  snapshot: Partial<Pick<
    WalletSnapshot,
    | 'transactions'
    | 'categories'
    | 'recurringProfiles'
    | 'assetHoldings'
    | 'assetRecurringPlans'
    | 'assetPerformanceHistory'
    | 'assetTradeRecords'
  >>,
  exportedAt = new Date().toISOString(),
): WalletBackupFile => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt,
  data: normalizeBackupData(snapshot),
});

export const parseBackupFile = (content: string): WalletBackupData => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error('备份文件不是有效的 JSON。');
  }

  if (!isRecord(parsed)) {
    throw new Error('备份文件结构无效。');
  }

  if (parsed.format === BACKUP_FORMAT) {
    if (parsed.version !== 1 && parsed.version !== 2) throw new Error('备份版本不受支持');
    validateBackupData(parsed.data);
    return normalizeBackupData(parsed.data);
  }

  if (COLLECTIONS.some(key => key in parsed)) {
    validateBackupData(parsed);
    return normalizeBackupData(parsed);
  }

  throw new Error('无法识别的备份文件格式。');
};

export const mergeBackupData = (
  current: Partial<WalletBackupData>,
  imported: Partial<WalletBackupData>,
  mode: 'append' | 'overwrite',
): WalletBackupData => {
  const normalizedCurrent = normalizeBackupData(current);
  const normalizedImported = normalizeBackupData(imported);
  if (mode === 'overwrite') {
    return normalizedImported;
  }

  return {
    transactions: mergeById(normalizedCurrent.transactions, normalizedImported.transactions),
    categories: mergeDefaultCategories(mergeById(normalizedCurrent.categories, normalizedImported.categories)),
    recurringProfiles: mergeById(normalizedCurrent.recurringProfiles, normalizedImported.recurringProfiles),
    assetHoldings: mergeById(normalizedCurrent.assetHoldings, normalizedImported.assetHoldings),
    assetRecurringPlans: mergeById(normalizedCurrent.assetRecurringPlans, normalizedImported.assetRecurringPlans),
    assetPerformanceHistory: mergeByDate(
      normalizedCurrent.assetPerformanceHistory,
      normalizedImported.assetPerformanceHistory,
    ),
    assetTradeRecords: mergeById(normalizedCurrent.assetTradeRecords, normalizedImported.assetTradeRecords),
  };
};
