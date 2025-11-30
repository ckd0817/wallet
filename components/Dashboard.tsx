import React, { useMemo, useState } from 'react';
import { Transaction, Category } from '../types';
import { getIconComponent } from '../constants';
import { Trash2, ChevronLeft, ChevronRight, Ban } from 'lucide-react';

interface DashboardProps {
  transactions: Transaction[];
  categories: Category[];
  onDelete: (id: string) => void;
  onEdit: (transaction: Transaction) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ transactions, categories, onDelete, onEdit }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const changeMonth = (increment: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + increment);
    setCurrentDate(newDate);
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  const monthlyData = useMemo(() => {
    const filtered = transactions.filter(t => t.date.startsWith(monthStr));
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const stats = filtered.reduce((acc, t) => {
        if (t.type === 'income') acc.income += t.amount;
        else acc.expense += t.amount;
        return acc;
    }, { income: 0, expense: 0 });

    const grouped: Record<string, { transactions: Transaction[], dailyIncome: number, dailyExpense: number }> = {};
    
    filtered.forEach(t => {
        if (!grouped[t.date]) {
            grouped[t.date] = { transactions: [], dailyIncome: 0, dailyExpense: 0 };
        }
        grouped[t.date].transactions.push(t);
        if (t.type === 'income') grouped[t.date].dailyIncome += t.amount;
        else grouped[t.date].dailyExpense += t.amount;
    });

    return {
        stats,
        grouped,
        dates: Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    };
  }, [transactions, monthStr]);

  const getCategory = (id: string) => categories.find(c => c.id === id) || categories[0];

  return (
    <div className="flex flex-col h-full animate-slide-up">
      
      {/* Header Section */}
      <div className="flex flex-col gap-6 mb-8 px-2">
         
         {/* Row 1: Date & Navigation */}
         <div className="flex items-center justify-between">
             {/* Left: Date (Interactive) */}
             <div className="relative group cursor-pointer">
                <div className="text-4xl font-light tracking-tight text-primary whitespace-nowrap flex items-baseline gap-2 pointer-events-none">
                   {month}月 <span className="text-xl text-secondary font-normal">{year}</span>
                </div>
                {/* Invisible Date Picker Overlay */}
                <input 
                   type="month"
                   value={monthStr}
                   onChange={(e) => {
                       if (e.target.value) {
                           const [y, m] = e.target.value.split('-').map(Number);
                           setCurrentDate(new Date(y, m - 1, 1));
                       }
                   }}
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                   title="选择日期"
                />
             </div>

             {/* Right: Navigation Arrows */}
             <div className="flex gap-2">
                 <button onClick={() => changeMonth(-1)} className="p-2 text-zinc-400 hover:text-primary transition-colors hover:bg-surface rounded-full border border-transparent hover:border-border">
                     <ChevronLeft className="w-6 h-6" />
                 </button>
                 <button onClick={() => changeMonth(1)} className="p-2 text-zinc-400 hover:text-primary transition-colors hover:bg-surface rounded-full border border-transparent hover:border-border">
                     <ChevronRight className="w-6 h-6" />
                 </button>
             </div>
         </div>

         {/* Row 2: Stats (Moved below for better mobile layout) */}
         <div className="flex items-center gap-12">
            <div className="flex flex-col">
                <span className="text-xs text-secondary uppercase tracking-wider mb-1">支出</span>
                <span className="font-semibold text-primary text-2xl">¥{monthlyData.stats.expense.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
                <span className="text-xs text-secondary uppercase tracking-wider mb-1">收入</span>
                <span className="font-semibold text-primary text-2xl">¥{monthlyData.stats.income.toFixed(2)}</span>
            </div>
         </div>
         
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto pb-24 space-y-8 scroll-smooth">
        {monthlyData.dates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-300">
              <Ban className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-light text-lg">本月无记录</p>
            </div>
        ) : (
            monthlyData.dates.map(dateKey => {
                const dayData = monthlyData.grouped[dateKey];
                const dateObj = new Date(dateKey);
                const day = dateObj.getDate();
                const weekday = dateObj.toLocaleDateString('zh-CN', { weekday: 'short' });

                return (
                    <div key={dateKey} className="group">
                        <div className="flex items-end justify-between px-2 mb-4 border-b border-dashed border-border pb-2">
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold text-primary">{day}</span>
                                <span className="text-sm text-secondary">{weekday}</span>
                            </div>
                            <div className="text-xs text-zinc-400 font-mono">
                               {dayData.dailyExpense > 0 && `-${dayData.dailyExpense.toFixed(0)} `}
                               {dayData.dailyIncome > 0 && `+${dayData.dailyIncome.toFixed(0)}`}
                            </div>
                        </div>

                        <div className="space-y-4">
                            {dayData.transactions.map(t => {
                                const category = getCategory(t.categoryId);
                                const Icon = getIconComponent(category?.icon || 'MoreHorizontal');
                                return (
                                    <div
                                      key={t.id}
                                      onClick={() => onEdit(t)}
                                      className="px-3 py-3 flex items-center justify-between cursor-pointer hover:bg-surface rounded-xl transition-colors -mx-2"
                                    >
                                        <div className="flex items-center gap-5 overflow-hidden">
                                            <div className="text-primary opacity-80">
                                                <Icon className="w-6 h-6" strokeWidth={1.5} />
                                            </div>
                                            <div className="min-w-0 flex flex-col gap-0.5">
                                                <p className="text-base font-medium text-primary truncate">{category?.name}</p>
                                                {t.note && <p className="text-xs text-zinc-400 truncate max-w-[150px]">{t.note}</p>}
                                            </div>
                                        </div>
                                        <span className={`font-medium text-base tabular-nums tracking-tight ${
                                            t.type === 'income' ? 'text-success' : 'text-primary'
                                        }`}>
                                            {t.type === 'income' ? '+' : '-'} {t.amount.toFixed(2)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })
        )}
      </div>
    </div>
  );
};

export default Dashboard;