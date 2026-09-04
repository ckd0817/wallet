import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUsdCnyRateProvider } from '../src/exchangeRate.js';

test('美元兑人民币汇率会校验并缓存', async () => {
  let requests = 0;
  let currentTime = Date.parse('2026-09-04T08:00:00.000Z');
  const provider = createUsdCnyRateProvider({
    now: () => currentTime,
    cacheTtlMs: 1000,
    fetcher: async () => {
      requests += 1;
      return new Response(JSON.stringify({ date: '2026-09-04', base: 'USD', quote: 'CNY', rate: 6.717 }));
    },
  });

  assert.equal((await provider()).rate, 6.717);
  assert.equal((await provider()).rate, 6.717);
  assert.equal(requests, 1);
  currentTime += 1001;
  assert.equal((await provider()).rate, 6.717);
  assert.equal(requests, 2);
});

test('上游失败时沿用最近一次有效汇率', async () => {
  let succeeds = true;
  let currentTime = Date.parse('2026-09-04T08:00:00.000Z');
  const provider = createUsdCnyRateProvider({
    now: () => currentTime,
    cacheTtlMs: 1000,
    fetcher: async () => {
      if (!succeeds) throw new Error('offline');
      return new Response(JSON.stringify({ date: '2026-09-04', base: 'USD', quote: 'CNY', rate: 6.717 }));
    },
  });

  await provider();
  succeeds = false;
  currentTime += 1001;
  assert.equal((await provider()).rate, 6.717);
});
