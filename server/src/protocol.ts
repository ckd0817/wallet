import { z } from 'zod';
export const kinds = ['transactions','categories','recurringProfiles','assetHoldings',
  'assetRecurringPlans','assetPerformanceHistory','assetTradeRecords','appSettings','llmConfig'] as const;
export const backupKinds = kinds.slice(0, 7);
const id = z.string().min(1).max(200);
const text = z.string().max(100000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/);
const positive = z.number().finite().nonnegative();
const recordSchemas: Record<string, z.ZodType> = {
  transactions: z.object({id, amount: positive, type: z.enum(['expense','income']), categoryId: id, date, note: text}).passthrough(),
  categories: z.object({id, name: z.string().min(1).max(200), icon: text, color: text, type: z.enum(['expense','income'])}).passthrough(),
  recurringProfiles: z.object({id, amount: positive, type: z.enum(['expense','income']), categoryId: id, note: text,
    frequency: z.enum(['daily','weekly','monthly','yearly']), startDate: date, nextDueDate: date}).passthrough(),
  assetHoldings: z.object({id,assetType: z.enum(['stock','fund']),code: id,market: z.enum(['sh','sz','fund']),name: text,
    shares: positive,costAmount: positive,createdAt: date,updatedAt: date}).passthrough(),
  assetRecurringPlans: z.object({id,holdingId:id,amount:positive,frequency:z.enum(['daily','weekly','monthly']),
    startDate:date,nextDueDate:date,enabled:z.boolean(),createdAt:date,updatedAt:date}).passthrough(),
  assetPerformanceHistory: z.object({date,marketValue:positive,costAmount:positive,totalProfit:z.number().finite(),
    totalProfitRate:z.number().finite(),dailyProfit:z.number().finite(),dailyProfitRate:z.number().finite(),
    benchmarkName:text,benchmarkChangePercent:z.number().finite(),capturedAt:date}).passthrough(),
  assetTradeRecords: z.object({id,holdingId:id,assetType:z.enum(['stock','fund']),code:id,name:text,
    tradeType:z.enum(['buy','sell','recurring']),source:z.enum(['manual','recurring']),
    status:z.enum(['pending','completed']).optional(),shares:positive,amount:positive,price:positive,occurredAt:date,createdAt:date}).passthrough(),
  appSettings: z.object({expenseAverageMonths:z.number().int().min(1).max(120),fundQuoteSource:z.enum(['eastmoney','sina','tencent','legacy'])}).passthrough(),
  llmConfig: z.object({apiKey:text,baseUrl:text,modelName:text,timeoutMs:z.number().int().min(1).max(600000),capturePrompt:text}).passthrough(),
};
export const changeSchema = z.object({
  kind:z.enum(kinds), id, value:z.record(z.string(),z.unknown()).nullable(),
  fields:z.array(z.string().max(100)).max(100).optional(),
}).strict();
export const operationSchema = z.object({
  id, mode:z.enum(['mutate','append','seed']).default('mutate'),
  changes:z.array(changeSchema).min(1).max(20000),
}).strict();
export const pushSchema = z.object({
  deviceId:id,epoch:z.number().int().positive(),operations:z.array(operationSchema).max(100),
}).strict();
export type Change = z.infer<typeof changeSchema>;
export type Operation = z.infer<typeof operationSchema>;
export function validateChange(change: Change) {
  if (change.value === null) return;
  recordSchemas[change.kind].parse(change.value);
  const expected = change.kind === 'assetPerformanceHistory' ? change.value.date
    : ['llmConfig','appSettings'].includes(change.kind) ? 'singleton' : change.value.id;
  if (expected !== change.id) throw new HttpError(400,'记录编号不一致');
}
export class HttpError extends Error {
  constructor(public statusCode:number,message:string,public details?:unknown) { super(message); }
}
export function validateBackup(data: unknown): Change[] {
  const parsed = z.record(z.string(),z.unknown()).parse(data);
  const changes: Change[] = [];
  for (const kind of backupKinds) {
    const values = z.array(z.record(z.string(),z.unknown())).parse(parsed[kind] ?? []);
    const seen = new Set<string>();
    for (const value of values) {
      const key = String(kind === 'assetPerformanceHistory' ? value.date : value.id);
      if (seen.has(key)) throw new HttpError(400,'备份包含重复编号');
      seen.add(key);
      const change = {kind,id:key,value} as Change;
      validateChange(change);
      changes.push(change);
    }
  }
  return changes;
}
