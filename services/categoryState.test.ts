import { describe, expect, it } from 'vitest';

import { DEFAULT_CATEGORIES } from '../constants';
import { Category, RecurringProfile, Transaction } from '../types';
import { normalizeCategoryState } from './categoryState';

describe('normalizeCategoryState', () => {
  it('migrates legacy custom categories that now collide with built-in defaults', () => {
    const legacyDailyCategory: Category = {
      id: 'legacy-daily',
      name: '日用',
      icon: 'Star',
      color: '#111111',
      type: 'expense',
    };

    const transaction: Transaction = {
      id: 'tx-legacy-daily',
      amount: 5.6,
      type: 'expense',
      categoryId: 'legacy-daily',
      date: '2026-04-05',
      note: '牙刷',
    };

    const recurringProfile: RecurringProfile = {
      id: 'recurring-legacy-daily',
      amount: 60,
      type: 'expense',
      categoryId: 'legacy-daily',
      note: '生活用品',
      frequency: 'monthly',
      startDate: '2026-04-01',
      nextDueDate: '2026-05-01',
    };

    const normalized = normalizeCategoryState({
      categories: [
        ...DEFAULT_CATEGORIES.filter((category) => category.id !== 'daily_use' && category.id !== 'sports'),
        legacyDailyCategory,
      ],
      transactions: [transaction],
      recurringProfiles: [recurringProfile],
    });

    expect(normalized.categories.some((category) => category.id === 'legacy-daily')).toBe(false);
    expect(normalized.categories.filter((category) => category.type === 'expense' && category.name === '日用')).toHaveLength(1);
    expect(normalized.transactions[0].categoryId).toBe('daily_use');
    expect(normalized.recurringProfiles[0].categoryId).toBe('daily_use');
  });

  it('keeps custom categories ahead of catch-all categories while pinning other_exp to the end', () => {
    const customCategory: Category = {
      id: 'custom-snacks',
      name: '零食',
      icon: 'Gift',
      color: '#f97316',
      type: 'expense',
    };

    const normalized = normalizeCategoryState({
      categories: [...DEFAULT_CATEGORIES, customCategory],
      transactions: [],
      recurringProfiles: [],
    });

    expect(normalized.categories.filter((category) => category.type === 'expense').map((category) => category.id)).toEqual([
      'food',
      'transport',
      'shopping',
      'housing',
      'entertainment',
      'health',
      'education',
      'daily_use',
      'sports',
      'custom-snacks',
      'other_exp',
    ]);
  });
});
