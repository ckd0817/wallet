import React, { useMemo, useState } from 'react';
import { AlertCircle, Award, DollarSign, Target, TrendingDown, TrendingUp } from 'lucide-react';

import { Category, Transaction } from '../types';
import { AnalysisPeriod, buildAnalysisSnapshot } from '../services/analysisEngine';

interface AnalysisProps {
  transactions: Transaction[];
  categories: Category[];
}

const Analysis: React.FC<AnalysisProps> = ({ transactions, categories }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<AnalysisPeriod>('month');

  const analysis = useMemo(
    () => buildAnalysisSnapshot({ transactions, categories, period: selectedPeriod }),
    [categories, selectedPeriod, transactions],
  );

  return (
    <div className="flex flex-col h-full animate-slide-up pb-24 space-y-8">
      <div className="flex bg-surface p-1.5 rounded-2xl border border-border">
        {[
          { value: 'month', label: '本月' },
          { value: 'quarter', label: '本季' },
          { value: 'year', label: '今年' },
        ].map((period) => (
          <button
            key={period.value}
            onClick={() => setSelectedPeriod(period.value as AnalysisPeriod)}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
              selectedPeriod === period.value ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-primary'
            }`}
          >
            {period.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-border p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-secondary uppercase tracking-wider">净结余</span>
          </div>
          <p className={`text-2xl font-bold ${analysis.financialHealth.netBalance >= 0 ? 'text-success' : 'text-danger'}`}>
            ¥{analysis.financialHealth.netBalance.toFixed(2)}
          </p>
        </div>

        <div className="bg-white border border-border p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-xs text-secondary uppercase tracking-wider">储蓄率</span>
          </div>
          <p
            className={`text-2xl font-bold ${
              analysis.financialHealth.savingsRate >= 20
                ? 'text-success'
                : analysis.financialHealth.savingsRate >= 0
                  ? 'text-warning'
                  : 'text-danger'
            }`}
          >
            {analysis.financialHealth.savingsRate.toFixed(1)}%
          </p>
        </div>

        <div className="bg-white border border-border p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-secondary uppercase tracking-wider">日均支出</span>
          </div>
          <p className="text-2xl font-bold text-primary">¥{analysis.financialHealth.avgDailyExpense.toFixed(2)}</p>
        </div>

        <div className="bg-white border border-border p-5 rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            {analysis.financialHealth.expenseGrowthRate > 0 ? (
              <TrendingUp className="w-4 h-4 text-danger" />
            ) : (
              <TrendingDown className="w-4 h-4 text-success" />
            )}
            <span className="text-xs text-secondary uppercase tracking-wider">支出增长</span>
          </div>
          <p
            className={`text-2xl font-bold ${
              analysis.financialHealth.expenseGrowthRate > 10
                ? 'text-danger'
                : analysis.financialHealth.expenseGrowthRate > 0
                  ? 'text-warning'
                  : 'text-success'
            }`}
          >
            {analysis.financialHealth.expenseGrowthRate > 0 ? '+' : ''}
            {analysis.financialHealth.expenseGrowthRate.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="bg-white border border-border p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-primary">消费洞察</h3>
          <span className="text-xs text-secondary">本地分析</span>
        </div>
        <div className="space-y-3">
          {analysis.habits.map((habit, index) => (
            <div
              key={`${habit.type}-${index}`}
              className={`flex items-start gap-3 p-3 rounded-lg ${
                habit.type === 'success' ? 'bg-green-50' : habit.type === 'warning' ? 'bg-red-50' : 'bg-blue-50'
              }`}
            >
              {habit.type === 'success' ? (
                <Award className="w-4 h-4 text-success mt-0.5" />
              ) : (
                <AlertCircle className={`w-4 h-4 mt-0.5 ${habit.type === 'warning' ? 'text-danger' : 'text-info'}`} />
              )}
              <span
                className={`text-sm ${
                  habit.type === 'success' ? 'text-success' : habit.type === 'warning' ? 'text-danger' : 'text-info'
                }`}
              >
                {habit.message}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-border p-6 rounded-2xl">
        <h3 className="text-base font-semibold text-primary mb-4">支出排行</h3>
        <div className="space-y-4">
          {analysis.topCategories.map((category, index) => (
            <div key={category.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-primary w-6">#{index + 1}</span>
                <div>
                  <p className="text-sm font-medium text-primary">{category.name}</p>
                  <p className="text-xs text-zinc-400">{category.percentage.toFixed(1)}% 总支出</p>
                </div>
              </div>
              <span className="text-base font-semibold text-primary">¥{category.amount.toFixed(2)}</span>
            </div>
          ))}
          {analysis.topCategories.length === 0 && <p className="text-sm text-secondary">当前时间范围内还没有支出记录。</p>}
        </div>
      </div>

      <div className="bg-white border border-border p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-primary">理财建议</h3>
          <span className="text-xs text-secondary">规则生成</span>
        </div>
        <div className="space-y-3">
          {analysis.recommendations.map((recommendation, index) => (
            <div key={`${recommendation.priority}-${index}`} className="flex items-start gap-3 p-3 rounded-lg bg-surface">
              <div
                className={`w-2 h-2 rounded-full mt-2 ${
                  recommendation.priority === 'high'
                    ? 'bg-red-500'
                    : recommendation.priority === 'medium'
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`}
              />
              <span className="text-sm text-primary">{recommendation.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Analysis;
