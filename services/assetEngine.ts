import {
  AssetHolding,
  AssetImportCandidate,
  AssetMarket,
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

export interface AssetRecurringExecution {
  holding: AssetHolding;
  plan: AssetRecurringPlan;
  addedShares: number;
}

export const normalizeAssetCode = (code: string) => code.trim().replace(/\D/g, '').slice(0, 6);

const normalizeAmount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

export const inferAssetMarket = (assetType: AssetType, code: string): AssetMarket => {
  if (assetType === 'fund') {
    return 'fund';
  }
  const normalized = normalizeAssetCode(code);
  return normalized.startsWith('6') || normalized.startsWith('5') ? 'sh' : 'sz';
};

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

export const normalizeAssetHolding = (holding: Partial<AssetHolding>): AssetHolding | null => {
  const assetType = holding.assetType === 'fund' ? 'fund' : 'stock';
  const code = normalizeAssetCode(holding.code ?? '');
  if (!code) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: typeof holding.id === 'string' && holding.id ? holding.id : `${assetType}-${code}-${Date.now()}`,
    assetType,
    code,
    market: holding.market === 'sh' || holding.market === 'sz' || holding.market === 'fund'
      ? holding.market
      : inferAssetMarket(assetType, code),
    name: typeof holding.name === 'string' ? holding.name.trim() : '',
    shares: typeof holding.shares === 'number' && Number.isFinite(holding.shares) ? Math.max(0, holding.shares) : 0,
    costAmount:
      typeof holding.costAmount === 'number' && Number.isFinite(holding.costAmount) ? Math.max(0, holding.costAmount) : 0,
    createdAt: typeof holding.createdAt === 'string' && holding.createdAt ? holding.createdAt : now,
    updatedAt: typeof holding.updatedAt === 'string' && holding.updatedAt ? holding.updatedAt : now,
  };
};

export const normalizeAssetQuote = (quote: Partial<AssetQuote>): AssetQuote | null => {
  const assetType = quote.assetType === 'fund' ? 'fund' : 'stock';
  const code = normalizeAssetCode(quote.code ?? '');
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
    error: typeof quote.error === 'string' && quote.error ? quote.error : undefined,
  };
};

export const parseFundQuoteResponse = (content: string, syncedAt = new Date().toISOString()): AssetQuote | null => {
  const match = content.match(/jsonpgz\((.*)\);?/);
  if (!match) {
    return null;
  }

  try {
    const payload = JSON.parse(match[1]) as Record<string, string>;
    const code = normalizeAssetCode(payload.fundcode ?? '');
    const price = Number(payload.gsz || payload.dwjz || 0);
    if (!code || !Number.isFinite(price) || price <= 0) {
      return null;
    }
    return {
      assetType: 'fund',
      code,
      name: payload.name ?? '',
      price,
      changePercent: Number(payload.gszzl || 0),
      quoteTime: payload.gztime || payload.jzrq || '',
      source: 'eastmoney-fund',
      syncedAt,
    };
  } catch {
    return null;
  }
};

export const parseTencentStockQuoteResponse = (content: string, syncedAt = new Date().toISOString()): AssetQuote[] => {
  const quotes: AssetQuote[] = [];
  const pattern = /v_(sh|sz)(\d{6})="([^"]*)";/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const [, market, code, rawFields] = match;
    const fields = rawFields.split('~');
    const name = fields[1] ?? '';
    const price = Number(fields[3] || 0);
    const changePercent = Number(fields[32] || 0);
    const rawTime = fields[30] ?? '';
    if (!price || !Number.isFinite(price)) {
      continue;
    }

    quotes.push({
      assetType: 'stock',
      code,
      name,
      price,
      changePercent: Number.isFinite(changePercent) ? changePercent : 0,
      quoteTime: formatTencentQuoteTime(rawTime),
      source: `tencent-${market}`,
      syncedAt,
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
    const dailyChangeAmount = quote ? marketValue * (quote.changePercent / 100) : 0;
    return { holding, quote, marketValue, profit, profitRate, dailyChangeAmount };
  });
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

export const normalizeAssetImportCandidate = (candidate: Partial<AssetImportCandidate>): AssetImportCandidate | null => {
  const assetType = candidate.assetType === 'fund' ? 'fund' : 'stock';
  const code = normalizeAssetCode(candidate.code ?? '');
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
    market: candidate.market === 'sh' || candidate.market === 'sz' || candidate.market === 'fund'
      ? candidate.market
      : inferAssetMarket(assetType, code),
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
