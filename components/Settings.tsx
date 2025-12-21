import React, { useRef, useState, useEffect } from 'react';
import { Download, Upload, AlertCircle, Repeat, Trash2, ChevronRight } from 'lucide-react';
import { Transaction, Category, RecurringProfile, RecurringFrequency, LLMConfig } from '../types';
import { getIconComponent } from '../constants';
import { v4 as uuidv4 } from 'uuid';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

interface SettingsProps {
    transactions: Transaction[];
    categories: Category[];
    recurringProfiles: RecurringProfile[];
    onImport: (data: Transaction[], mode: 'append' | 'overwrite') => void;
    onDeleteRecurring: (id: string) => void;
    llmConfig: LLMConfig;
    onUpdateLLMConfig: (config: LLMConfig) => void;
    importMode?: 'append' | 'overwrite';
}

const Settings: React.FC<SettingsProps> = ({
    transactions,
    categories,
    recurringProfiles,
    onImport,
    onDeleteRecurring,
    llmConfig,
    onUpdateLLMConfig
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Export/Import
    const [exportStart, setExportStart] = useState('');
    const [exportEnd, setExportEnd] = useState('');
    const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');


    const handleExport = async () => {
        let dataToExport = transactions;
        if (exportStart) dataToExport = dataToExport.filter(t => t.date >= exportStart);
        if (exportEnd) dataToExport = dataToExport.filter(t => t.date <= exportEnd);

        if (dataToExport.length === 0) { alert('没有可导出的数据'); return; }

        const headers = ['日期,金额,类型,分类,备注'];
        const rows = dataToExport.map(t => {
            const cat = categories.find(c => c.id === t.categoryId);
            const note = t.note ? `"${t.note.replace(/"/g, '""')}"` : '';
            return `${t.date},${t.amount.toFixed(2)},${t.type},${cat?.name || '未知'},${note}`;
        });

        const csvContent = "\uFEFF" + [headers, ...rows].join('\n');
        const fileName = `smartwallet_export_${new Date().toISOString().split('T')[0]}.csv`;

        try {
            if (Capacitor.isNativePlatform()) {
                // Mobile: Use Capacitor Filesystem API
                const result = await Filesystem.writeFile({
                    path: fileName,
                    data: csvContent,
                    directory: Directory.Documents,
                    encoding: Encoding.UTF8
                });

                alert(`CSV文件已导出到: ${result.uri}`);
            } else {
                // Web: Use traditional download method
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('导出失败，请重试');
        }
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
            const startIdx = lines[0].includes('日期') ? 1 : 0;

            const newTransactions: Transaction[] = [];

            for (let i = startIdx; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const parts = line.split(',');
                if (parts.length < 4) continue;

                const date = parts[0];
                const amount = parseFloat(parts[1]);
                const type = parts[2] as 'expense' | 'income';
                const categoryName = parts[3];
                const note = parts.slice(4).join(',').replace(/^"|"$/g, '').replace(/""/g, '"');

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
        <div className="flex flex-col h-full space-y-10 animate-slide-up pb-32">

            {/* Section: LLM Configuration */}
            <section>
                <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 px-1">大模型配置</h3>
                <div className="bg-white border border-border rounded-xl overflow-hidden p-5 space-y-4">
                    <div>
                        <label className="text-xs text-secondary block mb-1.5">Api Key</label>
                        <input
                            type="password"
                            value={llmConfig.apiKey}
                            onChange={e => onUpdateLLMConfig({ ...llmConfig, apiKey: e.target.value })}
                            placeholder="sk-..."
                            className="w-full text-sm bg-surface border border-border rounded-lg p-2"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-secondary block mb-1.5">Base URL</label>
                        <input
                            type="text"
                            value={llmConfig.baseUrl}
                            onChange={e => onUpdateLLMConfig({ ...llmConfig, baseUrl: e.target.value })}
                            placeholder="https://api.openai.com/v1"
                            className="w-full text-sm bg-surface border border-border rounded-lg p-2"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-secondary block mb-1.5">Model Name</label>
                        <input
                            type="text"
                            value={llmConfig.modelName}
                            onChange={e => onUpdateLLMConfig({ ...llmConfig, modelName: e.target.value })}
                            placeholder="gpt-3.5-turbo"
                            className="w-full text-sm bg-surface border border-border rounded-lg p-2"
                        />
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                        <input
                            type="checkbox"
                            id="enableLLM"
                            checked={llmConfig.enabled}
                            onChange={e => onUpdateLLMConfig({ ...llmConfig, enabled: e.target.checked })}
                            className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="enableLLM" className="text-sm font-medium text-primary cursor-pointer select-none">
                            启用大模型智能分析
                        </label>
                    </div>
                </div>
            </section>

            {/* Section: Recurring */}
            <section>
                <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 px-1">周期性记账规则</h3>
                <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
                    {recurringProfiles.length === 0 ? (
                        <div className="p-6 text-center text-base text-zinc-400">暂无生效的自动记账规则</div>
                    ) : (
                        recurringProfiles.map(p => {
                            const cat = categories.find(c => c.id === p.categoryId);
                            return (
                                <div key={p.id} className="p-5 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-base font-medium">{cat?.name}</span>
                                            <span className="text-xs text-secondary uppercase">
                                                {p.frequency === 'daily' && '每天'}
                                                {p.frequency === 'weekly' && '每周'}
                                                {p.frequency === 'monthly' && '每月'}
                                                {p.frequency === 'yearly' && '每年'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="font-mono text-base">¥{p.amount}</span>
                                        <button onClick={() => onDeleteRecurring(p.id)} className="text-zinc-300 hover:text-danger">
                                            <Trash2 className="w-5 h-5" />
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
                <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 px-1">数据管理</h3>
                <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
                    {/* Date Filters for Export */}
                    <div className="p-5 flex gap-4 border-b border-border">
                        <div className="flex-1">
                            <label className="text-xs text-secondary block mb-1.5">开始日期</label>
                            <input
                                type="date"
                                value={exportStart}
                                onChange={e => setExportStart(e.target.value)}
                                className="w-full text-sm bg-surface border border-border rounded-lg p-2"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs text-secondary block mb-1.5">结束日期</label>
                            <input
                                type="date"
                                value={exportEnd}
                                onChange={e => setExportEnd(e.target.value)}
                                className="w-full text-sm bg-surface border border-border rounded-lg p-2"
                            />
                        </div>
                    </div>

                    <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-surface transition-colors" onClick={handleExport}>
                        <div className="flex items-center gap-4">
                            <Download className="w-5 h-5 text-primary" />
                            <span className="text-base font-medium">导出 CSV</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-300" />
                    </div>

                    <div className="p-5">
                        <div className="flex items-center gap-4 mb-4">
                            <Upload className="w-5 h-5 text-primary" />
                            <span className="text-base font-medium">导入 CSV</span>
                        </div>
                        <div className="flex gap-3 mb-4">
                            <button onClick={() => setImportMode('append')} className={`flex-1 py-2 text-sm border rounded-lg ${importMode === 'append' ? 'bg-primary text-white border-primary' : 'border-border text-secondary'}`}>追加模式</button>
                            <button onClick={() => setImportMode('overwrite')} className={`flex-1 py-2 text-sm border rounded-lg ${importMode === 'overwrite' ? 'bg-danger text-white border-danger' : 'border-border text-secondary'}`}>覆盖模式</button>
                        </div>
                        <input type="file" ref={fileInputRef} accept=".csv" onChange={processImport} className="hidden" />
                        <button onClick={handleImportClick} className="w-full py-3 bg-primary text-white text-sm font-bold rounded-xl hover:bg-zinc-800 transition-colors">
                            选择 CSV 文件
                        </button>
                    </div>
                </div>
            </section>

            <div className="text-center mt-8">
                <p className="text-xs text-zinc-300 uppercase tracking-widest">记账 v2.0</p>
            </div>
        </div>
    );
};

export default Settings;