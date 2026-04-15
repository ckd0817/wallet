import { CaptureAttemptLog } from '../types';

const toTimestamp = (capturedAt: string) => new Date(capturedAt).getTime();

export const getRetryableCaptureLogIds = (captureLogs: CaptureAttemptLog[]) => {
  const latestLogByImagePath = new Map<string, CaptureAttemptLog>();

  captureLogs.forEach((log) => {
    const imagePath = log.imagePath?.trim();
    if (!imagePath) {
      return;
    }

    const currentLatest = latestLogByImagePath.get(imagePath);
    if (!currentLatest || toTimestamp(log.capturedAt) > toTimestamp(currentLatest.capturedAt)) {
      latestLogByImagePath.set(imagePath, log);
    }
  });

  return new Set(
    Array.from(latestLogByImagePath.values())
      .filter((log) => log.status === 'failed')
      .map((log) => log.id),
  );
};
