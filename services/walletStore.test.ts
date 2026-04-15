import { describe, expect, it } from 'vitest';

import { DEFAULT_CAPTURE_PROMPT, normalizeSnapshot } from './walletStore';

const PREVIOUS_DEFAULT_CAPTURE_PROMPT = [
  '你正在分析一张付款、收款或退款结果截图。',
  '今天的本地日期是 {{today_date}}。在推断 occurredAt 时优先使用这个日期；只有截图里明确出现其他日期时，才使用截图中的日期。',
  '你只能识别两种交易类型：expense 或 income。',
  '付款成功、消费支出、扣款成功等记为 expense。',
  '收款到账、退款到账、报销到账等记为 income。',
  '如果截图不足以确认是一笔有效入账记录，或者无法确认金额，就仍然只返回 JSON，并将 amount 设为 0，categoryId 设为空字符串，summary 写明原因。',
  '如果 transactionType=expense，categoryId 必须且只能从这些支出分类中选择：{{expense_categories}}。',
  '如果 transactionType=income，categoryId 必须且只能从这些收入分类中选择：{{income_categories}}。',
  '只返回 JSON，不要输出 Markdown、解释或额外文本。返回格式固定为 {"transactionType":"expense|income","amount":number,"merchantName":"...","occurredAt":"YYYY-MM-DD","categoryId":"...","note":"...","summary":"..."}。',
].join('\n');

describe('DEFAULT_CAPTURE_PROMPT', () => {
  it('要求多笔支出时优先记录最新的一条', () => {
    expect(DEFAULT_CAPTURE_PROMPT).toContain('如果截图里同时出现多笔支出记录，优先记录最新的一条，不要同时输出两条或多条记录。');
  });

  it('会把旧默认提示词迁移到新版本', () => {
    const snapshot = normalizeSnapshot({
      llmConfig: {
        apiKey: 'test-key',
        baseUrl: 'https://example.com/v1',
        modelName: 'demo-model',
        timeoutMs: 20000,
        capturePrompt: PREVIOUS_DEFAULT_CAPTURE_PROMPT,
      },
    });

    expect(snapshot.llmConfig.capturePrompt).toBe(DEFAULT_CAPTURE_PROMPT);
  });
});
