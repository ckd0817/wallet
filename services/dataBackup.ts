import { mergeDefaultCategories } from '../constants';
import { WalletBackupData, WalletBackupFile, WalletSnapshot } from '../types';

const BACKUP_FORMAT = 'smartwallet-backup';
const BACKUP_VERSION = 1;

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
  };
};

const mergeById = <T extends { id: string }>(current: T[], imported: T[]) => {
  const merged = new Map<string, T>();

  current.forEach((item) => {
    merged.set(item.id, item);
  });

  imported.forEach((item) => {
    if (!merged.has(item.id)) {
      merged.set(item.id, item);
    }
  });

  return Array.from(merged.values());
};

export const buildBackupPayload = (
  snapshot: Pick<WalletSnapshot, 'transactions' | 'categories' | 'recurringProfiles'>,
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
    return normalizeBackupData(parsed.data);
  }

  if ('transactions' in parsed || 'categories' in parsed || 'recurringProfiles' in parsed) {
    return normalizeBackupData(parsed);
  }

  throw new Error('无法识别的备份文件格式。');
};

export const mergeBackupData = (
  current: WalletBackupData,
  imported: WalletBackupData,
  mode: 'append' | 'overwrite',
): WalletBackupData => {
  const normalizedImported = normalizeBackupData(imported);
  if (mode === 'overwrite') {
    return normalizedImported;
  }

  return {
    transactions: mergeById(current.transactions, normalizedImported.transactions),
    categories: mergeDefaultCategories(mergeById(current.categories, normalizedImported.categories)),
    recurringProfiles: mergeById(current.recurringProfiles, normalizedImported.recurringProfiles),
  };
};
