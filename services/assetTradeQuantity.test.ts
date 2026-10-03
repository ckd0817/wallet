import { describe, expect, it } from 'vitest';
import { resolveAssetTradeQuantity } from './assetTradeQuantity';
import { normalizeSnapshot } from './walletStore';

describe('交易输入单位', () => {
  it('按金额计算份额', () => {
    expect(resolveAssetTradeQuantity('amount', 100, 4)).toEqual({ amount: 100, shares: 25 });
  });
  it('净值变化后仍保持指定份额', () => {
    expect(resolveAssetTradeQuantity('shares', 25, 4)).toEqual({ amount: 100, shares: 25 });
    expect(resolveAssetTradeQuantity('shares', 25, 5)).toEqual({ amount: 125, shares: 25 });
  });
  it('保留小数份额', () => {
    expect(resolveAssetTradeQuantity('shares', 0.125, 8)).toEqual({ amount: 1, shares: 0.125 });
  });
  it.each([0, -1, NaN, Infinity])('拒绝无效数量 %s', value => {
    expect(() => resolveAssetTradeQuantity('shares', value, 2)).toThrow();
  });
  it('拒绝未知价格与溢出金额', () => {
    expect(() => resolveAssetTradeQuantity('shares', 10, 0)).toThrow();
    expect(() => resolveAssetTradeQuantity('shares', Number.MAX_VALUE, 2)).toThrow();
  });
  it('待成交记录保存及读取后仍按份额结算，兼容旧金额记录', () => {
    const snapshot = normalizeSnapshot({ assetTradeRecords: [{ id: 'test', holdingId: 'fund', status: 'pending', inputMode: 'shares', shares: 25, amount: 0 }, { id: 'legacy', holdingId: 'fund', status: 'pending', shares: 0, amount: 100 }] } as any);
    const record = snapshot.assetTradeRecords.find(item => item.id === 'test')!;
    expect(record.inputMode).toBe('shares');
    expect(resolveAssetTradeQuantity(record.inputMode!, record.shares, 5)).toEqual({shares: 25, amount: 125});
    expect(snapshot.assetTradeRecords.find(item => item.id === 'legacy')!.inputMode).toBe('amount');
  });
});
