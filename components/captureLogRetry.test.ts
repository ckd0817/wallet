import { describe, expect, it } from 'vitest';

import { CaptureAttemptLog } from '../types';
import { getRetryableCaptureLogIds } from './captureLogRetry';

const buildLog = (overrides: Partial<CaptureAttemptLog>): CaptureAttemptLog => ({
  id: overrides.id ?? 'log-id',
  capturedAt: overrides.capturedAt ?? '2026-04-15T10:00:00.000Z',
  status: overrides.status ?? 'failed',
  imagePath: overrides.imagePath ?? 'file:///captures/log.png',
  failureReason: overrides.failureReason,
  failureStage: overrides.failureStage,
  assistantReplyRaw: overrides.assistantReplyRaw,
  assistantReplyParsed: overrides.assistantReplyParsed,
  httpStatus: overrides.httpStatus,
  responseBodyRaw: overrides.responseBodyRaw,
  transactionId: overrides.transactionId,
  summary: overrides.summary,
  merchantName: overrides.merchantName,
  amount: overrides.amount,
});

describe('getRetryableCaptureLogIds', () => {
  it('returns the latest failed log id for a saved image', () => {
    const retryableLogIds = getRetryableCaptureLogIds([
      buildLog({
        id: 'failed-latest',
        capturedAt: '2026-04-15T10:00:00.000Z',
        status: 'failed',
        imagePath: 'file:///captures/1.png',
      }),
      buildLog({
        id: 'failed-older',
        capturedAt: '2026-04-15T09:00:00.000Z',
        status: 'failed',
        imagePath: 'file:///captures/1.png',
      }),
    ]);

    expect(Array.from(retryableLogIds)).toEqual(['failed-latest']);
  });

  it('does not return an older failed log when the same image has a newer attempt', () => {
    const retryableLogIds = getRetryableCaptureLogIds([
      buildLog({
        id: 'failed-older',
        capturedAt: '2026-04-15T09:00:00.000Z',
        status: 'failed',
        imagePath: 'file:///captures/1.png',
      }),
      buildLog({
        id: 'processing-latest',
        capturedAt: '2026-04-15T10:00:00.000Z',
        status: 'processing',
        imagePath: 'file:///captures/1.png',
      }),
      buildLog({
        id: 'success-other',
        capturedAt: '2026-04-15T11:00:00.000Z',
        status: 'success',
        imagePath: 'file:///captures/2.png',
      }),
    ]);

    expect(retryableLogIds.size).toBe(0);
  });

  it('ignores logs without saved images and non-failed latest logs', () => {
    const retryableLogIds = getRetryableCaptureLogIds([
      buildLog({
        id: 'empty-image',
        imagePath: '',
        status: 'failed',
      }),
      buildLog({
        id: 'success-latest',
        imagePath: 'file:///captures/3.png',
        status: 'success',
      }),
      buildLog({
        id: 'processing-latest',
        imagePath: 'file:///captures/4.png',
        status: 'processing',
      }),
    ]);

    expect(retryableLogIds.size).toBe(0);
  });
});
