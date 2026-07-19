import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, Camera, Plus, ReceiptText, Trash2 } from 'lucide-react';
import {
  Area,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  AssetHolding,
  AssetImportCandidate,
  AssetPerformanceSnapshot,
  AssetQuote,
  AssetRecurringFrequency,
  AssetRecurringPlan,
  AssetTradeRecord,
  AssetType,
  Transaction,
} from '../types';
import {
  buildAssetHoldingDistribution,
  buildAssetPerformanceSnapshot,
  buildAssetPositions,
  buildAssetSummary,
  AssetCostSource,
  inferAssetMarket,
  isDelayedSettlementFund,
  mergeAssetPerformanceHistory,
  normalizeAssetCode,
  normalizeAssetImportCandidate,
} from '../services/assetEngine';
import { calculateWealthFreedom } from '../services/wealthFreedom';

interface AnalysisProps {
  transactions: Transaction[];
  expenseAverageMonths: number;
  assetHoldings: AssetHolding[];
  assetQuoteCache: AssetQuote[];
  assetRecurringPlans: AssetRecurringPlan[];
  assetPerformanceHistory: AssetPerformanceSnapshot[];
  assetTradeRecords: AssetTradeRecord[];
  onAddAssetHolding: (holding: Omit<AssetHolding, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void;
  onUpdateAssetHolding: (
    id: string,
    holding: Omit<AssetHolding, 'id' | 'createdAt' | 'updatedAt'>,
    tradeRecord?: Omit<AssetTradeRecord, 'id' | 'createdAt'>,
  ) => Promise<void> | void;
  onDeleteAssetHolding: (id: string) => Promise<void> | void;
  onSaveAssetRecurringPlan: (plan: Omit<AssetRecurringPlan, 'id' | 'createdAt' | 'updatedAt'>, existingId?: string) => Promise<void> | void;
  onDeleteAssetRecurringPlan: (id: string) => Promise<void> | void;
  onSyncAssetQuotes: () => Promise<void> | void;
  onAnalyzeAssetScreenshot: (imageBase64: string) => Promise<AssetImportCandidate[]>;
}

type AssetFormState = {
  assetType: AssetType;
  code: string;
  shares: string;
  costAmount: string;
  averageCost: string;
};

type AssetOperationType = 'buy' | 'sell';

const emptyForm: AssetFormState = {
  assetType: 'fund',
  code: '',
  shares: '',
  costAmount: '',
  averageCost: '',
};

const recurringFrequencyOptions: { value: AssetRecurringFrequency; label: string }[] = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];

const readOptionalAmount = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
};

const formatFreedomDays = (days: number) => {
  if (days < 1) {
    return '<1天';
  }
  return `${Math.floor(days).toLocaleString('zh-CN')}天`;
};

const Analysis: React.FC<AnalysisProps> = ({
  transactions,
  expenseAverageMonths,
  assetHoldings,
  assetQuoteCache,
  assetRecurringPlans,
  assetPerformanceHistory,
  assetTradeRecords,
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
  const [isTradeRecordsOpen, setIsTradeRecordsOpen] = useState(false);
  const [isRecurringManagerOpen, setIsRecurringManagerOpen] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [importCandidates, setImportCandidates] = useState<AssetImportCandidate[]>([]);
  const [operationType, setOperationType] = useState<AssetOperationType>('buy');
  const [operationAmount, setOperationAmount] = useState('');
  const [recurringAmount, setRecurringAmount] = useState('');
  const [recurringFrequency, setRecurringFrequency] = useState<AssetRecurringFrequency>('monthly');
  const [recurringNextDate, setRecurringNextDate] = useState(new Date().toISOString().split('T')[0]);
  const [recurringEnabled, setRecurringEnabled] = useState(false);

  const positions = useMemo(() => buildAssetPositions(assetHoldings, assetQuoteCache), [assetHoldings, assetQuoteCache]);
  const summary = useMemo(() => buildAssetSummary(positions), [positions]);
  const freedom = useMemo(
    () => calculateWealthFreedom(summary.totalMarketValue, transactions, expenseAverageMonths),
    [summary.totalMarketValue, transactions, expenseAverageMonths],
  );
  const freedomPeriodLabel = expenseAverageMonths === 12 ? '近1年' : `近${expenseAverageMonths}个月`;
  const displayPerformanceHistory = useMemo(
    () =>
      mergeAssetPerformanceHistory(
        assetPerformanceHistory,
        buildAssetPerformanceSnapshot(
          positions,
          assetQuoteCache.find((quote) => quote.assetType === 'index' && quote.code === '000001'),
        ),
      ),
    [assetPerformanceHistory, assetQuoteCache, positions],
  );
  const distribution = useMemo(() => buildAssetHoldingDistribution(positions), [positions]);
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
      shares: String(holding.shares),
      costAmount: String(holding.costAmount),
      averageCost: '',
    });
    setRecurringAmount(existingPlan ? String(existingPlan.amount) : '');
    setRecurringFrequency(existingPlan?.frequency ?? 'monthly');
    setRecurringNextDate(existingPlan?.nextDueDate ?? new Date().toISOString().split('T')[0]);
    setRecurringEnabled(existingPlan?.enabled ?? false);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId('');
    setForm(emptyForm);
    setOperationType('buy');
    setOperationAmount('');
    setRecurringAmount('');
    setRecurringFrequency('monthly');
    setRecurringNextDate(new Date().toISOString().split('T')[0]);
    setRecurringEnabled(false);
  };

  const buildPayload = () => {
    const assetType = form.assetType;
    const code = normalizeAssetCode(form.code);
    const shares = Number(form.shares || 0);
    const totalCost = readOptionalAmount(form.costAmount);
    const averageCost = readOptionalAmount(form.averageCost);
    const costAmount = totalCost !== null ? totalCost : averageCost !== null ? averageCost * shares : 0;
    return {
      assetType,
      code,
      market: inferAssetMarket(assetType, code),
      name: editingHolding?.assetType === assetType && editingHolding.code === code ? editingHolding.name : '',
      shares,
      costAmount,
    };
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload.code || !Number.isFinite(payload.shares) || payload.shares <= 0) {
      alert('请填写完整持仓');
      return;
    }
    if (!Number.isFinite(payload.costAmount) || payload.costAmount < 0) {
      alert('请检查成本');
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

    const amountDelta = Number(operationAmount || 0);
    if (!Number.isFinite(amountDelta) || amountDelta <= 0) {
      alert('请输入金额');
      return;
    }

    const currentPosition = positions.find((position) => position.holding.id === editingHolding.id);
    const currentQuote = currentPosition?.quote;
    const delayedSettlement = isDelayedSettlementFund({
      ...editingHolding,
      name: currentQuote?.name || editingHolding.name,
    });

    if (operationType === 'sell' && currentPosition && amountDelta > currentPosition.marketValue) {
      alert('金额超出持仓');
      return;
    }

    const nextPayload = {
      assetType: editingHolding.assetType,
      code: editingHolding.code,
      market: editingHolding.market,
      name: editingHolding.name,
      shares: editingHolding.shares,
      costAmount: editingHolding.costAmount,
    };

    if (delayedSettlement) {
      await onUpdateAssetHolding(editingHolding.id, nextPayload, {
        holdingId: editingHolding.id,
        assetType: editingHolding.assetType,
        code: editingHolding.code,
        name: currentQuote?.name || editingHolding.name,
        tradeType: operationType,
        source: 'manual',
        status: 'pending',
        shares: 0,
        amount: amountDelta,
        price: 0,
        occurredAt: new Date().toISOString(),
      });
      setOperationAmount('');
      return;
    }

    const price = currentQuote?.price ?? 0;
    if (!Number.isFinite(price) || price <= 0) {
      alert('暂无成交价');
      return;
    }

    const sharesDelta = amountDelta / price;
    if (!Number.isFinite(sharesDelta) || sharesDelta <= 0) {
      alert('暂无成交价');
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
      nextShares = editingHolding.shares + sharesDelta;
      nextCostAmount = editingHolding.costAmount + amountDelta;
    }

    const completedPayload = {
      ...nextPayload,
      name: currentQuote?.name || editingHolding.name,
      shares: nextShares,
      costAmount: nextCostAmount,
    };

    await onUpdateAssetHolding(editingHolding.id, completedPayload, {
      holdingId: editingHolding.id,
      assetType: editingHolding.assetType,
      code: editingHolding.code,
      name: currentQuote?.name || editingHolding.name,
      tradeType: operationType,
      source: 'manual',
      status: 'completed',
      shares: sharesDelta,
      amount: amountDelta,
      price,
      priceSource: currentQuote?.priceSource ?? 'manual',
      occurredAt: new Date().toISOString(),
      settledAt: new Date().toISOString(),
    });
    setForm((previous) => ({
      ...previous,
      shares: String(Number(nextShares.toFixed(4))),
      costAmount: String(Number(nextCostAmount.toFixed(2))),
      averageCost: '',
    }));
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
        <SummaryCard
          label="不用上班天数"
          value={freedom.days === null ? '暂无' : formatFreedomDays(freedom.days)}
          subValue={freedom.days === null ? `${freedomPeriodLabel}无支出` : `${freedomPeriodLabel} · 日均 ¥${freedom.avgDailyExpense.toFixed(2)}`}
        />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <AssetActionButton icon={Plus} label="添加资产" onClick={openAddForm} />
        <AssetActionButton icon={ReceiptText} label="交易记录" onClick={() => setIsTradeRecordsOpen(true)} />
        <AssetActionButton icon={Camera} label="截图导入" onClick={() => fileInputRef.current?.click()} />
        <AssetActionButton icon={CalendarClock} label="定投管理" onClick={() => setIsRecurringManagerOpen(true)} />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
      </div>

      {isAnalyzingImage && (
        <div className="text-sm text-secondary px-1">
          正在识别
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

      {assetHoldings.length > 0 && (
        <ProfitAnalytics
          history={displayPerformanceHistory}
          distribution={distribution}
        />
      )}

      {isFormOpen && createPortal(
        <div className="fixed inset-0 bg-black/30 flex items-end justify-center" style={{ zIndex: 100 }}>
          <form
            onSubmit={submitForm}
            className="w-full max-w-2xl max-h-[calc(100dvh-4rem)] bg-white rounded-t-3xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
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

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
              <Field label="份额" value={form.shares} onChange={(value) => setForm((previous) => ({ ...previous, shares: value }))} inputMode="decimal" />
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-secondary">成本（二选一）</span>
                  <span className="text-xs text-zinc-400">总成本优先</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="总成本" value={form.costAmount} onChange={(value) => setForm((previous) => ({ ...previous, costAmount: value }))} inputMode="decimal" />
                  <Field label="平均成本" value={form.averageCost} onChange={(value) => setForm((previous) => ({ ...previous, averageCost: value }))} inputMode="decimal" />
                </div>
              </div>

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
                  <Field
                    label={operationType === 'sell' ? '减仓金额' : '加仓金额'}
                    value={operationAmount}
                    onChange={setOperationAmount}
                    inputMode="decimal"
                  />
                  {isDelayedSettlementFund(editingHolding) && (
                    <p className="text-xs text-secondary">QDII 待确认净值</p>
                  )}
                  <button
                    type="button"
                    onClick={applyAssetOperation}
                    className="h-10 w-full rounded-xl bg-white border border-border text-sm font-semibold text-primary"
                  >
                    {operationType === 'sell' ? '确认减仓' : '确认加仓'}
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
                      {recurringFrequencyOptions.map((item) => (
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
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 border-t border-border bg-white" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={closeForm} className="h-11 rounded-xl border border-border text-primary font-semibold">
                取消
              </button>
              <button type="submit" className="h-11 rounded-xl bg-primary text-white font-semibold">
                保存
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {isTradeRecordsOpen && createPortal(
        <TradeRecordsPanel records={assetTradeRecords} onClose={() => setIsTradeRecordsOpen(false)} />,
        document.body,
      )}

      {isRecurringManagerOpen && createPortal(
        <RecurringPlansPanel
          holdings={assetHoldings}
          quotes={assetQuoteCache}
          plans={assetRecurringPlans}
          onSave={onSaveAssetRecurringPlan}
          onDelete={onDeleteAssetRecurringPlan}
          onClose={() => setIsRecurringManagerOpen(false)}
        />,
        document.body,
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

const AssetActionButton = ({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={label}
    className="h-16 min-w-0 rounded-2xl border border-border bg-white text-primary flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition active:scale-[0.98] disabled:opacity-50"
  >
    <Icon className={`w-5 h-5 ${active ? 'animate-spin' : ''}`} />
    <span className="w-full truncate px-1 text-center">{label}</span>
  </button>
);

const Meta = ({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) => (
  <div>
    <p className="text-zinc-400 mb-1">{label}</p>
    <p className={`font-medium ${tone === 'positive' ? 'text-danger' : tone === 'negative' ? 'text-success' : 'text-primary'}`}>{value}</p>
  </div>
);

const TradeRecordsPanel = ({ records, onClose }: { records: AssetTradeRecord[]; onClose: () => void }) => {
  const sortedRecords = [...records].sort(
    (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
  );

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end justify-center" style={{ zIndex: 100 }}>
      <div className="w-full max-w-2xl max-h-[calc(100dvh-4rem)] bg-white rounded-t-3xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-lg font-semibold text-primary">交易记录</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-secondary">
            关闭
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {sortedRecords.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-zinc-300">暂无记录</div>
          ) : (
            sortedRecords.map((record) => (
              <div key={record.id} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${tradeTone(record.tradeType)}`}>{formatTradeType(record.tradeType)}</span>
                      {record.status === 'pending' && <span className="text-xs font-semibold text-warning">待成交</span>}
                      <span className="text-xs text-secondary">{record.assetType === 'fund' ? '基金' : '股票'} · {record.code}</span>
                    </div>
                    <p className="text-sm font-semibold text-primary truncate mt-1">{record.name || record.code}</p>
                    <p className="text-xs text-zinc-400 mt-1">{formatDateTime(record.occurredAt)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-primary">¥{record.amount.toFixed(2)}</p>
                    <p className="text-xs text-secondary mt-1">
                      {record.status === 'pending' ? '份额待确认' : `${record.shares.toFixed(4)}份`}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
                  <Meta label="成交价" value={record.status === 'pending' ? '待确认' : `¥${record.price.toFixed(4)}`} />
                  <Meta label="来源" value={record.source === 'recurring' ? '定投' : '手动'} />
                  <Meta label="状态" value={record.status === 'pending' ? '待成交' : '已成交'} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

type RecurringPlanDraft = {
  existingId?: string;
  holdingId: string;
  amount: string;
  frequency: AssetRecurringFrequency;
  nextDueDate: string;
  enabled: boolean;
  startDate?: string;
};

const RecurringPlansPanel = ({
  holdings,
  quotes,
  plans,
  onSave,
  onDelete,
  onClose,
}: {
  holdings: AssetHolding[];
  quotes: AssetQuote[];
  plans: AssetRecurringPlan[];
  onSave: AnalysisProps['onSaveAssetRecurringPlan'];
  onDelete: AnalysisProps['onDeleteAssetRecurringPlan'];
  onClose: () => void;
}) => {
  const [draft, setDraft] = useState<RecurringPlanDraft | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const fundHoldings = holdings.filter((holding) => holding.assetType === 'fund');
  const planRows = plans
    .map((plan) => {
      const holding = fundHoldings.find((item) => item.id === plan.holdingId);
      if (!holding) {
        return null;
      }
      const quote = quotes.find((item) => item.assetType === holding.assetType && item.code === holding.code);
      return { plan, holding, name: quote?.name || holding.name || holding.code };
    })
    .filter((item): item is { plan: AssetRecurringPlan; holding: AssetHolding; name: string } => Boolean(item))
    .sort((left, right) => {
      if (left.plan.enabled !== right.plan.enabled) {
        return left.plan.enabled ? -1 : 1;
      }
      return left.plan.nextDueDate.localeCompare(right.plan.nextDueDate);
    });
  const holdingsWithoutPlan = fundHoldings.filter((holding) => !plans.some((plan) => plan.holdingId === holding.id));
  const enabledCount = planRows.filter(({ plan }) => plan.enabled).length;
  const dueCount = planRows.filter(({ plan }) => plan.enabled && plan.nextDueDate <= today).length;
  const nearestDate = planRows
    .filter(({ plan }) => plan.enabled)
    .map(({ plan }) => plan.nextDueDate)
    .sort()[0] ?? '暂无';

  const getHoldingName = (holding: AssetHolding) => {
    const quote = quotes.find((item) => item.assetType === holding.assetType && item.code === holding.code);
    return quote?.name || holding.name || holding.code;
  };

  const startCreate = () => {
    const holding = holdingsWithoutPlan[0];
    if (!holding) {
      return;
    }
    setDraft({
      holdingId: holding.id,
      amount: '',
      frequency: 'monthly',
      nextDueDate: today,
      enabled: false,
    });
  };

  const startEdit = (plan: AssetRecurringPlan) => {
    setDraft({
      existingId: plan.id,
      holdingId: plan.holdingId,
      amount: String(plan.amount),
      frequency: plan.frequency,
      nextDueDate: plan.nextDueDate,
      enabled: plan.enabled,
      startDate: plan.startDate,
    });
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) {
      return;
    }
    const holding = fundHoldings.find((item) => item.id === draft.holdingId);
    const amount = Number(draft.amount || 0);
    if (!holding || amount <= 0 || !draft.nextDueDate) {
      alert('请填写完整计划');
      return;
    }
    await onSave(
      {
        holdingId: holding.id,
        amount,
        frequency: draft.frequency,
        startDate: draft.startDate ?? draft.nextDueDate,
        nextDueDate: draft.nextDueDate,
        enabled: draft.enabled,
      },
      draft.existingId,
    );
    setDraft(null);
  };

  const togglePlan = async (plan: AssetRecurringPlan) => {
    await onSave(
      {
        holdingId: plan.holdingId,
        amount: plan.amount,
        frequency: plan.frequency,
        startDate: plan.startDate,
        nextDueDate: plan.nextDueDate,
        enabled: !plan.enabled,
      },
      plan.id,
    );
  };

  const deletePlan = async (plan: AssetRecurringPlan) => {
    if (!window.confirm('删除定投计划？')) {
      return;
    }
    await onDelete(plan.id);
    if (draft?.existingId === plan.id) {
      setDraft(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end justify-center" style={{ zIndex: 100 }}>
      <div className="w-full max-w-2xl max-h-[calc(100dvh-4rem)] bg-white rounded-t-3xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-lg font-semibold text-primary">定投管理</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-secondary">
            关闭
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <RecurringSummaryCard label="计划" value={String(planRows.length)} />
            <RecurringSummaryCard label="开启" value={String(enabledCount)} />
            <RecurringSummaryCard label="待执行" value={String(dueCount)} />
          </div>
          <div className="rounded-2xl border border-border bg-surface/40 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-secondary mb-1">最近定投</p>
              <p className="text-base font-semibold text-primary">{nearestDate}</p>
            </div>
            {holdingsWithoutPlan.length > 0 && !draft && (
              <button
                type="button"
                onClick={startCreate}
                className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold"
              >
                新增计划
              </button>
            )}
          </div>

          {draft && (
            <form onSubmit={saveDraft} className="rounded-2xl border border-border bg-white p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-primary">{draft.existingId ? '编辑计划' : '新增计划'}</h3>
                <button
                  type="button"
                  onClick={() => setDraft((previous) => previous ? { ...previous, enabled: !previous.enabled } : previous)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    draft.enabled ? 'bg-primary text-white' : 'bg-white text-secondary border border-border'
                  }`}
                >
                  {draft.enabled ? '已开启' : '已关闭'}
                </button>
              </div>

              {!draft.existingId && (
                <label className="block">
                  <span className="block text-xs text-secondary mb-2">基金</span>
                  <select
                    value={draft.holdingId}
                    onChange={(event) => setDraft((previous) => previous ? { ...previous, holdingId: event.target.value } : previous)}
                    className="w-full h-12 rounded-xl border border-border px-4 text-primary bg-white outline-none focus:border-primary"
                  >
                    {holdingsWithoutPlan.map((holding) => (
                      <option key={holding.id} value={holding.id}>
                        {getHoldingName(holding)} · {holding.code}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <Field label="定投金额" value={draft.amount} onChange={(value) => setDraft((previous) => previous ? { ...previous, amount: value } : previous)} inputMode="decimal" />
              <label className="block">
                <span className="block text-xs text-secondary mb-2">频率</span>
                <div className="flex bg-surface p-1 rounded-xl border border-border">
                  {recurringFrequencyOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setDraft((previous) => previous ? { ...previous, frequency: item.value } : previous)}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
                        draft.frequency === item.value ? 'bg-primary text-white' : 'text-secondary'
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
                  value={draft.nextDueDate}
                  onChange={(event) => setDraft((previous) => previous ? { ...previous, nextDueDate: event.target.value } : previous)}
                  className="w-full h-12 rounded-xl border border-border px-4 text-primary outline-none focus:border-primary"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setDraft(null)} className="h-10 rounded-xl border border-border text-primary font-semibold">
                  取消
                </button>
                <button type="submit" className="h-10 rounded-xl bg-primary text-white font-semibold">
                  保存
                </button>
              </div>
            </form>
          )}

          {planRows.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-sm text-zinc-300">
              <p>{fundHoldings.length > 0 ? '暂无计划' : '暂无基金持仓'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {planRows.map(({ plan, holding, name }) => {
                const status = plan.enabled ? (plan.nextDueDate <= today ? '待执行' : '已开启') : '已关闭';
                return (
                  <div key={plan.id} className="rounded-2xl border border-border bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-primary truncate">{name}</p>
                        <p className="text-xs text-secondary mt-1">基金 · {holding.code}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                        plan.enabled ? 'bg-primary text-white' : 'bg-surface text-secondary border border-border'
                      }`}>
                        {status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-4 text-xs">
                      <Meta label="金额" value={`¥${plan.amount.toFixed(2)}`} />
                      <Meta label="频率" value={formatRecurringFrequency(plan.frequency)} />
                      <Meta label="下次" value={plan.nextDueDate} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <button type="button" onClick={() => startEdit(plan)} className="h-9 rounded-xl border border-border text-sm font-semibold text-primary">
                        修改
                      </button>
                      <button type="button" onClick={() => togglePlan(plan)} className="h-9 rounded-xl border border-border text-sm font-semibold text-primary">
                        {plan.enabled ? '暂停' : '开启'}
                      </button>
                      <button type="button" onClick={() => deletePlan(plan)} className="h-9 rounded-xl border border-border text-sm font-semibold text-danger">
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RecurringSummaryCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-border bg-white p-4">
    <p className="text-xs text-secondary mb-2">{label}</p>
    <p className="text-xl font-bold text-primary">{value}</p>
  </div>
);

type AssetTrendRange = 'week' | 'month' | 'year' | 'all';
type AssetCalendarMode = 'day' | 'month' | 'year';

const ProfitAnalytics = ({
  history,
  distribution,
}: {
  history: AssetPerformanceSnapshot[];
  distribution: ReturnType<typeof buildAssetHoldingDistribution>;
}) => {
  const [trendRange, setTrendRange] = useState<AssetTrendRange>('week');
  const [calendarMode, setCalendarMode] = useState<AssetCalendarMode>('day');
  const latest = history.at(-1);
  const cumulativeTrendHistory = useMemo(() => buildCumulativeTrendHistory(history), [history]);
  const filteredHistory = useMemo(() => filterPerformanceHistory(history, trendRange), [history, trendRange]);
  const filteredTrendHistory = useMemo(
    () => filterPerformanceHistory(cumulativeTrendHistory, trendRange),
    [cumulativeTrendHistory, trendRange],
  );
  const trendData = filteredTrendHistory.map((item) => ({
    ...item,
    label: `${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8, 10))}`,
  }));
  const pieData = distribution.map((item) => ({ ...item })) as Array<Record<string, string | number>>;
  const calendarMonth = latest?.date.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  const calendarDays = buildCalendarDays(calendarMonth, history);
  const calendarMonths = buildCalendarMonths(calendarMonth.slice(0, 4), history);
  const calendarYears = buildCalendarYears(history);
  const monthProfit = calendarDays.reduce((sum, item) => sum + (item.snapshot?.dailyProfit ?? 0), 0);
  const rangeProfit = filteredHistory.reduce((sum, item) => sum + item.dailyProfit, 0);
  const latestTrend = filteredTrendHistory.at(-1);
  const cumulativeProfitRate = latestTrend?.cumulativeProfitRate ?? 0;
  const cumulativeBenchmark = latestTrend?.cumulativeBenchmarkChangePercent ?? 0;

  return (
    <div className="space-y-4">
      <section className="bg-white border border-border p-5 rounded-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-primary">收益走势</h3>
            {filteredTrendHistory.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-2">
                <span className={profitTone(rangeProfit)}>区间收益 {formatSignedCurrency(rangeProfit)}</span>
                <span className={profitTone(cumulativeProfitRate)}>我的收益 {formatSignedPercent(cumulativeProfitRate)}</span>
                <span className={profitTone(cumulativeBenchmark)}>上证指数 {formatSignedPercent(cumulativeBenchmark)}</span>
              </div>
            )}
          </div>
          <span className="text-xs text-secondary">{latest?.date ?? '暂无'}</span>
        </div>
        <SegmentedControl
          value={trendRange}
          options={[
            { value: 'week', label: '本周' },
            { value: 'month', label: '本月' },
            { value: 'year', label: '今年' },
            { value: 'all', label: '全部' },
          ]}
          onChange={(value) => setTrendRange(value as AssetTrendRange)}
        />
        <div className="h-48">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 12, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="assetProfitTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  formatter={(value: number, name) => [
                    formatSignedPercent(value),
                    String(name),
                  ]}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e4e4e7', fontSize: '12px', boxShadow: 'none' }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativeProfitRate"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#assetProfitTrend)"
                  name="我的收益"
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeBenchmarkChangePercent"
                  stroke="#6384e8"
                  strokeWidth={1.8}
                  dot={false}
                  name="上证指数"
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyPanel label="暂无走势" />
          )}
        </div>
      </section>

      <section className="bg-white border border-border p-5 rounded-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-primary">盈亏日历</h3>
            <p className={`text-sm mt-1 ${profitTone(monthProfit)}`}>{formatSignedCurrency(monthProfit)}</p>
          </div>
          <span className="text-xs text-secondary">{calendarMonth.replace('-', '年')}月</span>
        </div>
        <SegmentedControl
          value={calendarMode}
          options={[
            { value: 'day', label: '日' },
            { value: 'month', label: '月' },
            { value: 'year', label: '年' },
          ]}
          onChange={(value) => setCalendarMode(value as AssetCalendarMode)}
        />
        {calendarMode === 'day' && (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-400 mb-2">
              {['日', '一', '二', '三', '四', '五', '六'].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((item, index) => (
                <ProfitCell key={`${item.date || 'empty'}-${index}`} label={item.date ? String(Number(item.date.slice(8, 10))) : ''} value={item.snapshot?.dailyProfit} square />
              ))}
            </div>
          </>
        )}
        {calendarMode === 'month' && (
          <div className="grid grid-cols-3 gap-2">
            {calendarMonths.map((item) => (
              <ProfitCell key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        )}
        {calendarMode === 'year' && (
          <div className="grid grid-cols-2 gap-2">
            {calendarYears.length > 0 ? (
              calendarYears.map((item) => (
                <ProfitCell key={item.label} label={item.label} value={item.value} />
              ))
            ) : (
              <div className="col-span-2">
                <EmptyPanel label="暂无盈亏" />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="bg-white border border-border p-5 rounded-2xl">
        <h3 className="text-base font-semibold text-primary mb-4">持仓分布</h3>
        {distribution.length > 0 ? (
          <div className="grid grid-cols-[7rem,1fr] gap-4 items-center">
            <div className="relative h-28">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie data={pieData} dataKey="value" innerRadius={34} outerRadius={52} paddingAngle={2}>
                    {distribution.map((item) => (
                      <Cell key={item.id} fill={item.color} />
                    ))}
                  </Pie>
                </RechartsPieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-semibold text-primary">{distribution.length}</span>
                <span className="text-xs text-secondary">持仓</span>
              </div>
            </div>
            <div className="space-y-3 min-w-0">
              {distribution.slice(0, 5).map((item) => (
                <div key={item.id} className="grid grid-cols-[0.5rem,1fr,auto] gap-2 items-center text-xs">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="truncate text-primary">{item.name}</span>
                  <span className="text-secondary">{item.percent.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyPanel label="暂无分布" />
        )}
      </section>
    </div>
  );
};

const EmptyPanel = ({ label }: { label: string }) => (
  <div className="h-full min-h-32 flex items-center justify-center text-sm text-zinc-300">{label}</div>
);

const SegmentedControl = ({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) => (
  <div className="flex bg-surface p-1 rounded-xl border border-border mb-4">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={`flex-1 h-8 rounded-lg text-xs font-semibold ${
          value === option.value ? 'bg-primary text-white' : 'text-secondary'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const ProfitCell: React.FC<{ label: string; value?: number; square?: boolean }> = ({ label, value, square = false }) => (
  <div
    className={`${square ? 'aspect-square' : 'h-16'} rounded-lg flex flex-col items-center justify-center text-[10px] ${
      !label
        ? 'bg-transparent'
        : typeof value === 'number'
          ? value >= 0
            ? 'bg-red-50 text-danger'
            : 'bg-emerald-50 text-success'
          : 'bg-surface text-zinc-400'
    }`}
  >
    {label && (
      <>
        <span className="text-[11px] text-primary/70">{label}</span>
        {typeof value === 'number' && <span>{formatCompactSigned(value)}</span>}
      </>
    )}
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

const formatTradeType = (tradeType: AssetTradeRecord['tradeType']) => {
  if (tradeType === 'recurring') {
    return '定投';
  }
  return tradeType === 'sell' ? '减仓' : '加仓';
};

const formatRecurringFrequency = (frequency: AssetRecurringFrequency) =>
  recurringFrequencyOptions.find((item) => item.value === frequency)?.label ?? '每月';

const tradeTone = (tradeType: AssetTradeRecord['tradeType']) =>
  tradeType === 'sell' ? 'text-success' : 'text-danger';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const profitTone = (value: number) => (value >= 0 ? 'text-danger' : 'text-success');

const formatSignedCurrency = (value: number) => `${value >= 0 ? '+' : '-'}¥${Math.abs(value).toFixed(2)}`;

const formatSignedPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatCompactSigned = (value: number) => {
  const prefix = value >= 0 ? '+' : '-';
  const amount = Math.abs(value);
  if (amount >= 10000) {
    return `${prefix}${(amount / 10000).toFixed(1)}万`;
  }
  return `${prefix}${amount.toFixed(0)}`;
};

const buildCalendarDays = (month: string, history: AssetPerformanceSnapshot[]) => {
  const [year, monthIndex] = month.split('-').map(Number);
  const firstDay = new Date(year, monthIndex - 1, 1);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const snapshotMap = new Map(history.map((item) => [item.date, item]));
  const days: { date: string; snapshot?: AssetPerformanceSnapshot }[] = [];

  for (let index = 0; index < firstDay.getDay(); index++) {
    days.push({ date: '' });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push({ date, snapshot: snapshotMap.get(date) });
  }

  return days;
};

type CumulativeAssetTrend = AssetPerformanceSnapshot & {
  cumulativeProfitRate: number;
  cumulativeBenchmarkChangePercent: number;
};

const buildCumulativeTrendHistory = (history: AssetPerformanceSnapshot[]): CumulativeAssetTrend[] => {
  let profitMultiplier = 1;
  let benchmarkMultiplier = 1;

  return [...history]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((item) => {
      profitMultiplier *= 1 + item.dailyProfitRate / 100;
      benchmarkMultiplier *= 1 + item.benchmarkChangePercent / 100;

      return {
        ...item,
        cumulativeProfitRate: (profitMultiplier - 1) * 100,
        cumulativeBenchmarkChangePercent: (benchmarkMultiplier - 1) * 100,
      };
    });
};

const filterPerformanceHistory = <T extends AssetPerformanceSnapshot>(history: T[], range: AssetTrendRange) => {
  if (range === 'all' || history.length === 0) {
    return history;
  }

  const latestDate = parseDateKey(history.at(-1)?.date ?? new Date().toISOString().split('T')[0]);
  const start = new Date(latestDate);

  if (range === 'week') {
    const day = latestDate.getDay() || 7;
    start.setDate(latestDate.getDate() - day + 1);
  } else if (range === 'month') {
    start.setDate(1);
  } else {
    start.setMonth(0, 1);
  }

  const startKey = toDateKey(start);
  return history.filter((item) => item.date >= startKey);
};

const buildCalendarMonths = (year: string, history: AssetPerformanceSnapshot[]) => {
  const monthMap = new Map<string, number>();
  history
    .filter((item) => item.date.startsWith(year))
    .forEach((item) => {
      const month = item.date.slice(5, 7);
      monthMap.set(month, (monthMap.get(month) ?? 0) + item.dailyProfit);
    });

  return Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return {
      label: `${index + 1}月`,
      value: monthMap.has(month) ? monthMap.get(month) : undefined,
    };
  });
};

const buildCalendarYears = (history: AssetPerformanceSnapshot[]) => {
  const yearMap = new Map<string, number>();
  history.forEach((item) => {
    const year = item.date.slice(0, 4);
    yearMap.set(year, (yearMap.get(year) ?? 0) + item.dailyProfit);
  });

  return Array.from(yearMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([year, value]) => ({ label: `${year}年`, value }));
};

const parseDateKey = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

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
