import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Transaction, Category, TransactionType } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, CartesianGrid, YAxis } from 'recharts';

interface StatsProps {
  transactions: Transaction[];
  categories: Category[];
}

type ViewMode = 'week' | 'month' | 'year';

const Stats: React.FC<StatsProps> = ({ transactions, categories }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [chartType, setChartType] = useState<TransactionType>('expense');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1. Generate Periods based on ViewMode
  const periods = useMemo(() => {
    const today = new Date();
    const list: { label: string; value: string; start: Date; end: Date }[] = [];
    
    // Generate last 12 units
    for (let i = 0; i < 12; i++) {
        const d = new Date();
        let label = '';
        let value = '';
        let start = new Date();
        let end = new Date();

        if (viewMode === 'week') {
            const day = today.getDay() || 7; // 1-7
            d.setDate(today.getDate() - (day - 1) - (i * 7));
            start = new Date(d);
            start.setHours(0,0,0,0);
            end = new Date(start);
            end.setDate(end.getDate() + 6);
            end.setHours(23,59,59,999);
            
            const startStr = `${start.getMonth()+1}/${start.getDate()}`;
            const endStr = `${end.getMonth()+1}/${end.getDate()}`;
            label = i === 0 ? '本周' : `${startStr}-${endStr}`;
            value = `W-${start.getTime()}`;
        } else if (viewMode === 'month') {
            d.setMonth(today.getMonth() - i);
            d.setDate(1);
            start = new Date(d);
            start.setHours(0,0,0,0);
            end = new Date(start);
            end.setMonth(end.getMonth() + 1);
            end.setDate(0); 
            end.setHours(23,59,59,999);

            label = i === 0 ? '本月' : `${d.getFullYear()}年${d.getMonth() + 1}月`;
            value = `M-${d.getFullYear()}-${d.getMonth()}`;
        } else if (viewMode === 'year') {
            d.setFullYear(today.getFullYear() - i);
            d.setMonth(0, 1);
            start = new Date(d);
            start.setHours(0,0,0,0);
            end = new Date(start);
            end.setFullYear(end.getFullYear() + 1);
            end.setDate(0);
            end.setHours(23,59,59,999);

            label = i === 0 ? '今年' : `${d.getFullYear()}年`;
            value = `Y-${d.getFullYear()}`;
        }
        list.push({ label, value, start, end });
    }
    return list;
  }, [viewMode]);

  useEffect(() => {
      if (periods.length > 0) {
          setSelectedPeriod(periods[0].value);
          if (scrollRef.current) scrollRef.current.scrollLeft = 0;
      }
  }, [periods]);

  // 2. Filter Transactions
  const currentPeriodData = useMemo(() => {
      const period = periods.find(p => p.value === selectedPeriod);
      if (!period) return { transactions: [], totalIncome: 0, totalExpense: 0, period: null };

      const filtered = transactions.filter(t => {
          const d = new Date(t.date);
          return d >= period.start && d <= period.end;
      });

      const totalIncome = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const totalExpense = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

      return { transactions: filtered, totalIncome, totalExpense, period };
  }, [selectedPeriod, periods, transactions]);

  // 3. Trend Data
  const trendData = useMemo(() => {
      if (!currentPeriodData.period) return [];
      const { start, end } = currentPeriodData.period;
      const data: any[] = [];
      const isYearView = viewMode === 'year';

      const map = new Map<string, { income: number; expense: number; label: string }>();

      if (isYearView) {
          for (let m = 0; m < 12; m++) {
              const d = new Date(start.getFullYear(), m, 1);
              const key = `${d.getFullYear()}-${m}`;
              map.set(key, { income: 0, expense: 0, label: `${m+1}月` });
          }
      } else {
          const curr = new Date(start);
          while (curr <= end) {
              const key = curr.toISOString().split('T')[0];
              const label = `${curr.getDate()}日`; 
              map.set(key, { income: 0, expense: 0, label });
              curr.setDate(curr.getDate() + 1);
          }
      }

      currentPeriodData.transactions.forEach(t => {
          const d = new Date(t.date);
          let key = '';
          if (isYearView) key = `${d.getFullYear()}-${d.getMonth()}`;
          else key = t.date;

          if (map.has(key)) {
              const item = map.get(key)!;
              if (t.type === 'income') item.income += t.amount;
              else item.expense += t.amount;
          }
      });

      map.forEach((val) => data.push(val));
      return data;
  }, [currentPeriodData, viewMode]);

  // 4. Category Data
  const categoryData = useMemo(() => {
      const filtered = currentPeriodData.transactions.filter(t => t.type === chartType);
      const agg = filtered.reduce((acc, t) => {
        const cat = categories.find(c => c.id === t.categoryId);
        const name = cat?.name || '未知';
        const color = cat?.color || '#52525b';
        if (!acc[name]) acc[name] = { name, value: 0, color };
        acc[name].value += t.amount;
        return acc;
      }, {} as Record<string, { name: string; value: number; color: string }>);

      return (Object.values(agg) as { name: string; value: number; color: string }[]).sort((a, b) => b.value - a.value);
  }, [currentPeriodData, chartType, categories]);

  return (
    <div className="flex flex-col h-full animate-slide-up pb-24 space-y-8">
      
      {/* 1. Mode Switcher */}
      <div className="flex bg-surface p-1.5 rounded-2xl border border-border">
          {(['week', 'month', 'year'] as ViewMode[]).map(mode => (
              <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
                      viewMode === mode 
                      ? 'bg-primary text-white shadow-sm' 
                      : 'text-secondary hover:text-primary'
                  }`}
              >
                  {mode === 'week' ? '周' : mode === 'month' ? '月' : '年'}
              </button>
          ))}
      </div>

      {/* 2. Period Selector */}
      <div className="relative">
          <div 
            ref={scrollRef}
            className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide snap-x" 
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
              {periods.map(p => (
                  <button
                      key={p.value}
                      onClick={() => setSelectedPeriod(p.value)}
                      className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-medium border snap-start transition-all ${
                          selectedPeriod === p.value
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-secondary border-border hover:border-zinc-400'
                      }`}
                  >
                      {p.label}
                  </button>
              ))}
          </div>
          <div className="absolute right-0 top-0 bottom-2 w-10 bg-gradient-to-l from-white to-transparent pointer-events-none"></div>
      </div>

      {/* 3. Overview */}
      <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-border p-5 rounded-2xl">
              <p className="text-xs text-secondary uppercase tracking-wider mb-2">总支出</p>
              <p className="text-2xl font-bold text-primary">¥{currentPeriodData.totalExpense.toFixed(2)}</p>
          </div>
          <div className="bg-white border border-border p-5 rounded-2xl">
              <p className="text-xs text-secondary uppercase tracking-wider mb-2">总收入</p>
              <p className="text-2xl font-bold text-success">¥{currentPeriodData.totalIncome.toFixed(2)}</p>
          </div>
      </div>

      {/* 4. Trend Chart */}
      <div className="bg-white border border-border p-6 rounded-2xl">
          <h3 className="text-base font-semibold text-primary mb-5">收支趋势</h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#09090b" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#09090b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis 
                    dataKey="label" 
                    tick={{ fontSize: 11, fill: '#a1a1aa' }} 
                    axisLine={false} 
                    tickLine={false}
                    interval={viewMode === 'year' ? 1 : 'preserveStartEnd'}
                />
                <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e4e4e7', fontSize: '12px', boxShadow: 'none' }}
                />
                <Area 
                    type="monotone" 
                    dataKey="expense" 
                    stroke="#09090b" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorExpense)" 
                    name="支出"
                />
                <Area 
                    type="monotone" 
                    dataKey="income" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorIncome)" 
                    name="收入"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
      </div>

      {/* 5. Category Chart */}
      <div className="bg-white border border-border p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
             <h3 className="text-base font-semibold text-primary">分类占比</h3>
             <div className="flex bg-surface rounded-lg p-1 border border-border">
                 <button 
                    onClick={() => setChartType('expense')}
                    className={`px-4 py-1.5 text-xs rounded-md transition-all ${chartType === 'expense' ? 'bg-white shadow-sm text-primary font-bold' : 'text-secondary'}`}
                 >
                    支出
                 </button>
                 <button 
                    onClick={() => setChartType('income')}
                    className={`px-4 py-1.5 text-xs rounded-md transition-all ${chartType === 'income' ? 'bg-white shadow-sm text-primary font-bold' : 'text-secondary'}`}
                 >
                    收入
                 </button>
             </div>
          </div>

          {categoryData.length > 0 ? (
            <div className="flex flex-col gap-8">
                <div className="h-56 w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                        cornerRadius={6}
                        >
                        {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                        </Pie>
                        <Tooltip 
                            formatter={(value: number) => `¥${value.toFixed(2)}`} 
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e4e4e7', boxShadow: 'none' }}
                        />
                    </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
                        <span className="text-xs text-zinc-400 mb-1">Total</span>
                        <span className="text-lg font-bold text-primary">
                            ¥{categoryData.reduce((sum, item) => sum + item.value, 0).toFixed(0)}
                        </span>
                    </div>
                </div>
                
                <div className="flex flex-col gap-3">
                    {categoryData.slice(0, 6).map((item) => (
                        <div key={item.name} className="flex items-center justify-between text-sm w-full">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="text-secondary">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="font-medium text-primary">¥{item.value.toFixed(0)}</span>
                                <span className="text-xs text-zinc-400 w-10 text-right">
                                    {((item.value / (chartType === 'expense' ? currentPeriodData.totalExpense : currentPeriodData.totalIncome)) * 100).toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-zinc-300 text-sm">
                本周期暂无数据
            </div>
          )}
      </div>
    </div>
  );
};

export default Stats;