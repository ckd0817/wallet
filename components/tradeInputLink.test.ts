import { describe, expect, it } from 'vitest';

import { linkTradeInputs } from './Analysis';

describe('linkTradeInputs', () => {
  it('编辑份额后结合成交价推算金额', () => {
    const next = linkTradeInputs({ amount: '', shares: '100', price: '10' }, 'shares', ['shares', 'price']);
    expect(next.amount).toBe('1000');
  });

  it('编辑成交价后结合金额推算份额', () => {
    const next = linkTradeInputs({ amount: '1000', shares: '', price: '20' }, 'price', ['price', 'amount']);
    expect(next.shares).toBe('50');
  });

  it('编辑金额后结合份额推算成交价', () => {
    const next = linkTradeInputs({ amount: '1200', shares: '100', price: '' }, 'amount', ['amount', 'shares']);
    expect(next.price).toBe('12');
  });

  it('伙伴字段为空时不改写第三项', () => {
    const next = linkTradeInputs({ amount: '', shares: '100', price: '' }, 'shares', ['shares', 'price']);
    expect(next.amount).toBe('');
  });

  it('没有伙伴字段时原样返回', () => {
    const values = { amount: '1', shares: '2', price: '3' };
    expect(linkTradeInputs(values, 'amount', ['amount'])).toEqual(values);
  });
});
