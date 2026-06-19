import { Category, Transaction } from '../types';

export type AnalysisPeriod = 'week' | 'month' | 'year';

export interface FinancialHealth {
  netBalance: number;
  savingsRate: number;
  avgDailyExpense: number;
  expenseGrowthRate: number;
}

export interface TopCategory {
  name: string;
  amount: number;
  percentage: number;
}

export interface AnalysisSnapshot {
  financialHealth: FinancialHealth;
  topCategories: TopCategory[];
}

export interface AnalysisPeriodRange {
  start: Date;
  end: Date;
}

interface BuildAnalysisSnapshotOptions {
  transactions: Transaction[];
  categories: Category[];
  period: AnalysisPeriod;
  now?: Date;
  range?: AnalysisPeriodRange;
  previousRange?: AnalysisPeriodRange;
}

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

export const getAnalysisPeriodRange = (period: AnalysisPeriod, now = new Date()): AnalysisPeriodRange => {
  if (period === 'week') {
    const day = now.getDay() || 7;
    const start = startOfDay(now);
    start.setDate(now.getDate() - (day - 1));
    const end = endOfDay(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }

  if (period === 'month') {
    const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { start, end };
  }

  return {
    start: startOfDay(new Date(now.getFullYear(), 0, 1)),
    end: endOfDay(new Date(now.getFullYear(), 11, 31)),
  };
};

export const getPreviousAnalysisPeriodRange = (range: AnalysisPeriodRange, period: AnalysisPeriod): AnalysisPeriodRange => {
  const start = new Date(range.start);
  const end = new Date(range.end);

  if (period === 'week') {
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() - 7);
  } else if (period === 'month') {
    start.setMonth(start.getMonth() - 1);
    end.setMonth(end.getMonth() - 1);
  } else {
    start.setFullYear(start.getFullYear() - 1);
    end.setFullYear(end.getFullYear() - 1);
  }

  return { start, end };
};

const getDaysInRange = (range: AnalysisPeriodRange) => {
  const current = startOfDay(range.start);
  const end = startOfDay(range.end);
  let days = 0;
  while (current <= end) {
    days += 1;
    current.setDate(current.getDate() + 1);
  }
  return Math.max(1, days);
};

const inRange = (transaction: Transaction, range: AnalysisPeriodRange) => {
  const date = new Date(transaction.date);
  return date >= range.start && date <= range.end;
};

export const buildAnalysisSnapshot = ({
  transactions,
  categories,
  period,
  now = new Date(),
  range,
  previousRange,
}: BuildAnalysisSnapshotOptions): AnalysisSnapshot => {
  const currentRange = range ?? getAnalysisPeriodRange(period, now);
  const comparisonRange = previousRange ?? getPreviousAnalysisPeriodRange(currentRange, period);
  const currentTransactions = transactions.filter((transaction) => inRange(transaction, currentRange));
  const previousTransactions = transactions.filter((transaction) => inRange(transaction, comparisonRange));

  const currentIncome = currentTransactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const currentExpense = currentTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const previousExpense = previousTransactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const financialHealth: FinancialHealth = {
    netBalance: currentIncome - currentExpense,
    savingsRate: currentIncome > 0 ? ((currentIncome - currentExpense) / currentIncome) * 100 : 0,
    avgDailyExpense: currentExpense / getDaysInRange(currentRange),
    expenseGrowthRate: previousExpense > 0 ? ((currentExpense - previousExpense) / previousExpense) * 100 : 0,
  };

  const expenseTransactions = currentTransactions.filter((transaction) => transaction.type === 'expense');
  const categoryTotals = expenseTransactions.reduce<Record<string, number>>((accumulator, transaction) => {
    const categoryName = categories.find((category) => category.id === transaction.categoryId)?.name ?? '未知';
    accumulator[categoryName] = (accumulator[categoryName] ?? 0) + transaction.amount;
    return accumulator;
  }, {});
  const totalExpense = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);

  const topCategories = Object.entries(categoryTotals)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 5)
    .map(([name, amount]) => ({
      name,
      amount,
      percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0,
    }));

  return {
    financialHealth,
    topCategories,
  };
};
