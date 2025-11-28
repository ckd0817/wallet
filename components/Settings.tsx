import React, { useRef, useState, useEffect } from 'react';
import { Download, Upload, AlertCircle, Repeat, Trash2, Globe, Key, Cpu, CheckCircle2, ChevronRight } from 'lucide-react';
import { Transaction, Category, RecurringProfile, RecurringFrequency } from '../types';
import { getIconComponent } from '../constants';
import { v4 as uuidv4 } from 'uuid';

interface SettingsProps {
  transactions: Transaction[];
  categories: Category[];
  recurringProfiles: RecurringProfile[];
  onImport: (data: Transaction[], mode: 'append' | 'overwrite') => void;
  onDeleteRecurring: (id: string) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
    transactions, 
    categories, 
    recurringProfiles, 
    onImport,
    onDeleteRecurring
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // AI Config
  const [aiConfig, setAiConfig] = useState({ apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-3.5-turbo' });
  const [aiSaved, setAiSaved] = useState(false);

  // Export/Import
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');

  useEffect(() => {
    const saved = localStorage.getItem('smartwallet_ai_config');
    if (saved) try { setAiConfig(JSON.parse(saved)); } catch (e) {}
  }, []);

  const handleSaveAiConfig = () => {
    localStorage.setItem('smartwallet_ai_config', JSON.stringify(aiConfig));
    setAiSaved(true);
    setTimeout(() => setAiSaved(false), 2000);
  };

  const handleExport = () => {
    let dataToExport = transactions;
    if (exportStart) dataToExport = dataToExport.filter(t => t.date >= exportStart);
    if (exportEnd) dataToExport = dataToExport.filter(t => t.date <= exportEnd);

    if (dataToExport.length === 0) { alert('没有可导出的数据'); return; }

    // CSV Header in Chinese
    const headers = ['日期,金额,类型,分类,备注'];
    const rows = dataToExport.map(t => {
      const cat = categories.find(c => c.id === t.categoryId);
      // Ensure note is escaped if it contains commas
      const note = t.note ? `"${t.note.replace(/"/g, '""')}"` : '';
      return `${t.date},${t.amount.toFixed(2)},${t.type},${cat?.name || '未知'},${note}`;
    });

    const csvContent = "\uFEFF" + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'smartwallet_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => fileInputRef.current?.click();
  
  const processImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          const content = evt.target?.result as string;
          if (!content) return;

          const lines = content.split('\n');
          // Remove header if present (check if first line contains "日期")
          const startIdx = lines[0].includes('日期') ? 1 : 0;
          
          const newTransactions: Transaction[] = [];

          for (let i = startIdx; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              
              // Simple CSV split (handling basic quotes)
              // Note: This is a basic parser. For robust parsing, use a library.
              // Assuming standard format from our export: date,amount,type,categoryName,note
              const parts = line.split(','); 
              if (parts.length < 4) continue;

              const date = parts[0];
              const amount = parseFloat(parts[1]);
              const type = parts[2] as 'expense' | 'income';
              const categoryName = parts[3];
              // Handle note potentially having commas if quoted, simplified here taking the rest
              const note = parts.slice(4).join(',').replace(/^"|"$/g, '').replace(/""/g, '"');

              // Map category name back to ID
              const category = categories.find(c => c.name === categoryName) || categories[0];

              if (!isNaN(amount) && date) {
                  newTransactions.push({
                      id: uuidv4(),
                      date,
                      amount,
                      type,
                      categoryId: category.id,
                      note
                  });
              }
          }

          if (newTransactions.length > 0) {
              onImport(newTransactions, importMode);
          } else {
              alert('未能解析出有效数据，请检查文件格式。');
          }
      };
      reader.readAsText(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col h-full space-y-8 animate-slide-up pb-24">
      
      {/* Section: AI */}
      <section>
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-3 px-1">AI 配置</h3>
          <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border space-y-4">
                  <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-secondary" />
                      <input 
                        className="flex-1 text-sm bg-transparent placeholder-zinc-300"
                        placeholder="接口地址 (Base URL)"
                        value={aiConfig.baseUrl}
                        onChange={e => setAiConfig({...aiConfig, baseUrl: e.target.value})}
                      />
                  </div>
                  <div className="flex items-center gap-3">
                      <Key className="w-4 h-4 text-secondary" />
                      <input 
                        className="flex-1 text-sm bg-transparent placeholder-zinc-300"
                        type="password"
                        placeholder="API 密钥 (sk-...)"
                        value={aiConfig.apiKey}
                        onChange={e => setAiConfig({...aiConfig, apiKey: e.target.value})}
                      />
                  </div>
                  <div className="flex items-center gap-3">
                      <Cpu className="w-4 h-4 text-secondary" />
                      <input 
                        className="flex-1 text-sm bg-transparent placeholder-zinc-300"
                        placeholder="模型名称 (例如 gpt-4)"
                        value={aiConfig.model}
                        onChange={e => setAiConfig({...aiConfig, model: e.target.value})}
                      />
                  </div>
              </div>
              <button 
                onClick={handleSaveAiConfig}
                className="w-full py-3 text-sm font-medium hover:bg-surface transition-colors flex items-center justify-center gap-2 text-primary"
              >
                  {aiSaved ? <CheckCircle2 className="w-4 h-4 text-success" /> : '保存配置'}
              </button>
          </div>
      </section>

      {/* Section: Recurring */}
      <section>
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-3 px-1">周期性记账规则</h3>
          <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
             {recurringProfiles.length === 0 ? (
                 <div className="p-4 text-center text-sm text-zinc-400">暂无生效的自动记账规则</div>
             ) : (
                 recurringProfiles.map(p => {
                     const cat = categories.find(c => c.id === p.categoryId);
                     return (
                         <div key={p.id} className="p-4 flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                 <div className="w-2 h-2 rounded-full bg-primary"></div>
                                 <div className="flex flex-col">
                                     <span className="text-sm font-medium">{cat?.name}</span>
                                     <span className="text-[10px] text-secondary uppercase">
                                        {p.frequency === 'daily' && '每天'}
                                        {p.frequency === 'weekly' && '每周'}
                                        {p.frequency === 'monthly' && '每月'}
                                        {p.frequency === 'yearly' && '每年'}
                                     </span>
                                 </div>
                             </div>
                             <div className="flex items-center gap-3">
                                 <span className="font-mono text-sm">¥{p.amount}</span>
                                 <button onClick={() => onDeleteRecurring(p.id)} className="text-zinc-300 hover:text-danger">
                                     <Trash2 className="w-4 h-4" />
                                 </button>
                             </div>
                         </div>
                     );
                 })
             )}
          </div>
      </section>

      {/* Section: Data */}
      <section>
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-3 px-1">数据管理</h3>
          <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
              {/* Date Filters for Export */}
              <div className="p-4 flex gap-4 border-b border-border">
                 <div className="flex-1">
                    <label className="text-[10px] text-secondary block mb-1">开始日期</label>
                    <input 
                       type="date" 
                       value={exportStart} 
                       onChange={e => setExportStart(e.target.value)}
                       className="w-full text-xs bg-surface border border-border rounded p-1"
                    />
                 </div>
                 <div className="flex-1">
                    <label className="text-[10px] text-secondary block mb-1">结束日期</label>
                    <input 
                       type="date" 
                       value={exportEnd} 
                       onChange={e => setExportEnd(e.target.value)}
                       className="w-full text-xs bg-surface border border-border rounded p-1"
                    />
                 </div>
              </div>

              <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-surface transition-colors" onClick={handleExport}>
                  <div className="flex items-center gap-3">
                      <Download className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">导出 CSV</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-300" />
              </div>
              
              <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                      <Upload className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">导入 CSV</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                     <button onClick={() => setImportMode('append')} className={`flex-1 py-1 text-xs border rounded ${importMode === 'append' ? 'bg-primary text-white border-primary' : 'border-border text-secondary'}`}>追加模式</button>
                     <button onClick={() => setImportMode('overwrite')} className={`flex-1 py-1 text-xs border rounded ${importMode === 'overwrite' ? 'bg-danger text-white border-danger' : 'border-border text-secondary'}`}>覆盖模式</button>
                  </div>
                  <input type="file" ref={fileInputRef} accept=".csv" onChange={processImport} className="hidden" />
                  <button onClick={handleImportClick} className="w-full py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-zinc-800 transition-colors">
                      选择 CSV 文件
                  </button>
              </div>
          </div>
      </section>
      
      <div className="text-center mt-8">
          <p className="text-[10px] text-zinc-300 uppercase tracking-widest">SmartWallet v2.0</p>
      </div>
    </div>
  );
};

export default Settings;