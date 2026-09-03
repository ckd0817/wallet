import {
  AssetHolding,
  AssetImportCandidate,
  AssetCurrency,
  AssetMarket,
  AssetPerformanceSnapshot,
  AssetQuote,
  AssetRecurringFrequency,
  AssetRecurringPlan,
  AssetType,
} from '../types';

export type AssetCostSource = NonNullable<AssetImportCandidate['costSource']>;

export interface AssetPositionView {
  holding: AssetHolding;
  quote?: AssetQuote;
  marketValue: number;
  profit: number;
  profitRate: number;
  dailyChangeAmount: number;
}

export interface AssetPortfolioSummary {
  totalMarketValue: number;
  totalCost: number;
  totalProfit: number;
  totalProfitRate: number;
  dailyChangeAmount: number;
  latestSyncedAt: string;
}

export interface AssetHoldingDistributionItem {
  id: string;
  name: string;
  value: number;
  percent: number;
  color: string;
}

export interface AssetRecurringExecution {
  holding: AssetHolding;
  plan: AssetRecurringPlan;
  addedShares: number;
  executionDate?: string;
  priceSource?: AssetQuote['priceSource'];
}

export const normalizeAssetCode = (code: string, market?: AssetMarket) => {
  const raw = code.trim().toUpperCase().replace(/^(NASDAQ|NYSE|AMEX|US)\s*:/, '');
  if (market === 'us' || /[A-Z]/.test(raw)) {
    return raw.replace(/[\-/]/g, '.').replace(/[^A-Z0-9.]/g, '').replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 12);
  }
  return raw.replace(/\D/g, '').slice(0, 6);
};

const normalizeAmount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

const DISTRIBUTION_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
const DELAYED_SETTLEMENT_FUND_PATTERN = /qdii|纳斯达克|nasdaq/i;

export const inferAssetMarket = (assetType: AssetType, code: string, preferredMarket?: AssetMarket): AssetMarket => {
  if (assetType === 'fund') {
    return 'fund';
  }
  if (preferredMarket === 'us') {
    return 'us';
  }
  if (preferredMarket === 'sh' || preferredMarket === 'sz') {
    return preferredMarket;
  }
  if (/[A-Za-z]/.test(code)) {
    return 'us';
  }
  const normalized = normalizeAssetCode(code);
  return normalized.startsWith('6') || normalized.startsWith('5') ? 'sh' : 'sz';
};

export const inferAssetCurrency = (market: AssetMarket): AssetCurrency => market === 'us' ? 'USD' : 'CNY';

export const getAssetCurrency = (asset: { market?: AssetMarket; currency?: AssetCurrency; code?: string }): AssetCurrency =>
  asset.currency === 'USD' || asset.market === 'us' || /[A-Za-z]/.test(asset.code ?? '') ? 'USD' : 'CNY';

export const isDelayedSettlementFund = (holding: Pick<AssetHolding, 'assetType' | 'name'>) =>
  holding.assetType === 'fund' && DELAYED_SETTLEMENT_FUND_PATTERN.test(holding.name);

export const calculateNextAssetRecurringDate = (dateStr: string, frequency: AssetRecurringFrequency): string => {
  const date = new Date(dateStr);
  if (frequency === 'daily') {
    date.setDate(date.getDate() + 1);
  } else if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else {
    const currentMonth = date.getMonth();
    date.setMonth(currentMonth + 1);
    if (date.getMonth() !== (currentMonth + 1) % 12) {
      date.setDate(0);
    }
  }
  return date.toISOString().split('T')[0];
};

export const applyAssetRecurringPurchase = (
  holding: AssetHolding,
  plan: AssetRecurringPlan,
  price: number,
): AssetRecurringExecution | null => {
  if (holding.assetType !== 'fund' || !plan.enabled || plan.amount <= 0 || price <= 0) {
    return null;
  }

  const addedShares = plan.amount / price;
  return {
    holding: {
      ...holding,
      shares: holding.shares + addedShares,
      costAmount: holding.costAmount + plan.amount,
      updatedAt: new Date().toISOString(),
    },
    plan: {
      ...plan,
      nextDueDate: calculateNextAssetRecurringDate(plan.nextDueDate, plan.frequency),
      updatedAt: new Date().toISOString(),
    },
    addedShares,
  };
};

export const applyAssetRecurringPurchaseWithQuote = (
  holding: AssetHolding,
  plan: AssetRecurringPlan,
  quote: AssetQuote,
  today = new Date().toISOString().split('T')[0],
): AssetRecurringExecution | null => {
  if (holding.assetType !== 'fund' || !plan.enabled || plan.amount <= 0 || quote.price <= 0 || plan.nextDueDate > today) {
    return null;
  }

  const quoteDate = getAssetQuoteDate(quote);
  if (!quoteDate || quoteDate !== today || quoteDate < plan.nextDueDate) {
    return null;
  }

  const addedShares = plan.amount / quote.price;
  return {
    holding: {
      ...holding,
      shares: holding.shares + addedShares,
      costAmount: holding.costAmount + plan.amount,
      updatedAt: new Date().toISOString(),
    },
    plan: advanceAssetRecurringPlanPastDate(plan, quoteDate),
    addedShares,
    executionDate: quoteDate,
  };
};

export const advanceAssetRecurringPlanPastDate = (plan: AssetRecurringPlan, date: string): AssetRecurringPlan => {
  let nextDueDate = plan.nextDueDate;
  while (nextDueDate <= date) {
    nextDueDate = calculateNextAssetRecurringDate(nextDueDate, plan.frequency);
  }

  return {
    ...plan,
    nextDueDate,
    updatedAt: new Date().toISOString(),
  };
};

export const normalizeAssetHolding = (holding: Partial<AssetHolding>): AssetHolding | null => {
  const assetType = holding.assetType === 'fund' ? 'fund' : 'stock';
  const market = inferAssetMarket(assetType, holding.code ?? '', holding.market);
  const code = normalizeAssetCode(holding.code ?? '', market);
  if (!code) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: typeof holding.id === 'string' && holding.id ? holding.id : `${assetType}-${code}-${Date.now()}`,
    assetType,
    code,
    market,
    currency: inferAssetCurrency(market),
    name: typeof holding.name === 'string' ? holding.name.trim() : '',
    shares: typeof holding.shares === 'number' && Number.isFinite(holding.shares) ? Math.max(0, holding.shares) : 0,
    costAmount:
      typeof holding.costAmount === 'number' && Number.isFinite(holding.costAmount) ? Math.max(0, holding.costAmount) : 0,
    createdAt: typeof holding.createdAt === 'string' && holding.createdAt ? holding.createdAt : now,
    updatedAt: typeof holding.updatedAt === 'string' && holding.updatedAt ? holding.updatedAt : now,
  };
};

export const normalizeAssetQuote = (quote: Partial<AssetQuote>): AssetQuote | null => {
  const assetType = quote.assetType === 'fund' ? 'fund' : quote.assetType === 'index' ? 'index' : 'stock';
  const currency: AssetCurrency = quote.currency === 'USD' || /[A-Za-z]/.test(quote.code ?? '') ? 'USD' : 'CNY';
  const code = normalizeAssetCode(quote.code ?? '', currency === 'USD' ? 'us' : undefined);
  if (!code) {
    return null;
  }

  return {
    assetType,
    code,
    name: typeof quote.name === 'string' ? quote.name.trim() : '',
    price: typeof quote.price === 'number' && Number.isFinite(quote.price) ? Math.max(0, quote.price) : 0,
    changePercent:
      typeof quote.changePercent === 'number' && Number.isFinite(quote.changePercent) ? quote.changePercent : 0,
    quoteTime: typeof quote.quoteTime === 'string' ? quote.quoteTime : '',
    source: typeof quote.source === 'string' && quote.source ? quote.source : 'unknown',
    syncedAt: typeof quote.syncedAt === 'string' && quote.syncedAt ? quote.syncedAt : new Date().toISOString(),
    currency,
    priceSource: quote.priceSource === 'confirmed' ? 'confirmed' : quote.priceSource === 'estimated' ? 'estimated' : undefined,
    estimatedPrice:
      typeof quote.estimatedPrice === 'number' && Number.isFinite(quote.estimatedPrice)
        ? Math.max(0, quote.estimatedPrice)
        : undefined,
    confirmedPrice:
      typeof quote.confirmedPrice === 'number' && Number.isFinite(quote.confirmedPrice)
        ? Math.max(0, quote.confirmedPrice)
        : undefined,
    confirmedDate: typeof quote.confirmedDate === 'string' && quote.confirmedDate ? quote.confirmedDate : undefined,
    error: typeof quote.error === 'string' && quote.error ? quote.error : undefined,
  };
};

export const normalizeAssetPerformanceSnapshot = (
  snapshot: Partial<AssetPerformanceSnapshot>,
): AssetPerformanceSnapshot | null => {
  const rawDate = typeof snapshot.date === 'string' ? snapshot.date : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : typeof snapshot.capturedAt === 'string' && snapshot.capturedAt
      ? snapshot.capturedAt.split('T')[0]
      : '';

  if (!date) {
    return null;
  }

  return {
    date,
    marketValue: normalizeAmount(snapshot.marketValue),
    costAmount: normalizeAmount(snapshot.costAmount),
    totalProfit:
      typeof snapshot.totalProfit === 'number' && Number.isFinite(snapshot.totalProfit) ? snapshot.totalProfit : 0,
    totalProfitRate:
      typeof snapshot.totalProfitRate === 'number' && Number.isFinite(snapshot.totalProfitRate)
        ? snapshot.totalProfitRate
        : 0,
    dailyProfit:
      typeof snapshot.dailyProfit === 'number' && Number.isFinite(snapshot.dailyProfit) ? snapshot.dailyProfit : 0,
    dailyProfitRate:
      typeof snapshot.dailyProfitRate === 'number' && Number.isFinite(snapshot.dailyProfitRate)
        ? snapshot.dailyProfitRate
        : 0,
    benchmarkName: typeof snapshot.benchmarkName === 'string' ? snapshot.benchmarkName : '',
    benchmarkChangePercent:
      typeof snapshot.benchmarkChangePercent === 'number' && Number.isFinite(snapshot.benchmarkChangePercent)
        ? snapshot.benchmarkChangePercent
        : 0,
    capturedAt: typeof snapshot.capturedAt === 'string' && snapshot.capturedAt ? snapshot.capturedAt : `${date}T00:00:00.000Z`,
  };
};

export const getAssetQuoteDate = (quote?: Pick<AssetQuote, 'quoteTime' | 'syncedAt'> | null) => {
  if (!quote) {
    return '';
  }

  const rawQuoteTime = quote.quoteTime ?? '';
  const dateMatch = rawQuoteTime.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
  }

  const compactMatch = rawQuoteTime.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  return typeof quote.syncedAt === 'string' && quote.syncedAt ? quote.syncedAt.split('T')[0] : '';
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const daysBetweenUtc = (later: string, earlier: string) => {
  const laterDate = new Date(`${later}T12:00:00Z`);
  const earlierDate = new Date(`${earlier}T12:00:00Z`);
  return Math.floor((laterDate.getTime() - earlierDate.getTime()) / MS_PER_DAY);
};

const isWeekend = (dateStr: string) => {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

export const isLikelyMarketOpenForHolding = (
  today: string,
  quote: Pick<AssetQuote, 'quoteTime' | 'syncedAt'> | null | undefined,
  holding: Pick<AssetHolding, 'assetType' | 'name'>,
): boolean => {
  if (isWeekend(today)) {
    return false;
  }

  const quoteDate = getAssetQuoteDate(quote);
  if (!quoteDate) {
    return true;
  }

  const daysLag = daysBetweenUtc(today, quoteDate);
  if (daysLag < 0) {
    return true;
  }

  return isDelayedSettlementFund(holding) ? daysLag <= 3 : daysLag <= 1;
};

export const getAssetQuoteConfirmedDate = (quote?: Pick<AssetQuote, 'confirmedDate' | 'quoteTime' | 'syncedAt' | 'priceSource'> | null) => {
  if (!quote) {
    return '';
  }
  if (quote.confirmedDate && /^\d{4}-\d{2}-\d{2}$/.test(quote.confirmedDate)) {
    return quote.confirmedDate;
  }
  return quote.priceSource === 'confirmed' ? getAssetQuoteDate(quote) : '';
};

export const parseFundQuoteResponse = (content: string, syncedAt = new Date().toISOString()): AssetQuote | null => {
  const match = content.match(/jsonpgz\((.*)\);?/);
  if (!match) {
    return null;
  }

  try {
    const payload = JSON.parse(match[1]) as Record<string, string>;
    const code = normalizeAssetCode(payload.fundcode ?? '');
    const estimatedPrice = Number(payload.gsz || 0);
    const confirmedPrice = Number(payload.dwjz || 0);
    const hasEstimatedPrice = Number.isFinite(estimatedPrice) && estimatedPrice > 0;
    const hasConfirmedPrice = Number.isFinite(confirmedPrice) && confirmedPrice > 0;
    const price = hasEstimatedPrice ? estimatedPrice : hasConfirmedPrice ? confirmedPrice : 0;
    if (!code || !Number.isFinite(price) || price <= 0) {
      return null;
    }
    const confirmedDate = payload.jzrq && /^\d{4}-\d{1,2}-\d{1,2}$/.test(payload.jzrq)
      ? payload.jzrq.replace(/-(\d)(?=-|$)/g, '-0$1')
      : undefined;
    return {
      assetType: 'fund',
      code,
      name: payload.name ?? '',
      price,
      changePercent: Number(payload.gszzl || 0),
      quoteTime: payload.gztime || payload.jzrq || '',
      source: 'eastmoney-fund',
      syncedAt,
      priceSource: hasEstimatedPrice ? 'estimated' : 'confirmed',
      estimatedPrice: hasEstimatedPrice ? estimatedPrice : undefined,
      confirmedPrice: hasConfirmedPrice ? confirmedPrice : undefined,
      confirmedDate,
    };
  } catch {
    return null;
  }
};

const buildConfirmedFundQuote = ({
  code,
  name,
  price,
  changePercent,
  confirmedDate,
  source,
  syncedAt,
}: {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  confirmedDate: string;
  source: string;
  syncedAt: string;
}): AssetQuote | null => {
  const normalizedCode = normalizeAssetCode(code);
  if (!normalizedCode || !Number.isFinite(price) || price <= 0 || !confirmedDate) {
    return null;
  }

  return {
    assetType: 'fund',
    code: normalizedCode,
    name,
    price,
    changePercent: Number.isFinite(changePercent) ? changePercent : 0,
    quoteTime: confirmedDate,
    source,
    syncedAt,
    priceSource: 'confirmed',
    confirmedPrice: price,
    confirmedDate,
  };
};

export const parseEastmoneyFundQuoteResponse = (
  content: string,
  code: string,
  name = '',
  syncedAt = new Date().toISOString(),
): AssetQuote | null => {
  try {
    const payload = JSON.parse(content) as {
      Data?: { LSJZList?: Array<{ FSRQ?: string; DWJZ?: string; JZZZL?: string }> };
      ErrCode?: number;
    };
    const latest = payload.Data?.LSJZList?.[0];
    if (payload.ErrCode !== 0 || !latest) {
      return null;
    }
    return buildConfirmedFundQuote({
      code,
      name,
      price: Number(latest.DWJZ || 0),
      changePercent: Number(latest.JZZZL || 0),
      confirmedDate: latest.FSRQ || '',
      source: 'eastmoney-f10',
      syncedAt,
    });
  } catch {
    return null;
  }
};

export const parseSinaFundQuoteResponse = (
  content: string,
  code: string,
  name = '',
  syncedAt = new Date().toISOString(),
): AssetQuote | null => {
  try {
    const payload = JSON.parse(content) as {
      result?: { status?: { code?: number }; data?: { data?: Array<{ fbrq?: string; jjjz?: string }> } };
    };
    const rows = payload.result?.data?.data ?? [];
    const latest = rows[0];
    const previousPrice = Number(rows[1]?.jjjz || 0);
    const price = Number(latest?.jjjz || 0);
    if (payload.result?.status?.code !== 0 || !latest) {
      return null;
    }
    return buildConfirmedFundQuote({
      code,
      name,
      price,
      changePercent: previousPrice > 0 ? ((price - previousPrice) / previousPrice) * 100 : 0,
      confirmedDate: (latest.fbrq || '').split(' ')[0],
      source: 'sina-fund',
      syncedAt,
    });
  } catch {
    return null;
  }
};

export const parseTencentFundQuoteResponse = (
  content: string,
  expectedCode: string,
  fallbackName = '',
  syncedAt = new Date().toISOString(),
): AssetQuote | null => {
  const match = content.match(/v_jj(\d{6})="([^"]*)";/);
  if (!match) {
    return null;
  }
  const fields = match[2].split('~');
  return buildConfirmedFundQuote({
    code: match[1] || expectedCode,
    name: fields[1] || fallbackName,
    price: Number(fields[5] || 0),
    changePercent: Number(fields[7] || 0),
    confirmedDate: fields[8] || '',
    source: 'tencent-fund',
    syncedAt,
  });
};

export const parseTencentStockQuoteResponse = (content: string, syncedAt = new Date().toISOString()): AssetQuote[] => {
  const quotes: AssetQuote[] = [];
  const pattern = /v_(?:(sh|sz)(\d{6})|us([A-Z0-9.]+))="([^"]*)";/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const market: AssetMarket = match[3] ? 'us' : match[1] as 'sh' | 'sz';
    const code = normalizeAssetCode(match[3] || match[2], market);
    const rawFields = match[4];
    const fields = rawFields.split('~');
    const name = fields[1] ?? '';
    const price = Number(fields[3] || 0);
    const changePercent = Number(fields[32] || 0);
    const rawTime = fields[30] ?? '';
    if (!price || !Number.isFinite(price)) {
      continue;
    }

    const isIndex = (market === 'sh' && code === '000001') || (market === 'us' && ['INX', 'IXIC', 'DJI'].includes(code));
    quotes.push({
      assetType: isIndex ? 'index' : 'stock',
      code,
      name,
      price,
      changePercent: Number.isFinite(changePercent) ? changePercent : 0,
      quoteTime: formatTencentQuoteTime(rawTime),
      source: isIndex ? `tencent-index-${market}` : `tencent-${market}`,
      syncedAt,
      currency: market === 'us' ? 'USD' : 'CNY',
    });
  }

  return quotes;
};

const formatTencentQuoteTime = (rawTime: string) => {
  if (!/^\d{14}$/.test(rawTime)) {
    return rawTime;
  }
  return `${rawTime.slice(0, 4)}-${rawTime.slice(4, 6)}-${rawTime.slice(6, 8)} ${rawTime.slice(8, 10)}:${rawTime.slice(10, 12)}`;
};

export const buildAssetPositions = (holdings: AssetHolding[], quotes: AssetQuote[]): AssetPositionView[] => {
  const quoteMap = new Map(quotes.map((quote) => [`${quote.assetType}:${quote.code}`, quote]));
  return holdings.map((holding) => {
    const quote = quoteMap.get(`${holding.assetType}:${holding.code}`);
    const price = quote?.price ?? 0;
    const marketValue = holding.shares * price;
    const profit = marketValue - holding.costAmount;
    const profitRate = holding.costAmount > 0 ? (profit / holding.costAmount) * 100 : 0;
    const dailyChangeAmount = quote ? calculateDailyChangeAmount(marketValue, quote.changePercent) : 0;
    return { holding, quote, marketValue, profit, profitRate, dailyChangeAmount };
  });
};

const calculateDailyChangeAmount = (marketValue: number, changePercent: number) => {
  if (!Number.isFinite(marketValue) || !Number.isFinite(changePercent) || marketValue <= 0 || changePercent <= -100) {
    return 0;
  }
  return marketValue - marketValue / (1 + changePercent / 100);
};

export const buildAssetSummary = (positions: AssetPositionView[]): AssetPortfolioSummary => {
  const latestSyncedAt = positions
    .map((position) => position.quote?.syncedAt ?? '')
    .filter(Boolean)
    .sort()
    .at(-1) ?? '';
  const totalMarketValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const totalCost = positions.reduce((sum, position) => sum + position.holding.costAmount, 0);
  const totalProfit = totalMarketValue - totalCost;

  return {
    totalMarketValue,
    totalCost,
    totalProfit,
    totalProfitRate: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
    dailyChangeAmount: positions.reduce((sum, position) => sum + position.dailyChangeAmount, 0),
    latestSyncedAt,
  };
};

export const buildAssetPerformanceSnapshot = (
  positions: AssetPositionView[],
  benchmarkQuote?: AssetQuote,
  capturedAt = new Date().toISOString(),
): AssetPerformanceSnapshot | null => {
  if (positions.length === 0 || positions.every((position) => !position.quote)) {
    return null;
  }

  const summary = buildAssetSummary(positions);
  const baseValue = summary.totalMarketValue - summary.dailyChangeAmount;
  const capturedDate = capturedAt.split('T')[0];
  const benchmarkDate = getAssetQuoteDate(benchmarkQuote);
  if (!benchmarkQuote || !benchmarkDate || benchmarkDate !== capturedDate) {
    return null;
  }

  return {
    date: capturedDate,
    marketValue: summary.totalMarketValue,
    costAmount: summary.totalCost,
    totalProfit: summary.totalProfit,
    totalProfitRate: summary.totalProfitRate,
    dailyProfit: summary.dailyChangeAmount,
    dailyProfitRate: baseValue > 0 ? (summary.dailyChangeAmount / baseValue) * 100 : 0,
    benchmarkName: benchmarkQuote?.name ?? '',
    benchmarkChangePercent: benchmarkQuote?.changePercent ?? 0,
    capturedAt,
  };
};

export const mergeAssetPerformanceHistory = (
  history: AssetPerformanceSnapshot[] = [],
  snapshot: AssetPerformanceSnapshot | null,
  maxDays = 370,
) => {
  const merged = new Map<string, AssetPerformanceSnapshot>();

  history
    .map((item) => normalizeAssetPerformanceSnapshot(item))
    .filter((item): item is AssetPerformanceSnapshot => Boolean(item))
    .forEach((item) => {
      merged.set(item.date, item);
    });

  const normalizedSnapshot = snapshot ? normalizeAssetPerformanceSnapshot(snapshot) : null;
  if (normalizedSnapshot) {
    merged.set(normalizedSnapshot.date, normalizedSnapshot);
  }

  return Array.from(merged.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-maxDays);
};

export const buildAssetHoldingDistribution = (positions: AssetPositionView[]): AssetHoldingDistributionItem[] => {
  const total = positions.reduce((sum, position) => sum + position.marketValue, 0);
  if (total <= 0) {
    return [];
  }

  return positions
    .filter((position) => position.marketValue > 0)
    .sort((left, right) => right.marketValue - left.marketValue)
    .map((position, index) => ({
      id: position.holding.id,
      name: position.quote?.name || position.holding.name || position.holding.code,
      value: position.marketValue,
      percent: (position.marketValue / total) * 100,
      color: DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length],
    }));
};

export const normalizeAssetImportCandidate = (candidate: Partial<AssetImportCandidate>): AssetImportCandidate | null => {
  const assetType = candidate.assetType === 'fund' ? 'fund' : 'stock';
  const market = inferAssetMarket(assetType, candidate.code ?? '', candidate.market);
  const code = normalizeAssetCode(candidate.code ?? '', market);
  if (!code) {
    return null;
  }
  const shares = normalizeAmount(candidate.shares);
  const totalCost = normalizeAmount(candidate.totalCost);
  const unitCost = normalizeAmount(candidate.unitCost);
  const marketValue = normalizeAmount(candidate.marketValue);
  const holdingProfit = typeof candidate.holdingProfit === 'number' && Number.isFinite(candidate.holdingProfit)
    ? candidate.holdingProfit
    : 0;
  const profitRate = typeof candidate.profitRate === 'number' && Number.isFinite(candidate.profitRate)
    ? candidate.profitRate
    : 0;
  const { costAmount, costSource } = resolveAssetTotalCost({
    costAmount: normalizeAmount(candidate.costAmount),
    totalCost,
    unitCost,
    shares,
    marketValue,
    holdingProfit,
    profitRate,
  });

  return {
    assetType,
    code,
    market,
    currency: inferAssetCurrency(market),
    name: typeof candidate.name === 'string' ? candidate.name.trim() : '',
    shares,
    costAmount,
    totalCost,
    unitCost,
    marketValue,
    holdingProfit,
    profitRate,
    costSource,
  };
};

export const resolveAssetTotalCost = ({
  costAmount = 0,
  totalCost = 0,
  unitCost = 0,
  shares = 0,
  marketValue = 0,
  holdingProfit = 0,
  profitRate = 0,
}: {
  costAmount?: number;
  totalCost?: number;
  unitCost?: number;
  shares?: number;
  marketValue?: number;
  holdingProfit?: number;
  profitRate?: number;
}): { costAmount: number; costSource: AssetCostSource } => {
  if (totalCost > 0) {
    return { costAmount: totalCost, costSource: 'total_cost' };
  }

  if (unitCost > 0 && shares > 0) {
    return { costAmount: unitCost * shares, costSource: 'unit_cost' };
  }

  if (marketValue > 0 && holdingProfit !== 0) {
    return { costAmount: Math.max(0, marketValue - holdingProfit), costSource: 'market_minus_profit' };
  }

  if (marketValue > 0 && profitRate !== 0 && profitRate > -100) {
    return { costAmount: marketValue / (1 + profitRate / 100), costSource: 'market_by_rate' };
  }

  if (costAmount > 0) {
    return { costAmount, costSource: 'total_cost' };
  }

  return { costAmount: 0, costSource: 'missing' };
};
