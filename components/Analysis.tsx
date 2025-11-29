import React, { useMemo, useState, useEffect } from 'react';
import { Transaction, Category, TransactionType } from '../types';
import { TrendingUp, TrendingDown, DollarSign, Target, AlertCircle, Award } from 'lucide-react';

interface AnalysisProps {
  transactions: Transaction[];
  categories: Category[];
}

interface FinancialHealth {
  netBalance: number;
  savingsRate: number;
  avgDailyExpense: number;
  expenseGrowthRate: number;
}

interface SpendingInsight {
  topCategories: Array<{ name: string; amount: number; percentage: number }>;
  habits: Array<{ type: 'warning' | 'success' | 'info'; message: string }>;
  recommendations: Array<{ message: string; priority: 'high' | 'medium' | 'low' }>;
}

const Analysis: React.FC<AnalysisProps> = ({ transactions, categories }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  // Calculate financial health metrics
  const financialHealth = useMemo((): FinancialHealth => {
    const now = new Date();
    const currentPeriodStart = new Date();

    if (selectedPeriod === 'month') {
      currentPeriodStart.setMonth(now.getMonth(), 1);
    } else if (selectedPeriod === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      currentPeriodStart.setMonth(quarter * 3, 1);
    } else {
      currentPeriodStart.setMonth(0, 1);
    }

    currentPeriodStart.setHours(0, 0, 0, 0);

    const previousPeriodStart = new Date(currentPeriodStart);
    if (selectedPeriod === 'month') {
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
    } else if (selectedPeriod === 'quarter') {
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 3);
    } else {
      previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
    }

    const currentTransactions = transactions.filter(t =>
      new Date(t.date) >= currentPeriodStart
    );

    const previousTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= previousPeriodStart && date < currentPeriodStart;
    });

    const currentIncome = currentTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const currentExpense = currentTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const previousExpense = previousTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const netBalance = currentIncome - currentExpense;
    const savingsRate = currentIncome > 0 ? (netBalance / currentIncome) * 100 : 0;

    const daysInPeriod = selectedPeriod === 'month' ? 30 : selectedPeriod === 'quarter' ? 90 : 365;
    const avgDailyExpense = currentExpense / daysInPeriod;

    const expenseGrowthRate = previousExpense > 0
      ? ((currentExpense - previousExpense) / previousExpense) * 100
      : 0;

    return {
      netBalance,
      savingsRate,
      avgDailyExpense,
      expenseGrowthRate
    };
  }, [transactions, selectedPeriod]);

  // Calculate spending insights
  const spendingInsights = useMemo((): SpendingInsight => {
    const now = new Date();
    const periodStart = new Date();

    if (selectedPeriod === 'month') {
      periodStart.setMonth(now.getMonth(), 1);
    } else if (selectedPeriod === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      periodStart.setMonth(quarter * 3, 1);
    } else {
      periodStart.setMonth(0, 1);
    }

    const periodTransactions = transactions.filter(t =>
      new Date(t.date) >= periodStart && t.type === 'expense'
    );

    const categoryTotals = periodTransactions.reduce((acc, t) => {
      const cat = categories.find(c => c.id === t.categoryId);
      const name = cat?.name || '未知';
      acc[name] = (acc[name] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    const totalExpense = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);

    const topCategories = Object.entries(categoryTotals)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => ({
        name,
        amount,
        percentage: totalExpense > 0 ? (amount / totalExpense) * 100 : 0
      }));

    const habits = [];
    const recommendations = [];

    // Analyze spending habits
    if (financialHealth.savingsRate < 0) {
      habits.push({ type: 'warning' as const, message: '当前支出超过收入' });
      recommendations.push({ message: '建议削减非必要开支', priority: 'high' as const });
    } else if (financialHealth.savingsRate < 20) {
      habits.push({ type: 'info' as const, message: '储蓄率偏低，建议提升至20%以上' });
      recommendations.push({ message: '制定月度储蓄计划', priority: 'medium' as const });
    } else {
      habits.push({ type: 'success' as const, message: '储蓄状况良好' });
    }

    if (financialHealth.expenseGrowthRate > 20) {
      habits.push({ type: 'warning' as const, message: '支出增长过快' });
      recommendations.push({ message: '检查大额支出项目', priority: 'high' as const });
    } else if (financialHealth.expenseGrowthRate < -10) {
      habits.push({ type: 'success' as const, message: '支出控制良好' });
    }

    if (topCategories.length > 0 && topCategories[0].percentage > 50) {
      habits.push({ type: 'info' as const, message: `${topCategories[0].name} 占支出较大比重` });
      recommendations.push({ message: '优化主要支出类别', priority: 'medium' as const });
    }

    return {
      topCategories,
      habits,
      recommendations
    };
  }, [transactions, categories, selectedPeriod, financialHealth]);

  return (
    <div className="flex flex-col h-full animate-slide-up pb-24 space-y-8">

      {/* Period Selector */}
      <div className="flex bg-surface p-1.5 rounded-2xl border border-border">
        {[
          { value: 'month', label: '本月' },
          { value: 'quarter', label: '本季' },
          { value: 'year', label: '今年' }
        ].map(period => (
          <button
            key={period.value}
            onClick={() => setSelectedPeriod(period.value as any)}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
              selectedPeriod === period.value
              ? 'bg-primary text-white shadow-sm'
              : 'text-secondary hover:text-primary'
            }`}
          >
            {period.label}
          </button>
        ))}
      </div>

      {/* Financial Health Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-border p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-secondary uppercase tracking-wider">净结余</span>
          </div>
          <p className={`text-2xl font-bold ${financialHealth.netBalance >= 0 ? 'text-success' : 'text-danger'}`}>
            ¥{financialHealth.netBalance.toFixed(2)}
          </p>
        </div>

        <div className="bg-white border border-border p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-xs text-secondary uppercase tracking-wider">储蓄率</span>
          </div>
          <p className={`text-2xl font-bold ${financialHealth.savingsRate >= 20 ? 'text-success' : financialHealth.savingsRate >= 0 ? 'text-warning' : 'text-danger'}`}>
            {financialHealth.savingsRate.toFixed(1)}%
          </p>
        </div>

        <div className="bg-white border border-border p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-secondary uppercase tracking-wider">日均支出</span>
          </div>
          <p className="text-2xl font-bold text-primary">
            ¥{financialHealth.avgDailyExpense.toFixed(2)}
          </p>
        </div>

        <div className="bg-white border border-border p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            {financialHealth.expenseGrowthRate > 0 ? (
              <TrendingUp className="w-4 h-4 text-danger" />
            ) : (
              <TrendingDown className="w-4 h-4 text-success" />
            )}
            <span className="text-xs text-secondary uppercase tracking-wider">支出增长</span>
          </div>
          <p className={`text-2xl font-bold ${financialHealth.expenseGrowthRate > 10 ? 'text-danger' : financialHealth.expenseGrowthRate > 0 ? 'text-warning' : 'text-success'}`}>
            {financialHealth.expenseGrowthRate > 0 ? '+' : ''}{financialHealth.expenseGrowthRate.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Spending Insights */}
      <div className="bg-white border border-border p-6 rounded-2xl">
        <h3 className="text-base font-semibold text-primary mb-4">消费洞察</h3>
        <div className="space-y-3">
          {spendingInsights.habits.map((habit, index) => (
            <div key={index} className={`flex items-start gap-3 p-3 rounded-lg ${
              habit.type === 'success' ? 'bg-green-50' :
              habit.type === 'warning' ? 'bg-red-50' : 'bg-blue-50'
            }`}>
              {habit.type === 'success' ? (
                <Award className="w-4 h-4 text-success mt-0.5" />
              ) : habit.type === 'warning' ? (
                <AlertCircle className="w-4 h-4 text-danger mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-info mt-0.5" />
              )}
              <span className={`text-sm ${
                habit.type === 'success' ? 'text-success' :
                habit.type === 'warning' ? 'text-danger' : 'text-info'
              }`}>
                {habit.message}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Spending Categories */}
      <div className="bg-white border border-border p-6 rounded-2xl">
        <h3 className="text-base font-semibold text-primary mb-4">支出排行</h3>
        <div className="space-y-4">
          {spendingInsights.topCategories.map((category, index) => (
            <div key={category.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-primary w-6">#{index + 1}</span>
                <div>
                  <p className="text-sm font-medium text-primary">{category.name}</p>
                  <p className="text-xs text-zinc-400">{category.percentage.toFixed(1)}% 总支出</p>
                </div>
              </div>
              <span className="text-base font-semibold text-primary">
                ¥{category.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      {spendingInsights.recommendations.length > 0 && (
        <div className="bg-white border border-border p-6 rounded-2xl">
          <h3 className="text-base font-semibold text-primary mb-4">理财建议</h3>
          <div className="space-y-3">
            {spendingInsights.recommendations.map((rec, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-surface">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  rec.priority === 'high' ? 'bg-red-500' :
                  rec.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                <span className="text-sm text-primary">{rec.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Analysis;