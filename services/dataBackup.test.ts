import { describe, expect, it } from 'vitest';

import { buildDefaultSnapshot } from './walletStore';
import { buildBackupPayload, mergeBackupData, parseBackupFile } from './dataBackup';
import { Category, Transaction, WalletSnapshot } from '../types';

describe('dataBackup', () => {
  it('keeps capture logs out of JSON backups', () => {
    const payload = buildBackupPayload({
      ...buildDefaultSnapshot(),
      transactions: [],
      categories: buildDefaultSnapshot().categories,
      recurringProfiles: [],
    });

    expect((payload.data as Record<string, unknown>).captureLogs).toBeUndefined();
  });

  it('exports and parses custom categories alongside transactions', () => {
    const customCategory: Category = {
      id: 'custom-fuel',
      name: '加油',
      icon: 'Star',
      color: '#111827',
      type: 'expense',
    };
    const transaction: Transaction = {
      id: 'tx-custom-1',
      amount: 300,
      type: 'expense',
      categoryId: customCategory.id,
      date: '2026-04-05',
      note: '高速服务区',
    };
    const snapshot: WalletSnapshot = {
      ...buildDefaultSnapshot(),
      transactions: [transaction],
      categories: [...buildDefaultSnapshot().categories, customCategory],
    };

    const fileContent = JSON.stringify(buildBackupPayload(snapshot, '2026-04-05T12:00:00.000Z'));
    const parsed = parseBackupFile(fileContent);

    expect(parsed.categories.some((category) => category.id === customCategory.id && category.name === '加油')).toBe(true);
    expect(parsed.transactions[0]).toMatchObject({
      id: transaction.id,
      categoryId: customCategory.id,
    });
  });

  it('keeps category-only backups valid even without transactions', () => {
    const customCategory: Category = {
      id: 'custom-books',
      name: '藏书',
      icon: 'Star',
      color: '#4f46e5',
      type: 'expense',
    };

    const payload = buildBackupPayload({
      transactions: [],
      categories: [...buildDefaultSnapshot().categories, customCategory],
      recurringProfiles: [],
    });
    const parsed = parseBackupFile(JSON.stringify(payload));

    expect(parsed.transactions).toHaveLength(0);
    expect(parsed.categories.some((category) => category.id === customCategory.id)).toBe(true);
  });

  it('merges append imports without dropping categories or duplicating existing transaction ids', () => {
    const existingCategory: Category = {
      id: 'custom-coffee',
      name: '咖啡豆',
      icon: 'Coffee',
      color: '#92400e',
      type: 'expense',
    };
    const importedCategory: Category = {
      id: 'custom-sport',
      name: '羽毛球',
      icon: 'Star',
      color: '#2563eb',
      type: 'expense',
    };
    const duplicateTransaction: Transaction = {
      id: 'tx-shared',
      amount: 48,
      type: 'expense',
      categoryId: existingCategory.id,
      date: '2026-04-02',
      note: '咖啡豆',
    };
    const importedTransaction: Transaction = {
      id: 'tx-imported',
      amount: 88,
      type: 'expense',
      categoryId: importedCategory.id,
      date: '2026-04-03',
      note: '场地费',
    };

    const merged = mergeBackupData(
      {
        transactions: [duplicateTransaction],
        categories: [...buildDefaultSnapshot().categories, existingCategory],
        recurringProfiles: [],
      },
      {
        transactions: [duplicateTransaction, importedTransaction],
        categories: [importedCategory],
        recurringProfiles: [],
      },
      'append',
    );

    expect(merged.transactions).toHaveLength(2);
    expect(merged.transactions.filter((transaction) => transaction.id === duplicateTransaction.id)).toHaveLength(1);
    expect(merged.categories.some((category) => category.id === existingCategory.id)).toBe(true);
    expect(merged.categories.some((category) => category.id === importedCategory.id)).toBe(true);
  });
});
