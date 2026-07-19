import { Transaction } from '../types';

export interface WealthFreedomResult {
  days: number | null;
  avgDailyExpense: number;
  periodDays: number;
  periodExpense: number;
}

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const subtractMonthsClamped = (date: Date, months: number) => {
  const targetMonth = date.getMonth() - months;
  const lastDay = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(date.getFullYear(), targetMonth, Math.min(date.getDate(), lastDay));
};

const calendarDayNumber = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

export const calculateWealthFreedom = (
  totalAssets: number,
  transactions: Transaction[],
  expenseAverageMonths: number,
  now = new Date(),
): WealthFreedomResult => {
  const months = Math.min(12, Math.max(1, Math.trunc(expenseAverageMonths) || 1));
  const today = startOfLocalDay(now);
  const start = subtractMonthsClamped(today, months);
  const periodDays = Math.max(1, calendarDayNumber(today) - calendarDayNumber(start));

  const periodExpense = transactions
    .filter((transaction) => {
      if (transaction.type !== 'expense') {
        return false;
      }
      const transactionDate = new Date(transaction.date);
      return transactionDate >= start && transactionDate < today;
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const avgDailyExpense = periodExpense / periodDays;

  return {
    days: avgDailyExpense > 0 ? Math.max(0, totalAssets / avgDailyExpense) : null,
    avgDailyExpense,
    periodDays,
    periodExpense,
  };
};
