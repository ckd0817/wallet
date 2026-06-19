import { describe, expect, it } from 'vitest';

import {
  applyAssetRecurringPurchase,
  calculateNextAssetRecurringDate,
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
    });
  });

  it('解析腾讯 A 股行情文本', () => {
    const quotes = parseTencentStockQuoteResponse(
      'v_sh600000="1~浦发银行~600000~9.09~9.24~9.20~~~~~~~~~~~~~~~~~~~~~~~~~20260618161420~-0.15~-1.62~";',
      '2026-06-18T08:00:00.000Z',
    );

    expect(quotes[0]).toMatchObject({
      assetType: 'stock',
      code: '600000',
      name: '浦发银行',
      price: 9.09,
      changePercent: -1.62,
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
});
