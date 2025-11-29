import React, { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, PieChart, Plus, BarChart3, Settings as SettingsIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import { Transaction, AppTab, Category, RecurringProfile, RecurringFrequency } from './types';
import { DEFAULT_CATEGORIES } from './constants';
import Dashboard from './components/Dashboard';
import Stats from './components/Stats';
import Analysis from './components/Analysis';
import AddTransaction from './components/AddTransaction';
import Settings from './components/Settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [recurringProfiles, setRecurringProfiles] = useState<RecurringProfile[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Helper to calculate next date
  const calculateNextDate = (dateStr: string, freq: RecurringFrequency): string => {
    const date = new Date(dateStr);
    switch (freq) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        const currentMonth = date.getMonth();
        date.setMonth(currentMonth + 1);
        // Handle month end overflow
        if (date.getMonth() !== (currentMonth + 1) % 12) {
          date.setDate(0); 
        }
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }
    return date.toISOString().split('T')[0];
  };

  // Process recurring transactions
  const processRecurringTransactions = useCallback((profiles: RecurringProfile[], currentTrans: Transaction[]) => {
    const today = new Date().toISOString().split('T')[0];
    let newTransactions: Transaction[] = [];
    let updatedProfiles = profiles.map(p => ({ ...p }));
    let hasUpdates = false;

    updatedProfiles.forEach(profile => {
      while (profile.nextDueDate <= today) {
        hasUpdates = true;
        newTransactions.push({
          id: uuidv4(),
          amount: profile.amount,
          type: profile.type,
          categoryId: profile.categoryId,
          date: profile.nextDueDate,
          note: `(自动) ${profile.note}`
        });
        profile.nextDueDate = calculateNextDate(profile.nextDueDate, profile.frequency);
      }
    });

    return { hasUpdates, updatedProfiles, newTransactions };
  }, []);

  // Load/Save logic remains same ...
  useEffect(() => {
    const savedTransactions = localStorage.getItem('smartwallet_transactions');
    const savedCategories = localStorage.getItem('smartwallet_categories');
    const savedRecurring = localStorage.getItem('smartwallet_recurring');
    
    let loadedTransactions: Transaction[] = [];
    let loadedProfiles: RecurringProfile[] = [];

    if (savedTransactions) {
      try { loadedTransactions = JSON.parse(savedTransactions); } catch (e) { console.error(e); }
    }

    if (savedCategories) {
      try {
        const loaded: Category[] = JSON.parse(savedCategories);
        const updated = loaded.map(c => {
          const def = DEFAULT_CATEGORIES.find(d => d.id === c.id);
          if (def) return { ...c, name: def.name }; // Keep names synced with constants if only ID matches
          return c;
        });
        setCategories(updated);
      } catch (e) { console.error(e); }
    }

    if (savedRecurring) {
      try { loadedProfiles = JSON.parse(savedRecurring); } catch (e) { console.error(e); }
    }

    const result = processRecurringTransactions(loadedProfiles, loadedTransactions);
    setTransactions([...result.newTransactions, ...loadedTransactions]);
    setRecurringProfiles(result.updatedProfiles);
    setIsInitialized(true);
  }, [processRecurringTransactions]);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('smartwallet_transactions', JSON.stringify(transactions));
      localStorage.setItem('smartwallet_categories', JSON.stringify(categories));
      localStorage.setItem('smartwallet_recurring', JSON.stringify(recurringProfiles));
    }
  }, [transactions, categories, recurringProfiles, isInitialized]);

  // Handlers ...
  const handleAddTransaction = (data: Omit<Transaction, 'id'>) => {
    const newTransaction: Transaction = { id: uuidv4(), ...data };
    setTransactions(prev => [newTransaction, ...prev]);
  };

  const handleUpdateTransaction = (id: string, data: Partial<Transaction>) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
  };

  const handleEditRequest = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setEditingTransaction(null);
  };

  const handleAddRecurring = (data: Omit<RecurringProfile, 'id' | 'nextDueDate'>) => {
    const newProfile: RecurringProfile = {
      id: uuidv4(),
      nextDueDate: data.startDate, 
      ...data
    };
    const today = new Date().toISOString().split('T')[0];
    if (newProfile.nextDueDate <= today) {
       const result = processRecurringTransactions([newProfile], transactions);
       if (result.hasUpdates) {
          setTransactions(prev => [...result.newTransactions, ...prev]);
          setRecurringProfiles(prev => [...prev, result.updatedProfiles[0]]);
       } else {
          setRecurringProfiles(prev => [...prev, newProfile]);
       }
    } else {
       setRecurringProfiles(prev => [...prev, newProfile]);
    }
  };

  const handleDeleteRecurring = (id: string) => {
    if (window.confirm('确定要删除此规则吗？')) {
      setRecurringProfiles(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleDeleteTransaction = (id: string) => {
    if (window.confirm('确认删除？')) {
        setTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleAddCategory = (category: Category) => {
    setCategories(prev => [...prev, category]);
  };

  const handleImportTransactions = (importedData: Transaction[], mode: 'append' | 'overwrite') => {
    if (mode === 'overwrite') {
        if (window.confirm('警告：覆盖模式将清空现有数据。继续吗？')) {
            setTransactions(importedData);
            alert(`成功导入 ${importedData.length} 条数据。`);
        }
    } else {
        setTransactions(prev => [...importedData, ...prev]);
        alert(`成功追加 ${importedData.length} 条数据。`);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case AppTab.DASHBOARD:
        return (
          <Dashboard
            transactions={transactions}
            categories={categories}
            onEdit={handleEditRequest}
          />
        );
      case AppTab.STATS:
        return <Stats transactions={transactions} categories={categories} />;
      case AppTab.ANALYSIS:
        return <Analysis transactions={transactions} categories={categories} />;
      case AppTab.SETTINGS:
        return (
            <Settings
                transactions={transactions}
                categories={categories}
                recurringProfiles={recurringProfiles}
                onImport={handleImportTransactions}
                onDeleteRecurring={handleDeleteRecurring}
            />
        );
      default:
        return (
          <Dashboard
            transactions={transactions}
            categories={categories}
            onEdit={handleEditRequest}
          />
        );
    }
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case AppTab.DASHBOARD: return '我的账本';
      case AppTab.STATS: return '数据统计';
      case AppTab.ANALYSIS: return '财务分析';
      case AppTab.SETTINGS: return '设置';
      default: return 'SmartWallet';
    }
  };

  return (
    <div className="min-h-screen bg-background text-primary font-sans relative">
      
      {/* Minimalist Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border px-6 h-16 flex items-center justify-between transition-all">
        <h1 className="text-2xl font-bold tracking-tight text-primary">
            {getHeaderTitle()}
        </h1>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto p-4 pb-20 min-h-screen animate-fade-in" style={{paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))'}}>
        {renderContent()}
      </main>

      {/* Minimalist Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-lg border-t border-border" style={{paddingBottom: 'env(safe-area-inset-bottom)'}}>
        <div className="max-w-2xl mx-auto grid grid-cols-5 h-16 items-center">

          <NavButton
            active={activeTab === AppTab.DASHBOARD}
            onClick={() => setActiveTab(AppTab.DASHBOARD)}
            icon={LayoutDashboard}
          />

          <NavButton
            active={activeTab === AppTab.STATS}
            onClick={() => setActiveTab(AppTab.STATS)}
            icon={PieChart}
          />

          {/* Center Add Button */}
          <div className="relative flex items-center justify-center">
             <button
                onClick={() => {
                  setEditingTransaction(null);
                  setIsAddModalOpen(true);
                }}
                className="absolute -top-6 w-14 h-14 bg-primary text-white rounded-full shadow-lg shadow-zinc-200 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
             >
                <Plus className="w-7 h-7" />
             </button>
          </div>

          <NavButton
            active={activeTab === AppTab.ANALYSIS}
            onClick={() => setActiveTab(AppTab.ANALYSIS)}
            icon={BarChart3}
          />

          <NavButton
            active={activeTab === AppTab.SETTINGS}
            onClick={() => setActiveTab(AppTab.SETTINGS)}
            icon={SettingsIcon}
          />
        </div>
      </nav>

      <AddTransaction
        isOpen={isAddModalOpen}
        onClose={handleCloseAddModal}
        onAdd={handleAddTransaction}
        onUpdate={handleUpdateTransaction}
        onDelete={handleDeleteTransaction}
        onAddRecurring={handleAddRecurring}
        categories={categories}
        onAddCategory={handleAddCategory}
        editData={editingTransaction}
      />
    </div>
  );
};

const NavButton = ({ active, onClick, icon: Icon }: any) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 ${
      active ? 'text-primary' : 'text-zinc-300 hover:text-zinc-500'
    }`}
  >
    <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 2} />
    {active && <span className="w-1 h-1 bg-primary rounded-full mt-1"></span>}
  </button>
);

export default App;