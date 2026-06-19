import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Plus, RefreshCcw, Trash2 } from 'lucide-react';

import { AssetHolding, AssetImportCandidate, AssetQuote, AssetRecurringFrequency, AssetRecurringPlan, AssetType } from '../types';
import {
  buildAssetPositions,
  buildAssetSummary,
  AssetCostSource,
  inferAssetMarket,
  normalizeAssetCode,
  normalizeAssetImportCandidate,
} from '../services/assetEngine';

interface AnalysisProps {
  assetHoldings: AssetHolding[];
  assetQuoteCache: AssetQuote[];
  assetRecurringPlans: AssetRecurringPlan[];
  isSyncingAssets: boolean;
  assetSyncMessage: string;
  onAddAssetHolding: (holding: Omit<AssetHolding, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void;
  onUpdateAssetHolding: (id: string, holding: Omit<AssetHolding, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void;
  onDeleteAssetHolding: (id: string) => Promise<void> | void;
  onSaveAssetRecurringPlan: (plan: Omit<AssetRecurringPlan, 'id' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void> | void;
  onDeleteAssetRecurringPlan: (id: string) => Promise<void> | void;
  onSyncAssetQuotes: () => Promise<void> | void;
  onAnalyzeAssetScreenshot: (imageBase64: string) => Promise<AssetImportCandidate[]>;
}

type AssetFormState = {
  assetType: AssetType;
  code: string;
  name: string;
  shares: string;
  costAmount: string;
};

type AssetOperationType = 'buy' | 'sell';

const emptyForm: AssetFormState = {
  assetType: 'fund',
  code: '',
  name: '',
  shares: '',
  costAmount: '',
};

const Analysis: React.FC<AnalysisProps> = ({
  assetHoldings,
  assetQuoteCache,
  assetRecurringPlans,
  isSyncingAssets,
  assetSyncMessage,
  onAddAssetHolding,
  onUpdateAssetHolding,
  onDeleteAssetHolding,
  onSaveAssetRecurringPlan,
  onDeleteAssetRecurringPlan,
  onSyncAssetQuotes,
  onAnalyzeAssetScreenshot,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<AssetFormState>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [importCandidates, setImportCandidates] = useState<AssetImportCandidate[]>([]);
  const [operationType, setOperationType] = useState<AssetOperationType>('buy');
  const [operationShares, setOperationShares] = useState('');
  const [operationAmount, setOperationAmount] = useState('');
  const [recurringAmount, setRecurringAmount] = useState('');
  const [recurringFrequency, setRecurringFrequency] = useState<AssetRecurringFrequency>('monthly');
  const [recurringNextDate, setRecurringNextDate] = useState(new Date().toISOString().split('T')[0]);
  const [recurringEnabled, setRecurringEnabled] = useState(true);

  const positions = useMemo(() => buildAssetPositions(assetHoldings, assetQuoteCache), [assetHoldings, assetQuoteCache]);
  const summary = useMemo(() => buildAssetSummary(positions), [positions]);
  const editingHolding = useMemo(
    () => assetHoldings.find((holding) => holding.id === editingId) ?? null,
    [assetHoldings, editingId],
  );
  const editingRecurringPlan = useMemo(
    () => assetRecurringPlans.find((plan) => plan.holdingId === editingId) ?? null,
    [assetRecurringPlans, editingId],
  );

  useEffect(() => {
    if (assetHoldings.length > 0) {
      void onSyncAssetQuotes();
    }
  }, []);

  const openAddForm = () => {
    setEditingId('');
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEditForm = (holding: AssetHolding) => {
    const existingPlan = assetRecurringPlans.find((plan) => plan.holdingId === holding.id);
    setEditingId(holding.id);
    setForm({
      assetType: holding.assetType,
      code: holding.code,
      name: holding.name,
      shares: String(holding.shares),
      costAmount: String(holding.costAmount),
    });
    setRecurringAmount(existingPlan ? String(existingPlan.amount) : '');
    setRecurringFrequency(existingPlan?.frequency ?? 'monthly');
    setRecurringNextDate(existingPlan?.nextDueDate ?? new Date().toISOString().split('T')[0]);
    setRecurringEnabled(existingPlan?.enabled ?? true);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId('');
    setForm(emptyForm);
    setOperationType('buy');
    setOperationShares('');
    setOperationAmount('');
    setRecurringAmount('');
    setRecurringFrequency('monthly');
    setRecurringNextDate(new Date().toISOString().split('T')[0]);
    setRecurringEnabled(true);
  };

  const buildPayload = () => {
    const assetType = form.assetType;
    const code = normalizeAssetCode(form.code);
    return {
      assetType,
      code,
      market: inferAssetMarket(assetType, code),
      name: form.name.trim(),
      shares: Number(form.shares || 0),
      costAmount: Number(form.costAmount || 0),
    };
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload.code || payload.shares <= 0 || payload.costAmount < 0) {
      alert('请填写完整持仓');
      return;
    }

    if (editingId) {
      await onUpdateAssetHolding(editingId, payload);
    } else {
      await onAddAssetHolding(payload);
    }
    closeForm();
  };

  const applyAssetOperation = async () => {
    if (!editingHolding) {
      return;
    }

    const sharesDelta = Number(operationShares || 0);
    const amountDelta = Number(operationAmount || 0);
    if (sharesDelta <= 0) {
      alert('请输入份额');
      return;
    }

    let nextShares = editingHolding.shares;
    let nextCostAmount = editingHolding.costAmount;

    if (operationType === 'sell') {
      if (sharesDelta > editingHolding.shares) {
        alert('份额不足');
        return;
      }
      const averageCost = editingHolding.shares > 0 ? editingHolding.costAmount / editingHolding.shares : 0;
      nextShares = editingHolding.shares - sharesDelta;
      nextCostAmount = nextShares <= 0 ? 0 : Math.max(0, editingHolding.costAmount - averageCost * sharesDelta);
    } else {
      if (amountDelta <= 0) {
        alert('请输入金额');
        return;
      }
      nextShares = editingHolding.shares + sharesDelta;
      nextCostAmount = editingHolding.costAmount + amountDelta;
    }

    const nextPayload = {
      assetType: editingHolding.assetType,
      code: editingHolding.code,
      market: editingHolding.market,
      name: editingHolding.name,
      shares: nextShares,
      costAmount: nextCostAmount,
    };

    await onUpdateAssetHolding(editingHolding.id, nextPayload);
    setForm((previous) => ({
      ...previous,
      shares: String(Number(nextShares.toFixed(4))),
      costAmount: String(Number(nextCostAmount.toFixed(2))),
    }));
    setOperationShares('');
    setOperationAmount('');
  };

  const saveRecurringPlan = async () => {
    if (!editingHolding || editingHolding.assetType !== 'fund') {
      return;
    }
    const amount = Number(recurringAmount || 0);
    if (amount <= 0) {
      alert('请输入定投金额');
      return;
    }
    await onSaveAssetRecurringPlan(
      {
        holdingId: editingHolding.id,
        amount,
        frequency: recurringFrequency,
        startDate: editingRecurringPlan?.startDate ?? recurringNextDate,
        nextDueDate: recurringNextDate,
        enabled: recurringEnabled,
      },
      editingRecurringPlan?.id,
    );
  };

  const handleImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsAnalyzingImage(true);
    try {
      const imageBase64 = await readFileAsBase64(file);
      const candidates = await onAnalyzeAssetScreenshot(imageBase64);
      setImportCandidates(candidates.map(normalizeAssetImportCandidate).filter((item): item is AssetImportCandidate => Boolean(item)));
      if (candidates.length === 0) {
        alert('未识别到持仓');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '识别失败');
    } finally {
      setIsAnalyzingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const importCandidate = async (candidate: AssetImportCandidate) => {
    await onAddAssetHolding({
      assetType: candidate.assetType,
      code: candidate.code,
      market: candidate.market,
      name: candidate.name,
      shares: candidate.shares,
      costAmount: candidate.costAmount,
    });
    setImportCandidates((previous) => previous.filter((item) => item !== candidate));
  };

  return (
    <div className="flex flex-col h-full animate-slide-up pb-24 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <SummaryCard label="总资产" value={`¥${summary.totalMarketValue.toFixed(2)}`} />
        <SummaryCard
          label="持有收益"
          value={`¥${summary.totalProfit.toFixed(2)}`}
          tone={summary.totalProfit >= 0 ? 'positive' : 'negative'}
          subValue={`${summary.totalProfitRate.toFixed(1)}%`}
        />
        <SummaryCard
          label="今日涨跌"
          value={`¥${summary.dailyChangeAmount.toFixed(2)}`}
          tone={summary.dailyChangeAmount >= 0 ? 'positive' : 'negative'}
        />
        <SummaryCard label="最近同步" value={summary.latestSyncedAt ? new Date(summary.latestSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '暂无'} />
      </div>

      <div className="flex gap-3">
        <button
          onClick={openAddForm}
          className="flex-1 h-11 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          添加资产
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="h-11 px-4 rounded-xl border border-border bg-white text-primary flex items-center justify-center"
          title="截图导入"
        >
          <Camera className="w-5 h-5" />
        </button>
        <button
          onClick={() => onSyncAssetQuotes()}
          className="h-11 px-4 rounded-xl border border-border bg-white text-primary flex items-center justify-center disabled:opacity-50"
          disabled={isSyncingAssets}
          title="刷新"
        >
          <RefreshCcw className={`w-5 h-5 ${isSyncingAssets ? 'animate-spin' : ''}`} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
      </div>

      {(assetSyncMessage || isAnalyzingImage) && (
        <div className="text-sm text-secondary px-1">
          {isAnalyzingImage ? '正在识别' : assetSyncMessage}
        </div>
      )}

      {importCandidates.length > 0 && (
        <div className="bg-white border border-border p-5 rounded-2xl space-y-4">
          <h3 className="text-base font-semibold text-primary">识别结果</h3>
          {importCandidates.map((candidate) => (
            <div key={`${candidate.assetType}-${candidate.code}-${candidate.name}`} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary truncate">{candidate.name || candidate.code}</p>
                <p className="text-xs text-secondary">
                  {candidate.assetType === 'fund' ? '基金' : '股票'} · {candidate.code}
                  {' · '}
                  {candidate.shares.toFixed(2)}份
                </p>
                <p className={`text-xs mt-1 ${candidate.costAmount > 0 ? 'text-secondary' : 'text-warning'}`}>
                  {candidate.costAmount > 0
                    ? `总成本 ¥${candidate.costAmount.toFixed(2)} · ${formatCostSource(candidate.costSource)}`
                    : '成本待补'}
                </p>
              </div>
              <button
                onClick={() => importCandidate(candidate)}
                className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold"
              >
                导入
              </button>
            </div>
          ))}
        </div>
      )}

      {assetHoldings.length === 0 ? (
        <div className="h-56 flex flex-col items-center justify-center text-zinc-300">
          <p className="text-lg font-light">暂无持仓</p>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map((position) => (
            <button
              key={position.holding.id}
              onClick={() => openEditForm(position.holding)}
              className="w-full bg-white border border-border p-5 rounded-2xl text-left"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-primary truncate">
                    {position.quote?.name || position.holding.name || position.holding.code}
                  </p>
                  <p className="text-xs text-secondary mt-1">
                    {position.holding.assetType === 'fund' ? '基金' : '股票'} · {position.holding.code}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold text-primary">¥{position.marketValue.toFixed(2)}</p>
                  <p className={`text-xs ${position.profit >= 0 ? 'text-danger' : 'text-success'}`}>
                    {position.profit >= 0 ? '+' : ''}{position.profit.toFixed(2)} / {position.profitRate.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <Meta label="份额" value={position.holding.shares.toFixed(2)} />
                <Meta label="总成本" value={`¥${position.holding.costAmount.toFixed(2)}`} />
                <Meta
                  label="涨跌幅"
                  value={position.quote ? `${position.quote.changePercent >= 0 ? '+' : ''}${position.quote.changePercent.toFixed(2)}%` : '暂无'}
                  tone={position.quote && position.quote.changePercent < 0 ? 'negative' : 'positive'}
                />
              </div>
              {position.quote?.error && <p className="text-xs text-danger mt-3">{position.quote.error}</p>}
            </button>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end justify-center">
          <form onSubmit={submitForm} className="w-full max-w-2xl bg-white rounded-t-3xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-primary">{editingId ? '编辑资产' : '添加资产'}</h2>
              {editingId && (
                <button
                  type="button"
                  onClick={async () => {
                    await onDeleteAssetHolding(editingId);
                    closeForm();
                  }}
                  className="text-danger"
                  title="删除"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="flex bg-surface p-1 rounded-xl border border-border">
              {(['fund', 'stock'] as AssetType[]).map((assetType) => (
                <button
                  key={assetType}
                  type="button"
                  onClick={() => setForm((previous) => ({ ...previous, assetType }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
                    form.assetType === assetType ? 'bg-primary text-white' : 'text-secondary'
                  }`}
                >
                  {assetType === 'fund' ? '基金' : '股票'}
                </button>
              ))}
            </div>

            <Field label="代码" value={form.code} onChange={(value) => setForm((previous) => ({ ...previous, code: value }))} inputMode="numeric" />
            <Field label="名称" value={form.name} onChange={(value) => setForm((previous) => ({ ...previous, name: value }))} />
            <Field label="份额" value={form.shares} onChange={(value) => setForm((previous) => ({ ...previous, shares: value }))} inputMode="decimal" />
            <Field label="总成本" value={form.costAmount} onChange={(value) => setForm((previous) => ({ ...previous, costAmount: value }))} inputMode="decimal" />

            {editingHolding && (
              <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-4">
                <div className="flex bg-white p-1 rounded-xl border border-border">
                  {([
                    { value: 'buy', label: '加仓' },
                    { value: 'sell', label: '减仓' },
                  ] as { value: AssetOperationType; label: string }[]).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setOperationType(item.value)}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
                        operationType === item.value ? 'bg-primary text-white' : 'text-secondary'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="调整份额" value={operationShares} onChange={setOperationShares} inputMode="decimal" />
                  {operationType === 'sell' ? (
                    <div className="flex flex-col justify-end pb-3 text-xs text-secondary">按平均成本扣减</div>
                  ) : (
                    <Field label="调整金额" value={operationAmount} onChange={setOperationAmount} inputMode="decimal" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={applyAssetOperation}
                  className="h-10 w-full rounded-xl bg-white border border-border text-sm font-semibold text-primary"
                >
                  同步持仓
                </button>
              </div>
            )}

            {editingHolding?.assetType === 'fund' && (
              <div className="rounded-2xl border border-border bg-surface/40 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-primary">定投计划</h3>
                  <button
                    type="button"
                    onClick={() => setRecurringEnabled((previous) => !previous)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                      recurringEnabled ? 'bg-primary text-white' : 'bg-white text-secondary border border-border'
                    }`}
                  >
                    {recurringEnabled ? '已开启' : '已关闭'}
                  </button>
                </div>
                <Field label="定投金额" value={recurringAmount} onChange={setRecurringAmount} inputMode="decimal" />
                <label className="block">
                  <span className="block text-xs text-secondary mb-2">频率</span>
                  <div className="flex bg-white p-1 rounded-xl border border-border">
                    {([
                      { value: 'daily', label: '每天' },
                      { value: 'weekly', label: '每周' },
                      { value: 'monthly', label: '每月' },
                    ] as { value: AssetRecurringFrequency; label: string }[]).map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setRecurringFrequency(item.value)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
                          recurringFrequency === item.value ? 'bg-primary text-white' : 'text-secondary'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block">
                  <span className="block text-xs text-secondary mb-2">下次定投</span>
                  <input
                    type="date"
                    value={recurringNextDate}
                    onChange={(event) => setRecurringNextDate(event.target.value)}
                    className="w-full h-12 rounded-xl border border-border px-4 text-primary outline-none focus:border-primary"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {editingRecurringPlan ? (
                    <button
                      type="button"
                      onClick={() => onDeleteAssetRecurringPlan(editingRecurringPlan.id)}
                      className="h-10 rounded-xl border border-border bg-white text-sm font-semibold text-danger"
                    >
                      删除计划
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    type="button"
                    onClick={saveRecurringPlan}
                    className="h-10 rounded-xl bg-primary text-sm font-semibold text-white"
                  >
                    保存计划
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button type="button" onClick={closeForm} className="h-11 rounded-xl border border-border text-primary font-semibold">
                取消
              </button>
              <button type="submit" className="h-11 rounded-xl bg-primary text-white font-semibold">
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, subValue, tone }: { label: string; value: string; subValue?: string; tone?: 'positive' | 'negative' }) => (
  <div className="bg-white border border-border p-5 rounded-2xl">
    <p className="text-xs text-secondary uppercase tracking-wider mb-2">{label}</p>
    <p className={`text-2xl font-bold ${tone === 'positive' ? 'text-danger' : tone === 'negative' ? 'text-success' : 'text-primary'}`}>
      {value}
    </p>
    {subValue && <p className="text-xs text-secondary mt-1">{subValue}</p>}
  </div>
);

const Meta = ({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) => (
  <div>
    <p className="text-zinc-400 mb-1">{label}</p>
    <p className={`font-medium ${tone === 'positive' ? 'text-danger' : tone === 'negative' ? 'text-success' : 'text-primary'}`}>{value}</p>
  </div>
);

const formatCostSource = (costSource?: AssetCostSource) => {
  switch (costSource) {
    case 'unit_cost':
      return '按单位成本';
    case 'market_minus_profit':
      return '按收益反算';
    case 'market_by_rate':
      return '按收益率反算';
    case 'total_cost':
      return '总成本';
    default:
      return '成本待补';
  }
};

const Field = ({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) => (
  <label className="block">
    <span className="block text-xs text-secondary mb-2">{label}</span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode={inputMode}
      className="w-full h-12 rounded-xl border border-border px-4 text-primary outline-none focus:border-primary"
    />
  </label>
);

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(file);
  });

export default Analysis;
