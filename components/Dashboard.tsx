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
      
      {/* Month Header - Minimalist */}
      <div className="flex items-center justify-between mb-8 px-2">
         {/* Left: Date (Interactive) */}
         <div className="relative group cursor-pointer">
            <div className="text-3xl font-light tracking-tight text-primary whitespace-nowrap flex items-baseline gap-2 pointer-events-none">
               {month}月 <span className="text-lg text-secondary font-normal">{year}</span>
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
         
         {/* Right: Stats & Nav */}
         <div className="flex items-center gap-4">
             {/* Stats */}
             <div className="flex gap-4 text-right">
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-secondary uppercase tracking-wider">支出</span>
                    <span className="font-semibold text-primary text-sm">¥{monthlyData.stats.expense.toFixed(2)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-secondary uppercase tracking-wider">收入</span>
                    <span className="font-semibold text-primary text-sm">¥{monthlyData.stats.income.toFixed(2)}</span>
                </div>
             </div>

             <div className="w-[1px] h-8 bg-border hidden sm:block"></div>

             {/* Nav */}
             <div className="flex gap-1 pl-2 border-l border-border sm:border-0 sm:pl-0">
                 <button onClick={() => changeMonth(-1)} className="p-1.5 text-zinc-300 hover:text-primary transition-colors hover:bg-surface rounded-full">
                     <ChevronLeft className="w-5 h-5" />
                 </button>
                 <button onClick={() => changeMonth(1)} className="p-1.5 text-zinc-300 hover:text-primary transition-colors hover:bg-surface rounded-full">
                     <ChevronRight className="w-5 h-5" />
                 </button>
             </div>
         </div>
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto pb-24 space-y-8 scroll-smooth">
        {monthlyData.dates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-300">
              <Ban className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-light">本月无记录</p>
            </div>
        ) : (
            monthlyData.dates.map(dateKey => {
                const dayData = monthlyData.grouped[dateKey];
                const dateObj = new Date(dateKey);
                const day = dateObj.getDate();
                const weekday = dateObj.toLocaleDateString('zh-CN', { weekday: 'short' });

                return (
                    <div key={dateKey} className="group">
                        <div className="flex items-end justify-between px-2 mb-3 border-b border-dashed border-border pb-1">
                            <div className="flex items-baseline gap-2">
                                <span className="text-xl font-bold text-primary">{day}</span>
                                <span className="text-xs text-secondary">{weekday}</span>
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">
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
                                      className="px-3 py-2 flex items-center justify-between group/item cursor-pointer hover:bg-surface rounded-lg transition-colors -mx-2 relative"
                                    >
                                        <div className="flex items-center gap-4 overflow-hidden">
                                            {/* Minimalist Icon: Just the icon, no background container, or very subtle */}
                                            <div className="text-primary opacity-80">
                                                <Icon className="w-5 h-5" strokeWidth={1.5} />
                                            </div>
                                            <div className="min-w-0 flex flex-col">
                                                <p className="text-sm font-medium text-primary truncate">{category?.name}</p>
                                                {t.note && <p className="text-[10px] text-zinc-400 truncate max-w-[120px]">{t.note}</p>}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`font-medium text-sm tabular-nums tracking-tight ${
                                                t.type === 'income' ? 'text-success' : 'text-primary'
                                            }`}>
                                                {t.type === 'income' ? '+' : '-'} {t.amount.toFixed(2)}
                                            </span>
                                            
                                            {/* Delete Button: Hidden by default (opacity-0), shown on hover/group-hover */}
                                            <button 
                                                onClick={(e) => {
                                                  // Critical: Stop propagation to prevent editing modal from opening
                                                  e.stopPropagation();
                                                  onDelete(t.id);
                                                }}
                                                // Added z-10 to ensure it sits on top of the row click area
                                                className="w-8 h-8 flex items-center justify-center bg-danger text-white rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-all ml-1 shrink-0 opacity-0 group-hover/item:opacity-100 z-10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
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