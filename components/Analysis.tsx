import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, Category, TransactionType, LLMConfig } from '../types';
import { TrendingUp, TrendingDown, DollarSign, Target, AlertCircle, Award, Sparkles, Loader2 } from 'lucide-react';

interface AnalysisProps {
  transactions: Transaction[];
  categories: Category[];
  llmConfig: LLMConfig;
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

const Analysis: React.FC<AnalysisProps> = ({ transactions, categories, llmConfig }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');
  const [llmInsights, setLlmInsights] = useState<{ habits: any[], recommendations: any[] } | null>(null);
  const [isLoadingLLM, setIsLoadingLLM] = useState(false);

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

    const categoryTotals = periodTransactions.reduce((acc: Record<string, number>, t) => {
      const cat = categories.find(c => c.id === t.categoryId);
      const name = cat?.name || '未知';
      acc[name] = (acc[name] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    const totalExpense = (Object.values(categoryTotals) as number[]).reduce((sum, val) => sum + val, 0);

    // Calculate daily spending for stability analysis
    const dailyExpenses = periodTransactions.reduce((acc: Record<string, number>, t) => {
      const dateStr = t.date.split('T')[0]; // Extract date part
      acc[dateStr] = (acc[dateStr] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    const dailyAmounts = Object.values(dailyExpenses) as number[];
    const avgDailySpend = dailyAmounts.length > 0 ? dailyAmounts.reduce((sum, val) => sum + val, 0) / dailyAmounts.length : 0;
    const spendingVariance = dailyAmounts.length > 1 ?
      dailyAmounts.reduce((sum, val) => sum + Math.pow(val - avgDailySpend, 2), 0) / (dailyAmounts.length - 1) : 0;
    const spendingStdDev = Math.sqrt(spendingVariance);
    const spendingVolatility = avgDailySpend > 0 ? (spendingStdDev / avgDailySpend) * 100 : 0;

    const topCategories = (Object.entries(categoryTotals) as [string, number][])
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, amount]) => ({
        name,
        amount: amount as number,
        percentage: totalExpense > 0 ? ((amount as number) / totalExpense) * 100 : 0
      }));

    const habits = [];
    const recommendations = [];

    // Spending stability analysis
    if (spendingVolatility > 80) {
      habits.push({ type: 'warning' as const, message: '每日消费波动很大，缺乏规律' });
      recommendations.push({ message: '尝试制定每日消费预算，减少冲动消费', priority: 'medium' as const });
    } else if (spendingVolatility > 50) {
      habits.push({ type: 'info' as const, message: '消费波动较大，偶尔有大额支出' });
      recommendations.push({ message: '大额消费前多思考，避免不必要的支出', priority: 'low' as const });
    } else if (spendingVolatility < 30 && avgDailySpend > 0) {
      habits.push({ type: 'success' as const, message: '消费很稳定，有良好的理财习惯' });
    }

    // Large daily spending analysis
    const maxDailySpend = Math.max(...dailyAmounts, 0);
    if (maxDailySpend > avgDailySpend * 3 && avgDailySpend > 0) {
      habits.push({ type: 'warning' as const, message: '存在单日消费过高的情况' });
      recommendations.push({ message: '分析高额消费日的原因，避免重复类似支出', priority: 'medium' as const });
    } else if (maxDailySpend > avgDailySpend * 2 && avgDailySpend > 0) {
      habits.push({ type: 'info' as const, message: '偶尔有单日较高消费，需要注意' });
    }

    // Zero spending days analysis
    const totalDays = selectedPeriod === 'month' ? 30 : selectedPeriod === 'quarter' ? 90 : 365;
    const zeroSpendingDays = Math.max(0, totalDays - dailyAmounts.length);
    const zeroSpendingRate = (zeroSpendingDays / totalDays) * 100;

    if (zeroSpendingRate > 50) {
      habits.push({ type: 'info' as const, message: `${zeroSpendingDays}天无消费记录，节约意识很强` });
    } else if (zeroSpendingRate < 10 && dailyAmounts.length > 20) {
      habits.push({ type: 'info' as const, message: '几乎每天都有消费，考虑安排无消费日' });
      recommendations.push({ message: '尝试设定每周1-2个无消费日，培养节约习惯', priority: 'low' as const });
    }

    // Analyze spending habits with more granular insights
    if (financialHealth.savingsRate < -10) {
      habits.push({ type: 'warning' as const, message: '严重透支，支出远超收入' });
      recommendations.push({ message: '立即制定紧缩预算，削减所有非必要开支', priority: 'high' as const });
    } else if (financialHealth.savingsRate < 0) {
      habits.push({ type: 'warning' as const, message: '入不敷出，本月支出超过收入' });
      recommendations.push({ message: '建议暂停娱乐消费，优先保障基本生活', priority: 'high' as const });
    } else if (financialHealth.savingsRate < 10) {
      habits.push({ type: 'info' as const, message: '储蓄率偏低，几乎没有结余' });
      recommendations.push({ message: '设定月储蓄目标，哪怕只储蓄收入的5%', priority: 'medium' as const });
    } else if (financialHealth.savingsRate < 20) {
      habits.push({ type: 'info' as const, message: '储蓄率一般，还有提升空间' });
      recommendations.push({ message: '尝试减少10%的日常开销，增加储蓄比例', priority: 'medium' as const });
    } else if (financialHealth.savingsRate < 30) {
      habits.push({ type: 'success' as const, message: '储蓄状况不错，继续保持' });
      recommendations.push({ message: '考虑建立应急基金，储备3-6个月生活费', priority: 'low' as const });
    } else {
      habits.push({ type: 'success' as const, message: '储蓄率优秀，财务状况非常健康' });
      recommendations.push({ message: '探索理财投资机会，让资金保值增值', priority: 'low' as const });
    }

    // Enhanced expense growth analysis with detailed categories
    if (financialHealth.expenseGrowthRate > 50) {
      habits.push({ type: 'warning' as const, message: '支出激增！本月消费大幅上涨' });
      recommendations.push({ message: '立即审查本月所有大额支出，找出超支原因', priority: 'high' as const });
    } else if (financialHealth.expenseGrowthRate > 30) {
      habits.push({ type: 'warning' as const, message: '支出增长较快，需要关注' });
      recommendations.push({ message: '对比上月消费，识别异常增长类别', priority: 'high' as const });
    } else if (financialHealth.expenseGrowthRate > 15) {
      habits.push({ type: 'info' as const, message: '支出有所增加，注意控制' });
      recommendations.push({ message: '适度控制非必需消费，避免持续增长', priority: 'medium' as const });
    } else if (financialHealth.expenseGrowthRate > 5) {
      habits.push({ type: 'info' as const, message: '支出温和增长，在正常范围内' });
    } else if (financialHealth.expenseGrowthRate > -5) {
      habits.push({ type: 'success' as const, message: '支出保持稳定，控制得不错' });
    } else if (financialHealth.expenseGrowthRate > -15) {
      habits.push({ type: 'success' as const, message: '支出有所下降，节约效果明显' });
      recommendations.push({ message: '继续保持良好的消费习惯', priority: 'low' as const });
    } else {
      habits.push({ type: 'success' as const, message: '支出大幅减少，节约非常成功' });
      recommendations.push({ message: '可以适当提升生活品质，但保持理性消费', priority: 'low' as const });
    }

    // Enhanced spending structure analysis
    if (topCategories.length >= 3) {
      const top3Percentage = topCategories.slice(0, 3).reduce((sum, cat) => sum + cat.percentage, 0);
      if (top3Percentage > 80) {
        habits.push({ type: 'info' as const, message: '支出过于集中，前三大类占比过高' });
        recommendations.push({ message: '尝试多元化消费，探索新的支出类别', priority: 'medium' as const });
      } else if (top3Percentage < 50) {
        habits.push({ type: 'success' as const, message: '支出分布均衡，消费结构合理' });
      }
    }

    if (topCategories.length > 0) {
      if (topCategories[0].percentage > 60) {
        habits.push({ type: 'warning' as const, message: `${topCategories[0].name} 占比过高（${topCategories[0].percentage.toFixed(1)}%）` });
        recommendations.push({ message: `重点审视${topCategories[0].name}支出，寻找优化空间`, priority: 'high' as const });
      } else if (topCategories[0].percentage > 40) {
        habits.push({ type: 'info' as const, message: `${topCategories[0].name} 是主要支出类别（${topCategories[0].percentage.toFixed(1)}%）` });
        recommendations.push({ message: `适当控制${topCategories[0].name}支出比例`, priority: 'medium' as const });
      }

      if (topCategories.length >= 2 && topCategories[1].percentage > 25) {
        habits.push({ type: 'info' as const, message: `${topCategories[1].name} 支出占比较大（${topCategories[1].percentage.toFixed(1)}%）` });
      }
    }

    // Additional practical suggestions based on spending patterns
    if (financialHealth.netBalance > 0 && financialHealth.savingsRate > 10) {
      // User is saving well, provide investment/savings advice
      if (financialHealth.netBalance > 10000) {
        recommendations.push({ message: '可以考虑将部分结余用于定期存款或低风险理财', priority: 'low' as const });
      }
      if (zeroSpendingRate < 30) {
        recommendations.push({ message: '周末尝试自制餐食，既能节省开支又健康', priority: 'low' as const });
      }
    }

    if (avgDailySpend > 500) {
      recommendations.push({ message: '每日平均支出较高，考虑使用优惠券和折扣', priority: 'medium' as const });
    }

    if (periodTransactions.length > 50) {
      // Frequent spender
      const highFrequencyCategories = periodTransactions.reduce((acc: Record<string, number>, t) => {
        const cat = categories.find(c => c.id === t.categoryId);
        const name = cat?.name || '未知';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const mostFrequent = (Object.entries(highFrequencyCategories) as [string, number][])
        .sort(([, a], [, b]) => b - a)[0];

      if (mostFrequent && mostFrequent[1] > 15) {
        recommendations.push({ message: `${mostFrequent[0]}消费频率很高，考虑是否有更经济的选择`, priority: 'medium' as const });
      }
    }

    // Encourage positive behaviors
    if (recommendations.length === 0) {
      habits.push({ type: 'success' as const, message: '理财状况非常理想，继续保持优秀习惯' });
      recommendations.push({ message: '考虑设定更高的财务目标，挑战自我', priority: 'low' as const });
    }

    // If LLM results are available, override habits and recommendations
    if (llmConfig.enabled) {
      if (llmInsights) {
        return {
          topCategories,
          habits: llmInsights.habits,
          recommendations: llmInsights.recommendations
        };
      }
      // AI enabled but not loaded yet, return empty to show loading state
      return {
        topCategories,
        habits: [],
        recommendations: []
      };
    }

    return {
      topCategories,
      habits,
      recommendations
    };
  }, [transactions, categories, selectedPeriod, financialHealth, llmInsights, llmConfig.enabled]);

  // Effect to trigger LLM analysis
  useEffect(() => {
    if (!llmConfig.enabled || !llmConfig.apiKey || !llmConfig.baseUrl) {
      setLlmInsights(null);
      return;
    }

    const generateAnalysis = async () => {
      setIsLoadingLLM(true);
      try {
        // Prepare data for LLM
        const periodName = selectedPeriod === 'month' ? '本月' : selectedPeriod === 'quarter' ? '本季度' : '本年度';

        // Helper to get category name
        const getCatName = (id: string) => categories.find(c => c.id === id)?.name || '未知';

        // Simplified transactions for context (top 20 largest expenses)
        // We don't want to send too much data
        const now = new Date();
        let periodStart = new Date();
        if (selectedPeriod === 'month') periodStart.setMonth(now.getMonth(), 1);
        else if (selectedPeriod === 'quarter') periodStart.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
        else periodStart.setMonth(0, 1);
        periodStart.setHours(0, 0, 0, 0);

        const relevantTrans = transactions.filter(t => new Date(t.date) >= periodStart);
        const totalIncome = relevantTrans.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const totalExpense = relevantTrans.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

        const topExpenses = relevantTrans
          .filter(t => t.type === 'expense')
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10)
          .map(t => `${t.date}: ${getCatName(t.categoryId)} - ${t.amount}元 (${t.note})`)
          .join('\n');

        const prompt = `
你是一个专业的财务理财顾问。请根据以下用户的近期财务数据进行分析，生成简短犀利的消费洞察和理财建议。
时间范围：${periodName}
总收入：${totalIncome.toFixed(2)}
总支出：${totalExpense.toFixed(2)}
净结余：${(totalIncome - totalExpense).toFixed(2)}
前十大笔支出：
${topExpenses}

请返回 strictly JSON 格式的数据，不要包含 markdown 代码块标记，结构如下：
{
  "habits": [
    {"type": "warning", "message": "简短的警示性洞察"},
    {"type": "success", "message": "简短的鼓励性洞察"},
    {"type": "info", "message": "客观的消费事实"}
  ],
  "recommendations": [
    {"message": "具体的理财建议", "priority": "high|medium|low"}
  ]
}
注意：
1. habits 至少3条，recommendations 至少3条。
2. type 只能是 warning, success, info 之一。
3. priority 只能是 high, medium, low 之一。
4. 语言风格要专业、客观但易懂。
`;

        const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${llmConfig.apiKey}`
          },
          body: JSON.stringify({
            model: llmConfig.modelName || 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: 'You are a helpful financial assistant that outputs raw JSON.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7
          })
        });

        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        const content = data.choices[0]?.message?.content;

        if (content) {
          // Try to parse JSON from potential markdown code blocks
          const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
          const parsed = JSON.parse(jsonStr);
          if (parsed.habits && parsed.recommendations) {
            setLlmInsights(parsed);
          }
        }
      } catch (error) {
        console.error('LLM Analysis failed:', error);
        // Fallback to local analysis silently
      } finally {
        setIsLoadingLLM(false);
      }
    };

    // Debounce or just run? Let's run when dependencies change. 
    // To avoid too many calls, maybe we can add a manual trigger or just rely on useEffect
    // Given it's a "Wallet" app, data changes when user adds transaction.
    // We can use a timeout to debounce.
    const timer = setTimeout(generateAnalysis, 1000);
    return () => clearTimeout(timer);

  }, [transactions, selectedPeriod, llmConfig]);


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
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${selectedPeriod === period.value
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
      <div className="bg-white border border-border p-6 rounded-2xl relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-primary">消费洞察</h3>
          {(isLoadingLLM || (llmConfig.enabled && !llmInsights)) && (
            <div className="flex items-center gap-2 text-xs text-secondary animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>AI 思考中...</span>
            </div>
          )}
          {!isLoadingLLM && llmConfig.enabled && llmInsights && (
            <div className="flex items-center gap-1 text-xs text-purple-500">
              <Sparkles className="w-3 h-3" />
              <span>AI 生成</span>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {spendingInsights.habits.map((habit, index) => (
            <div key={index} className={`flex items-start gap-3 p-3 rounded-lg ${habit.type === 'success' ? 'bg-green-50' :
              habit.type === 'warning' ? 'bg-red-50' : 'bg-blue-50'
              }`}>
              {habit.type === 'success' ? (
                <Award className="w-4 h-4 text-success mt-0.5" />
              ) : habit.type === 'warning' ? (
                <AlertCircle className="w-4 h-4 text-danger mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-info mt-0.5" />
              )}
              <span className={`text-sm ${habit.type === 'success' ? 'text-success' :
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
      {(spendingInsights.recommendations.length > 0 || (llmConfig.enabled && !llmInsights)) && (
        <div className="bg-white border border-border p-6 rounded-2xl relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-primary">理财建议</h3>
            {(isLoadingLLM || (llmConfig.enabled && !llmInsights)) && (
              <div className="flex items-center gap-2 text-xs text-secondary animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>AI 思考中...</span>
              </div>
            )}
            {!isLoadingLLM && llmConfig.enabled && llmInsights && (
              <div className="flex items-center gap-1 text-xs text-purple-500">
                <Sparkles className="w-3 h-3" />
                <span>AI 生成</span>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {spendingInsights.recommendations.map((rec, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-surface">
                <div className={`w-2 h-2 rounded-full mt-2 ${rec.priority === 'high' ? 'bg-red-500' :
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