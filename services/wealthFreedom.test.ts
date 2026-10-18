import { describe, expect, it } from 'vitest';

import { Transaction } from '../types';
import { calculateWealthFreedom } from './wealthFreedom';

const expense = (amount: number, date: string): Transaction => ({
  id: date,
  amount,
  type: 'expense',
  categoryId: 'food',
  date,
  note: '',
});

describe('calculateWealthFreedom', () => {
  it('按所选月数和实际天数计算日均支出', () => {
    const result = calculateWealthFreedom(
      6_000,
      [expense(600, '2026-05-20'), expense(600, '2026-07-18'), expense(999, '2026-05-18')],
      2,
      new Date(2026, 6, 19, 12),
    );

    expect(result.periodDays).toBe(61);
    expect(result.periodExpense).toBe(1_200);
    expect(result.avgDailyExpense).toBeCloseTo(1_200 / 61);
    expect(result.days).toBeCloseTo(305);
  });

  it('没有支出时不返回可支撑天数', () => {
    const result = calculateWealthFreedom(10_000, [], 12, new Date(2026, 6, 19, 12));

    expect(result.days).toBeNull();
    expect(result.avgDailyExpense).toBe(0);
    expect(result.fireTargetAssets).toBeNull();
    expect(result.fireProgressPercent).toBeNull();
  });

  it('按 2% 提取率计算 FIRE 目标并保留超额进度', () => {
    const transactions = [expense(3_000, '2026-07-01')];
    const now = new Date(2026, 6, 19, 12);
    const result = calculateWealthFreedom(450_000, transactions, 1, now);

    expect(result.avgDailyExpense).toBe(100);
    expect(result.fireTargetAssets).toBe(1_800_000);
    expect(result.fireProgressPercent).toBe(25);
    expect(calculateWealthFreedom(2_700_000, transactions, 1, now).fireProgressPercent).toBe(150);
    expect(calculateWealthFreedom(0, transactions, 1, now).fireProgressPercent).toBe(0);
    expect(calculateWealthFreedom(-100, transactions, 1, now).fireProgressPercent).toBe(0);
  });
});
