import { describe, expect, it } from 'vitest';

import { buildAnalysisSnapshot } from './analysisEngine';
import { DEFAULT_CATEGORIES } from '../constants';
import { Transaction } from '../types';

describe('buildAnalysisSnapshot', () => {
  it('计算周期财务指标和支出排行', () => {
    const transactions: Transaction[] = [
      { id: 'expense-1', amount: 120, type: 'expense', categoryId: 'food', date: '2026-04-02', note: '午餐' },
      { id: 'expense-2', amount: 380, type: 'expense', categoryId: 'shopping', date: '2026-04-03', note: '日用品' },
      { id: 'income-1', amount: 3200, type: 'income', categoryId: 'salary', date: '2026-04-01', note: '工资' },
      { id: 'previous-expense', amount: 250, type: 'expense', categoryId: 'food', date: '2026-03-03', note: '上月' },
    ];

    const snapshot = buildAnalysisSnapshot({
      transactions,
      categories: DEFAULT_CATEGORIES,
      period: 'month',
      range: { start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-30T23:59:59') },
      previousRange: { start: new Date('2026-03-01T00:00:00'), end: new Date('2026-03-31T23:59:59') },
    });

    expect(snapshot.financialHealth.netBalance).toBe(2700);
    expect(snapshot.financialHealth.savingsRate).toBeCloseTo(84.375);
    expect(snapshot.financialHealth.avgDailyExpense).toBeCloseTo(500 / 30);
    expect(snapshot.financialHealth.expenseGrowthRate).toBe(100);
    expect(snapshot.topCategories[0]).toMatchObject({ name: '购物', amount: 380 });
  });

  it('无上周期支出时增长率为 0', () => {
    const snapshot = buildAnalysisSnapshot({
      transactions: [{ id: 'expense-1', amount: 100, type: 'expense', categoryId: 'food', date: '2026-04-02', note: '早餐' }],
      categories: DEFAULT_CATEGORIES,
      period: 'week',
      range: { start: new Date('2026-04-01T00:00:00'), end: new Date('2026-04-07T23:59:59') },
      previousRange: { start: new Date('2026-03-25T00:00:00'), end: new Date('2026-03-31T23:59:59') },
    });

    expect(snapshot.financialHealth.expenseGrowthRate).toBe(0);
    expect(snapshot.topCategories).toHaveLength(1);
  });
});
