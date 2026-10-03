export function resolveAssetTradeQuantity(mode: 'amount' | 'shares', value: number, price: number) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(price) || price <= 0) {
    throw new Error('请检查交易数量和成交价');
  }
  const shares = mode === 'shares' ? value : value / price;
  const amount = mode === 'amount' ? value : value * price;
  if (!Number.isFinite(shares) || !Number.isFinite(amount) || shares <= 0 || amount <= 0) {
    throw new Error('请检查交易数量');
  }
  return { shares, amount };
}
