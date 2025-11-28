import React, { useState } from 'react';
import { X, Check, Calendar, Plus, ChevronLeft, Repeat } from 'lucide-react';
import { TransactionType, Category, RecurringFrequency } from '../types';
import { getIconComponent, COLORS } from '../constants';
import { v4 as uuidv4 } from 'uuid';

interface AddTransactionProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: any) => void;
  onAddRecurring?: (data: any) => void;
  categories: Category[];
  onAddCategory: (category: Category) => void;
}

const AddTransaction: React.FC<AddTransactionProps> = ({ isOpen, onClose, onAdd, onAddRecurring, categories, onAddCategory }) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(COLORS[0]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !categoryId) return;
    
    const numAmount = parseFloat(amount);
    
    if (isRecurring && onAddRecurring) {
        onAddRecurring({
            amount: numAmount,
            type,
            categoryId,
            note,
            frequency,
            startDate: date 
        });
    } else {
        onAdd({
            amount: numAmount,
            type,
            categoryId,
            date,
            note
        });
    }
    
    // Reset
    setAmount('');
    setNote('');
    setCategoryId('');
    setDate(new Date().toISOString().split('T')[0]);
    setIsRecurring(false);
    onClose();
  };

  const handleCreateCategory = () => {
    if (!newCatName.trim()) return;
    const newCat: Category = {
      id: uuidv4(),
      name: newCatName,
      icon: 'Star',
      color: newCatColor,
      type
    };
    onAddCategory(newCat);
    setCategoryId(newCat.id);
    setIsCreatingCategory(false);
    setNewCatName('');
  };

  const filteredCategories = categories.filter(c => c.type === type);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-900/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md h-[95vh] sm:h-auto sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col animate-slide-up overflow-hidden">
        
        {/* Minimal Header */}
        <div className="p-6 flex items-center justify-between">
            <button onClick={isCreatingCategory ? () => setIsCreatingCategory(false) : onClose} className="p-2 -ml-2 text-primary hover:bg-surface rounded-full transition-colors">
                {isCreatingCategory ? <ChevronLeft className="w-6 h-6" /> : <X className="w-6 h-6" />}
            </button>
            <div className="flex bg-surface p-1 rounded-lg border border-border">
               <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                    type === 'expense' ? 'bg-primary text-white' : 'text-secondary hover:text-primary'
                  }`}
               >
                  支出
               </button>
               <button
                  type="button"
                  onClick={() => setType('income')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                    type === 'income' ? 'bg-primary text-white' : 'text-secondary hover:text-primary'
                  }`}
               >
                  收入
               </button>
            </div>
            <div className="w-10"></div>
        </div>

        {isCreatingCategory ? (
          // CREATE CATEGORY
          <div className="flex-1 p-8 flex flex-col gap-8">
            <h2 className="text-2xl font-light">New Category</h2>
            <input
                  type="text"
                  autoFocus
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Category Name"
                  className="w-full text-3xl font-bold border-b border-border pb-2 focus:border-primary placeholder-zinc-200 outline-none"
            />
            
            <div className="grid grid-cols-6 gap-4">
                 {COLORS.map(color => (
                   <button
                     key={color}
                     onClick={() => setNewCatColor(color)}
                     className={`w-10 h-10 rounded-full transition-all ${newCatColor === color ? 'scale-125 ring-2 ring-primary ring-offset-2' : 'opacity-80'}`}
                     style={{ backgroundColor: color }}
                   />
                 ))}
            </div>

             <button
                onClick={handleCreateCategory}
                disabled={!newCatName.trim()}
                className="mt-auto w-full bg-primary text-white py-4 rounded-xl font-bold"
            >
                Create
            </button>
          </div>
        ) : (
          // ADD TRANSACTION
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 pb-6 space-y-8">
            
            {/* Huge Amount Input */}
            <div className="flex flex-col items-center justify-center py-4">
               <div className="flex items-baseline gap-1 text-primary">
                  <span className="text-4xl font-light">¥</span>
                  <input
                      type="number"
                      step="0.01"
                      autoFocus
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full max-w-[240px] text-center text-6xl font-bold text-primary placeholder-zinc-200 bg-transparent border-none focus:ring-0 p-0"
                      placeholder="0"
                  />
               </div>
            </div>

            {/* Category Grid */}
            <div>
               <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 block">Category</label>
               <div className="grid grid-cols-4 gap-4">
                  {filteredCategories.map(cat => {
                      const Icon = getIconComponent(cat.icon);
                      const isSelected = categoryId === cat.id;
                      return (
                          <button
                              key={cat.id}
                              type="button"
                              onClick={() => setCategoryId(cat.id)}
                              className={`flex flex-col items-center gap-2 transition-all ${
                                  isSelected ? 'opacity-100 scale-105' : 'opacity-50 hover:opacity-80'
                              }`}
                          >
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                                  isSelected ? 'bg-primary text-white shadow-lg' : 'bg-surface text-primary border border-border'
                              }`}>
                                  <Icon className="w-5 h-5" />
                              </div>
                              <span className="text-[10px] font-medium text-primary truncate w-full text-center">
                                  {cat.name}
                              </span>
                          </button>
                      );
                  })}
                  <button
                      type="button"
                      onClick={() => setIsCreatingCategory(true)}
                      className="flex flex-col items-center gap-2 opacity-50 hover:opacity-80"
                  >
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-surface border border-dashed border-zinc-400 text-zinc-400">
                          <Plus className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] font-medium text-primary">Add</span>
                  </button>
               </div>
            </div>

            {/* Details */}
            <div className="space-y-4">
               <div className="flex gap-4">
                  <div className="flex-1 relative">
                      <Calendar className="absolute left-3 top-3.5 w-4 h-4 text-zinc-400" />
                      <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="w-full bg-surface border border-border rounded-xl py-3 pl-10 pr-4 text-sm font-medium"
                      />
                  </div>
                  <div className="flex-1">
                      <input
                          type="text"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="备注..."
                          className="w-full bg-surface border border-border rounded-xl py-3 px-4 text-sm font-medium"
                      />
                  </div>
               </div>

               {/* Recurring Toggle - Minimal */}
               <div className="flex items-center justify-between bg-surface p-3 rounded-xl border border-border">
                   <div className="flex items-center gap-2 text-sm font-medium text-primary">
                       <Repeat className="w-4 h-4" />
                       <span>周期重复</span>
                   </div>
                   <input 
                       type="checkbox" 
                       checked={isRecurring}
                       onChange={(e) => setIsRecurring(e.target.checked)}
                       className="w-5 h-5 accent-primary"
                   />
               </div>
               
               {isRecurring && (
                   <div className="grid grid-cols-4 gap-2">
                       {(['daily', 'weekly', 'monthly', 'yearly'] as RecurringFrequency[]).map(freq => (
                           <button
                               key={freq}
                               type="button"
                               onClick={() => setFrequency(freq)}
                               className={`py-2 text-[10px] font-bold uppercase rounded-lg border ${
                                   frequency === freq 
                                   ? 'bg-primary text-white border-primary' 
                                   : 'bg-white text-secondary border-border'
                               }`}
                           >
                               {freq}
                           </button>
                       ))}
                   </div>
               )}
            </div>
            
            <button
                type="submit"
                className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-zinc-800 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                <Check className="w-5 h-5" />
                <span>Save</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AddTransaction;