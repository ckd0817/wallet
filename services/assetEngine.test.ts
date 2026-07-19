import { describe, expect, it } from 'vitest';

import {
  applyAssetRecurringPurchase,
  applyAssetRecurringPurchaseWithQuote,
  buildAssetHoldingDistribution,
  buildAssetPerformanceSnapshot,
  buildAssetPositions,
  calculateNextAssetRecurringDate,
  isLikelyMarketOpenForHolding,
  mergeAssetPerformanceHistory,
  normalizeAssetImportCandidate,
  parseFundQuoteResponse,
  parseTencentStockQuoteResponse,
  resolveAssetTotalCost,
} from './assetEngine';
import { normalizeSnapshot } from './walletStore';

describe('assetEngine', () => {
  it('解析天天基金估值 JSONP', () => {
    const quote = parseFundQuoteResponse(
      'jsonpgz({"fundcode":"000001","name":"华夏成长混合","jzrq":"2026-06-17","dwjz":"1.4070","gsz":"1.4461","gszzl":"2.78","gztime":"2026-06-18 15:00"});',
      '2026-06-18T08:00:00.000Z',
    );

    expect(quote).toMatchObject({
      assetType: 'fund',
      code: '000001',
      name: '华夏成长混合',
      price: 1.4461,
      changePercent: 2.78,
      priceSource: 'estimated',
      estimatedPrice: 1.4461,
      confirmedPrice: 1.407,
      confirmedDate: '2026-06-17',
    });
  });

  it('解析腾讯 A 股行情文本', () => {
    const quotes = parseTencentStockQuoteResponse(
      'v_sh600000="1~浦发银行~600000~9.09~9.24~9.20~~~~~~~~~~~~~~~~~~~~~~~~~20260618161420~-0.15~-1.62~";v_sh000001="1~上证指数~000001~3000.00~2990.00~2995.00~~~~~~~~~~~~~~~~~~~~~~~~~20260618161420~10.00~0.33~";',
      '2026-06-18T08:00:00.000Z',
    );

    expect(quotes[0]).toMatchObject({
      assetType: 'stock',
      code: '600000',
      name: '浦发银行',
      price: 9.09,
      changePercent: -1.62,
    });
    expect(quotes[1]).toMatchObject({
      assetType: 'index',
      code: '000001',
      name: '上证指数',
      changePercent: 0.33,
    });
  });

  it('旧快照会补齐资产字段', () => {
    const snapshot = normalizeSnapshot({
      transactions: [],
      categories: [],
      recurringProfiles: [],
    });

    expect(snapshot.assetHoldings).toEqual([]);
    expect(snapshot.assetQuoteCache).toEqual([]);
    expect(snapshot.assetPerformanceHistory).toEqual([]);
    expect(snapshot.assetTradeRecords).toEqual([]);
  });

  it('小数持仓成本按单位成本归一为总成本', () => {
    const candidate = normalizeAssetImportCandidate({
      assetType: 'fund',
      code: '018043',
      market: 'fund',
      name: '天弘纳斯达克100指数(QDII)A',
      shares: 4947.35,
      unitCost: 1.8301,
    });

    expect(candidate?.costAmount).toBeCloseTo(9054.15, 2);
    expect(candidate?.costSource).toBe('unit_cost');
  });

  it('同时有平均成本和总成本时优先总成本', () => {
    const candidate = normalizeAssetImportCandidate({
      assetType: 'fund',
      code: '016452',
      market: 'fund',
      name: '南方纳斯达克100指数发起（QDII）A',
      shares: 1118.73,
      unitCost: 2.1085,
      totalCost: 2500,
    });

    expect(candidate?.costAmount).toBe(2500);
    expect(candidate?.costSource).toBe('total_cost');
  });

  it('用市值和收益反推总成本', () => {
    expect(resolveAssetTotalCost({ marketValue: 10168.78, holdingProfit: 1114.68 })).toMatchObject({
      costAmount: 9054.1,
      costSource: 'market_minus_profit',
    });
  });

  it('用市值和收益率反推总成本', () => {
    const resolved = resolveAssetTotalCost({ marketValue: 2739.19, profitRate: 9.76 });

    expect(resolved.costAmount).toBeCloseTo(2495.62, 2);
    expect(resolved.costSource).toBe('market_by_rate');
  });

  it('推进定投日期', () => {
    expect(calculateNextAssetRecurringDate('2026-06-18', 'daily')).toBe('2026-06-19');
    expect(calculateNextAssetRecurringDate('2026-06-18', 'weekly')).toBe('2026-06-25');
    expect(calculateNextAssetRecurringDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });

  it('按本次基金价格计算定投份额', () => {
    const execution = applyAssetRecurringPurchase(
      {
        id: 'holding-1',
        assetType: 'fund',
        code: '000001',
        market: 'fund',
        name: '华夏成长混合',
        shares: 100,
        costAmount: 200,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'plan-1',
        holdingId: 'holding-1',
        amount: 100,
        frequency: 'daily',
        startDate: '2026-06-18',
        nextDueDate: '2026-06-18',
        enabled: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      2,
    );

    expect(execution?.addedShares).toBe(50);
    expect(execution?.holding.shares).toBe(150);
    expect(execution?.holding.costAmount).toBe(300);
    expect(execution?.plan.nextDueDate).toBe('2026-06-19');
  });

  it('价格无效时不执行定投', () => {
    const execution = applyAssetRecurringPurchase(
      {
        id: 'holding-1',
        assetType: 'fund',
        code: '000001',
        market: 'fund',
        name: '华夏成长混合',
        shares: 100,
        costAmount: 200,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'plan-1',
        holdingId: 'holding-1',
        amount: 100,
        frequency: 'daily',
        startDate: '2026-06-18',
        nextDueDate: '2026-06-18',
        enabled: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      0,
    );

    expect(execution).toBeNull();
  });

  it('节假日旧行情不执行定投', () => {
    const execution = applyAssetRecurringPurchaseWithQuote(
      {
        id: 'holding-1',
        assetType: 'fund',
        code: '000001',
        market: 'fund',
        name: '华夏成长混合',
        shares: 100,
        costAmount: 200,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'plan-1',
        holdingId: 'holding-1',
        amount: 100,
        frequency: 'daily',
        startDate: '2026-06-20',
        nextDueDate: '2026-06-20',
        enabled: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        assetType: 'fund',
        code: '000001',
        name: '华夏成长混合',
        price: 2,
        changePercent: 1,
        quoteTime: '2026-06-19 15:00',
        source: 'eastmoney-fund',
        syncedAt: '2026-06-20T08:00:00.000Z',
      },
      '2026-06-20',
    );

    expect(execution).toBeNull();
  });

  it('节假日顺延到下一个交易日只执行一笔', () => {
    const execution = applyAssetRecurringPurchaseWithQuote(
      {
        id: 'holding-1',
        assetType: 'fund',
        code: '000001',
        market: 'fund',
        name: '华夏成长混合',
        shares: 100,
        costAmount: 200,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'plan-1',
        holdingId: 'holding-1',
        amount: 100,
        frequency: 'daily',
        startDate: '2026-06-20',
        nextDueDate: '2026-06-20',
        enabled: true,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        assetType: 'fund',
        code: '000001',
        name: '华夏成长混合',
        price: 2,
        changePercent: 1,
        quoteTime: '2026-06-22 15:00',
        source: 'eastmoney-fund',
        syncedAt: '2026-06-22T08:00:00.000Z',
      },
      '2026-06-22',
    );

    expect(execution?.addedShares).toBe(50);
    expect(execution?.holding.shares).toBe(150);
    expect(execution?.plan.nextDueDate).toBe('2026-06-23');
  });

  it('生成并合并资产表现历史', () => {
    const positions = buildAssetPositions(
      [
        {
          id: 'holding-1',
          assetType: 'fund',
          code: '000001',
          market: 'fund',
          name: '华夏成长混合',
          shares: 100,
          costAmount: 180,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      [
        {
          assetType: 'fund',
          code: '000001',
          name: '华夏成长混合',
          price: 2,
          changePercent: 1,
          quoteTime: '2026-06-18 15:00',
          source: 'eastmoney-fund',
          syncedAt: '2026-06-18T08:00:00.000Z',
        },
      ],
    );

    const snapshot = buildAssetPerformanceSnapshot(
      positions,
      {
        assetType: 'index',
        code: '000001',
        name: '上证指数',
        price: 3000,
        changePercent: 0.33,
        quoteTime: '2026-06-18 15:00',
        source: 'tencent-index-sh',
        syncedAt: '2026-06-18T08:00:00.000Z',
      },
      '2026-06-18T08:00:00.000Z',
    );
    const history = mergeAssetPerformanceHistory(
      [
        {
          date: '2026-06-18',
          marketValue: 100,
          costAmount: 100,
          totalProfit: 0,
          totalProfitRate: 0,
          dailyProfit: 0,
          dailyProfitRate: 0,
          benchmarkName: '',
          benchmarkChangePercent: 0,
          capturedAt: '2026-06-18T07:00:00.000Z',
        },
      ],
      snapshot,
    );

    expect(snapshot).toMatchObject({
      date: '2026-06-18',
      marketValue: 200,
      costAmount: 180,
      totalProfit: 20,
      benchmarkName: '上证指数',
      benchmarkChangePercent: 0.33,
    });
    expect(snapshot?.dailyProfit).toBeCloseTo(1.98, 2);
    expect(history).toHaveLength(1);
    expect(history[0].marketValue).toBe(200);
  });

  it('计算持仓分布占比', () => {
    const distribution = buildAssetHoldingDistribution(
      buildAssetPositions(
        [
          {
            id: 'holding-1',
            assetType: 'fund',
            code: '000001',
            market: 'fund',
            name: 'A基金',
            shares: 100,
            costAmount: 100,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
          {
            id: 'holding-2',
            assetType: 'stock',
            code: '600000',
            market: 'sh',
            name: '浦发银行',
            shares: 50,
            costAmount: 100,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        ],
        [
          {
            assetType: 'fund',
            code: '000001',
            name: 'A基金',
            price: 2,
            changePercent: 0,
            quoteTime: '',
            source: 'test',
            syncedAt: '2026-06-18T08:00:00.000Z',
          },
          {
            assetType: 'stock',
            code: '600000',
            name: '浦发银行',
            price: 2,
            changePercent: 0,
            quoteTime: '',
            source: 'test',
            syncedAt: '2026-06-18T08:00:00.000Z',
          },
        ],
      ),
    );

    expect(distribution[0]).toMatchObject({ name: 'A基金', value: 200 });
    expect(distribution[0].percent).toBeCloseTo(66.67, 2);
  });
});

describe('isLikelyMarketOpenForHolding', () => {
  const qdiiHolding = { assetType: 'fund' as const, name: '南方纳斯达克100指数发起(QDII)A' };
  const domesticFund = { assetType: 'fund' as const, name: '鹏华丰享债券' };
  const quoteAt = (quoteTime: string) => ({ quoteTime, syncedAt: '2026-07-03T12:00:00.000Z' });

  describe('QDII 基金', () => {
    it('周末跳过（周六/周日）', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-04', quoteAt('2026-07-03 04:00'), qdiiHolding)).toBe(false);
      expect(isLikelyMarketOpenForHolding('2026-07-05', quoteAt('2026-07-03 04:00'), qdiiHolding)).toBe(false);
    });

    it('工作日且 quoteDate=today（盘后已更新）放行', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-03', quoteAt('2026-07-03 04:00'), qdiiHolding)).toBe(true);
    });

    it('工作日且 quoteDate=today−1（美东时差，盘前）放行', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-03', quoteAt('2026-07-02 04:00'), qdiiHolding)).toBe(true);
    });

    it('工作日且 quoteDate=today−3（T+1 + 周末）放行', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-06', quoteAt('2026-07-03 04:00'), qdiiHolding)).toBe(true);
    });

    it('工作日且 quoteDate=today−4（节假日堆积）跳过', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-07', quoteAt('2026-07-03 04:00'), qdiiHolding)).toBe(false);
    });

    it('quote 为空放行（保守）', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-03', null, qdiiHolding)).toBe(true);
    });

    it('quoteTime 为空放行（保守）', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-03', { quoteTime: '', syncedAt: '' }, qdiiHolding)).toBe(true);
    });
  });

  describe('境内基金/ETF', () => {
    it('周末跳过', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-04', quoteAt('2026-07-03 15:00'), domesticFund)).toBe(false);
    });

    it('工作日且 quoteDate=today（盘后已更新）放行', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-03', quoteAt('2026-07-03 15:00'), domesticFund)).toBe(true);
    });

    it('工作日且 quoteDate=today−1（盘前还没出今日估值）放行', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-03', quoteAt('2026-07-02 15:00'), domesticFund)).toBe(true);
    });

    it('工作日且 quoteDate=today−2（A 股节假日，接口没更新）跳过', () => {
      expect(isLikelyMarketOpenForHolding('2026-07-06', quoteAt('2026-07-03 15:00'), domesticFund)).toBe(false);
    });
  });

  it('QDII 周末优先级高于 daysLag 判断', () => {
    // 即使 quoteDate=today（理论上更新过），周六仍然跳过
    expect(isLikelyMarketOpenForHolding('2026-07-04', quoteAt('2026-07-04 04:00'), qdiiHolding)).toBe(false);
  });
});
