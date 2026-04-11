import { describe, expect, it } from 'vitest';

import { buildAnalysisSnapshot } from './analysisEngine';
import { DEFAULT_CATEGORIES } from '../constants';
import { Transaction } from '../types';

describe('buildAnalysisSnapshot', () => {
  it('keeps local spending insights even when model config exists elsewhere in the app', () => {
    const transactions: Transaction[] = [
      {
        id: 'expense-1',
        amount: 120,
        type: 'expense',
        categoryId: 'food',
        date: '2026-04-02',
        note: '午餐',
      },
      {
        id: 'expense-2',
        amount: 380,
        type: 'expense',
        categoryId: 'shopping',
        date: '2026-04-03',
        note: '日用品',
      },
      {
        id: 'income-1',
        amount: 3200,
        type: 'income',
        categoryId: 'salary',
        date: '2026-04-01',
        note: '工资',
      },
    ];

    const snapshot = buildAnalysisSnapshot({
      transactions,
      categories: DEFAULT_CATEGORIES,
      period: 'month',
      now: new Date('2026-04-18T08:00:00+08:00'),
    });

    expect(snapshot.topCategories[0]).toMatchObject({
      name: '购物',
      amount: 380,
    });
    expect(snapshot.habits.length).toBeGreaterThan(0);
    expect(snapshot.recommendations.length).toBeGreaterThan(0);
  });

  it('reports healthy spending distribution when expenses are diversified', () => {
    const transactions: Transaction[] = [
      {
        id: 'expense-1',
        amount: 100,
        type: 'expense',
        categoryId: 'food',
        date: '2026-04-02',
        note: '早餐',
      },
      {
        id: 'expense-2',
        amount: 100,
        type: 'expense',
        categoryId: 'transport',
        date: '2026-04-03',
        note: '打车',
      },
      {
        id: 'expense-3',
        amount: 100,
        type: 'expense',
        categoryId: 'shopping',
        date: '2026-04-04',
        note: '杂货',
      },
      {
        id: 'expense-4',
        amount: 100,
        type: 'expense',
        categoryId: 'housing',
        date: '2026-04-05',
        note: '水电',
      },
      {
        id: 'expense-5',
        amount: 100,
        type: 'expense',
        categoryId: 'entertainment',
        date: '2026-04-06',
        note: '电影',
      },
      {
        id: 'expense-6',
        amount: 100,
        type: 'expense',
        categoryId: 'health',
        date: '2026-04-07',
        note: '药品',
      },
      {
        id: 'expense-7',
        amount: 100,
        type: 'expense',
        categoryId: 'education',
        date: '2026-04-08',
        note: '课程',
      },
      {
        id: 'income-1',
        amount: 4000,
        type: 'income',
        categoryId: 'salary',
        date: '2026-04-01',
        note: '工资',
      },
    ];

    const snapshot = buildAnalysisSnapshot({
      transactions,
      categories: DEFAULT_CATEGORIES,
      period: 'month',
      now: new Date('2026-04-18T08:00:00+08:00'),
    });

    expect(snapshot.topCategories).toHaveLength(5);
    expect(snapshot.habits.some((habit) => habit.message.includes('消费结构合理'))).toBe(true);
  });
});
