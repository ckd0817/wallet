import React, { useMemo, useRef, useState } from 'react';
import {
  Bell,
  Bot,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Clock3,
  Download,
  Eye,
  Play,
  RefreshCcw,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

import {
  AutoBookkeepingSettings,
  CaptureAttemptLog,
  Category,
  LLMConfig,
  LLMConfigTestResult,
  RecurringProfile,
  Transaction,
  WalletBackupData,
} from '../types';
import { buildBackupPayload, parseBackupFile } from '../services/dataBackup';
import { DEFAULT_CAPTURE_PROMPT } from '../services/walletStore';

interface SettingsProps {
  transactions: Transaction[];
  categories: Category[];
  recurringProfiles: RecurringProfile[];
  llmConfig: LLMConfig;
  autoBookkeepingSettings: AutoBookkeepingSettings;
  captureLogs: CaptureAttemptLog[];
  onImport: (data: WalletBackupData, mode: 'append' | 'overwrite') => void;
  onDeleteRecurring: (id: string) => void;
  onUpdateLLMConfig: (config: LLMConfig) => void;
  onStartCaptureSession: () => Promise<void> | void;
  onStopCaptureSession: () => Promise<void> | void;
  onTestModelConfig: () => Promise<LLMConfigTestResult> | LLMConfigTestResult;
  onRefreshAutoBookkeepingStatus: () => Promise<void> | void;
}

const Settings: React.FC<SettingsProps> = ({
  transactions,
  categories,
  recurringProfiles,
  llmConfig,
  autoBookkeepingSettings,
  captureLogs,
  onImport,
  onDeleteRecurring,
  onUpdateLLMConfig,
  onStartCaptureSession,
  onStopCaptureSession,
  onTestModelConfig,
  onRefreshAutoBookkeepingStatus,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [modelTestResult, setModelTestResult] = useState<LLMConfigTestResult | null>(null);
  const [isAdvancedConfigOpen, setIsAdvancedConfigOpen] = useState(false);
  const [isModelTestDetailsOpen, setIsModelTestDetailsOpen] = useState(false);

  const isAndroidNative = Capacitor.getPlatform() === 'android';
  const llmConfigured = Boolean(llmConfig.apiKey && llmConfig.baseUrl && llmConfig.modelName);
  const llmReady = llmConfigured;
  const latestCaptureText = autoBookkeepingSettings.lastCaptureAt
    ? new Date(autoBookkeepingSettings.lastCaptureAt).toLocaleString('zh-CN')
    : '暂无';

  const statusCards = useMemo(
    () => [
      {
        icon: Eye,
        label: '截图会话',
        value: autoBookkeepingSettings.sessionActive ? '进行中' : '未开启',
      },
      {
        icon: Bell,
        label: '通知权限',
        value: autoBookkeepingSettings.notificationPermissionGranted ? '已允许' : '未允许',
      },
      {
        icon: Bot,
        label: '模型状态',
        value: llmReady ? '已配置' : '未配置',
      },
      {
        icon: Camera,
        label: '最近截图',
        value: latestCaptureText,
      },
    ],
    [
      autoBookkeepingSettings.notificationPermissionGranted,
      autoBookkeepingSettings.sessionActive,
      latestCaptureText,
      llmReady,
    ],
  );

  const transactionLookup = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );

  const resolveImagePreview = (imagePath: string) => {
    if (!imagePath) {
      return '';
    }
    return imagePath.startsWith('file://') ? Capacitor.convertFileSrc(imagePath) : imagePath;
  };

  const handleExport = async () => {
    const backupContent = JSON.stringify(
      buildBackupPayload({
        transactions,
        categories,
        recurringProfiles,
      }),
      null,
      2,
    );
    const fileName = `smartwallet_backup_${new Date().toISOString().split('T')[0]}.json`;

    try {
      if (Capacitor.isNativePlatform()) {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: backupContent,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });

        alert(`JSON备份已导出到: ${result.uri}`);
        return;
      }

      const blob = new Blob([backupContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出 JSON 备份失败，请重试');
    }
  };

  const processImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const content = loadEvent.target?.result as string;
      if (!content) {
        return;
      }

      try {
        const importedBackup = parseBackupFile(content);
        if (importedBackup.transactions.length === 0 && importedBackup.recurringProfiles.length === 0) {
          alert('备份文件中没有可导入的数据。');
          return;
        }

        onImport(importedBackup, importMode);
      } catch (error) {
        console.error('Import failed:', error);
        alert(error instanceof Error ? error.message : '未能解析备份文件，请检查 JSON 格式。');
      }
    };

    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRefreshStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      await onRefreshAutoBookkeepingStatus();
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const handleStartSession = async () => {
    setIsStartingSession(true);
    try {
      await onStartCaptureSession();
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleStopSession = async () => {
    setIsStoppingSession(true);
    try {
      await onStopCaptureSession();
    } finally {
      setIsStoppingSession(false);
    }
  };

  const handleTestModel = async () => {
    setIsTestingModel(true);
    setModelTestResult(null);
    setIsModelTestDetailsOpen(false);
    try {
      const result = await onTestModelConfig();
      setModelTestResult(result);
    } catch (error) {
      setModelTestResult({
        ok: false,
        message: error instanceof Error ? error.message : '模型测试失败',
        elapsedMs: 0,
        httpStatus: 0,
        endpoint: llmConfig.baseUrl,
        modelName: llmConfig.modelName,
        assistantReplyRaw: '',
        responseBodyRaw: '',
        failureStage: 'client',
      });
    } finally {
      setIsTestingModel(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-8 animate-slide-up pb-32">
      <section>
        <SectionHeader
          title="截图自动记账"
          action={
            <button
              onClick={handleRefreshStatus}
              disabled={isRefreshingStatus || !isAndroidNative}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-xs font-medium text-secondary transition-colors hover:text-primary disabled:cursor-not-allowed disabled:text-zinc-300"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
              刷新状态
            </button>
          }
        />

        <div className="rounded-[28px] border border-border bg-white p-5 shadow-sm sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statusCards.map(({ icon: Icon, label, value }) => (
              <StatusCard key={label} icon={Icon} label={label} value={value} />
            ))}
          </div>

          {autoBookkeepingSettings.lastError && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              最近错误：{autoBookkeepingSettings.lastError}
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <PrimaryActionButton
              onClick={handleStartSession}
              disabled={isStartingSession || !isAndroidNative || !llmReady}
              icon={Play}
              tone="primary"
            >
              {isStartingSession ? '开启中...' : '开启截图模式'}
            </PrimaryActionButton>
            <PrimaryActionButton
              onClick={handleStopSession}
              disabled={isStoppingSession || !isAndroidNative || !autoBookkeepingSettings.sessionActive}
              icon={Square}
              tone="ghost"
            >
              {isStoppingSession ? '停止中...' : '停止'}
            </PrimaryActionButton>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="截图模型配置" />
        <div className="rounded-[28px] border border-border bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4">
              <ConfigField label="Api Key">
                <input
                  type="password"
                  value={llmConfig.apiKey}
                  onChange={(event) => onUpdateLLMConfig({ ...llmConfig, apiKey: event.target.value })}
                  placeholder="sk-..."
                  className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-primary"
                />
              </ConfigField>

              <div className="grid gap-4 sm:grid-cols-2">
                <ConfigField label="Base URL">
                  <input
                    type="text"
                    value={llmConfig.baseUrl}
                    onChange={(event) => onUpdateLLMConfig({ ...llmConfig, baseUrl: event.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-primary"
                  />
                </ConfigField>
                <ConfigField label="Model Name">
                  <input
                    type="text"
                    value={llmConfig.modelName}
                    onChange={(event) => onUpdateLLMConfig({ ...llmConfig, modelName: event.target.value })}
                    placeholder="填写支持图片输入的模型"
                    className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-primary"
                  />
                </ConfigField>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-surface/40 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-primary">模型连通性测试</span>
                  {!llmConfigured && <InlineBadge tone="warning">未完成配置</InlineBadge>}
                </div>
                <button
                  onClick={handleTestModel}
                  disabled={isTestingModel || !isAndroidNative || !llmConfigured}
                  className="inline-flex min-w-[8rem] items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
                >
                  <Bot className="w-4 h-4" />
                  {isTestingModel ? '测试中...' : '测试模型'}
                </button>
              </div>

              {modelTestResult && (
                <div className="mt-4 space-y-4">
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
                      modelTestResult.ok
                        ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                        : 'border-amber-100 bg-amber-50 text-amber-800'
                    }`}
                  >
                    {modelTestResult.message}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <LogMeta label="测试结果" value={modelTestResult.ok ? '成功' : '失败'} />
                    <LogMeta label="耗时" value={`${modelTestResult.elapsedMs} ms`} />
                    <LogMeta label="HTTP 状态" value={String(modelTestResult.httpStatus || 0)} />
                    <LogMeta label="失败阶段" value={modelTestResult.failureStage || '无'} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsModelTestDetailsOpen((current) => !current)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-secondary transition-colors hover:text-primary"
                  >
                    {isModelTestDetailsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    查看响应详情
                  </button>

                  {isModelTestDetailsOpen && (
                    <div className="space-y-3">
                      <LogPanel title="模型原始回复" content={modelTestResult.assistantReplyRaw || '没有拿到模型回复。'} />
                      <LogPanel title="HTTP 原始响应" content={modelTestResult.responseBodyRaw || '没有返回 HTTP 响应正文。'} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsAdvancedConfigOpen((current) => !current)}
              className="flex w-full items-center justify-between rounded-3xl border border-border bg-white px-4 py-4 text-left transition-colors hover:bg-surface/50"
            >
              <div>
                <p className="text-sm font-semibold text-primary">高级配置</p>
                <p className="mt-1 text-xs text-secondary">Timeout · Prompt</p>
              </div>
              {isAdvancedConfigOpen ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            {isAdvancedConfigOpen && (
              <div className="space-y-4 rounded-3xl border border-border bg-surface/30 p-4">
                <ConfigField label="Timeout (ms)">
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={llmConfig.timeoutMs}
                    onChange={(event) =>
                      onUpdateLLMConfig({
                        ...llmConfig,
                        timeoutMs: Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0),
                      })
                    }
                    placeholder="20000"
                    className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-primary"
                  />
                </ConfigField>

                <ConfigField label="截图分析提示词">
                  <textarea
                    value={llmConfig.capturePrompt}
                    onChange={(event) => onUpdateLLMConfig({ ...llmConfig, capturePrompt: event.target.value })}
                    rows={8}
                    className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-6 text-primary"
                  />
                </ConfigField>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onUpdateLLMConfig({ ...llmConfig, capturePrompt: DEFAULT_CAPTURE_PROMPT })}
                    disabled={llmConfig.capturePrompt === DEFAULT_CAPTURE_PROMPT}
                    className="inline-flex items-center justify-center rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-medium text-primary transition-colors disabled:cursor-not-allowed disabled:text-zinc-400"
                  >
                    恢复默认提示词
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="周期性记账规则" />
        <div className="overflow-hidden rounded-[28px] border border-border bg-white shadow-sm divide-y divide-border">
          {recurringProfiles.length === 0 ? (
            <div className="p-6 text-center text-base text-zinc-400">暂无生效规则</div>
          ) : (
            recurringProfiles.map((profile) => {
              const category = categories.find((item) => item.id === profile.categoryId);
              return (
                <div key={profile.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary"></div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-medium text-primary">{category?.name}</span>
                      <span className="text-xs uppercase tracking-wider text-secondary">
                        {profile.frequency === 'daily' && '每天'}
                        {profile.frequency === 'weekly' && '每周'}
                        {profile.frequency === 'monthly' && '每月'}
                        {profile.frequency === 'yearly' && '每年'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-base text-primary">¥{profile.amount}</span>
                    <button onClick={() => onDeleteRecurring(profile.id)} className="text-zinc-300 transition-colors hover:text-danger">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section>
        <SectionHeader title="数据管理" />
        <div className="grid gap-4">
          <button
            onClick={handleExport}
            className="flex items-center justify-between rounded-[28px] border border-border bg-white px-5 py-5 text-left shadow-sm transition-colors hover:bg-surface/40"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface text-primary">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-primary">导出 JSON 备份</p>
                <p className="mt-1 text-xs text-secondary">交易 · 分类 · 周期规则</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-300" />
          </button>

          <div className="rounded-[28px] border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface text-primary">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-base font-semibold text-primary">导入 JSON 备份</p>
            </div>

            <div className="mt-5 flex gap-3 rounded-2xl bg-surface p-1">
              <button
                onClick={() => setImportMode('append')}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  importMode === 'append' ? 'bg-white text-primary shadow-sm' : 'text-secondary'
                }`}
              >
                追加模式
              </button>
              <button
                onClick={() => setImportMode('overwrite')}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  importMode === 'overwrite' ? 'bg-danger text-white shadow-sm' : 'text-secondary'
                }`}
              >
                覆盖模式
              </button>
            </div>

            <input type="file" ref={fileInputRef} accept=".json,application/json" onChange={processImport} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
            >
              选择 JSON 文件
            </button>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader title="截图分析日志" meta={captureLogs.length > 0 ? `${captureLogs.length} 条` : '暂无'} />
        <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-zinc-50/70 shadow-sm divide-y divide-zinc-200">
          {captureLogs.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-400">暂无分析日志</div>
          ) : (
            captureLogs.map((log) => {
              const relatedTransaction = log.transactionId ? transactionLookup.get(log.transactionId) : undefined;
              const relatedCategory = relatedTransaction
                ? categories.find((item) => item.id === relatedTransaction.categoryId)
                : undefined;
              const isExpanded = expandedLogId === log.id;
              const title =
                log.status === 'failed'
                  ? log.failureReason || '截图识别失败'
                  : log.merchantName || log.summary || '截图自动记账';
              const detailLine =
                log.status === 'failed'
                  ? `${new Date(log.capturedAt).toLocaleString('zh-CN')} · 未入账`
                  : `${new Date(log.capturedAt).toLocaleString('zh-CN')} · ${relatedCategory?.name || '已创建交易'}`;

              return (
                <div key={log.id} className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setExpandedLogId((current) => (current === log.id ? null : log.id))}
                    className="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CaptureLogStatusBadge status={log.status} />
                        <span className="text-sm font-semibold text-primary break-words">{title}</span>
                      </div>
                      <p className="mt-1 text-xs text-secondary">{detailLine}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-3">
                      {typeof log.amount === 'number' && (
                        <span className="whitespace-nowrap text-sm font-semibold text-primary">¥{log.amount.toFixed(2)}</span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-4 space-y-4 border-t border-zinc-200 pt-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <LogMeta
                          label="状态"
                          value={log.status === 'success' ? '已创建交易' : log.status === 'failed' ? '未入账' : '处理中'}
                        />
                        <LogMeta label="时间" value={new Date(log.capturedAt).toLocaleString('zh-CN')} />
                        {typeof log.httpStatus === 'number' && <LogMeta label="HTTP 状态" value={String(log.httpStatus)} />}
                        {log.failureStage && <LogMeta label="失败阶段" value={log.failureStage} />}
                      </div>

                      {log.imagePath && (
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">截图</p>
                          <img
                            src={resolveImagePreview(log.imagePath)}
                            alt="截图分析日志"
                            className="max-h-[28rem] w-full rounded-2xl border border-border bg-white object-contain"
                          />
                        </div>
                      )}

                      <LogPanel title="AI 原始回复" content={log.assistantReplyRaw || '没有拿到模型回复。'} />
                      <LogPanel
                        title="解析后的结构化结果"
                        content={
                          log.assistantReplyParsed
                            ? JSON.stringify(log.assistantReplyParsed, null, 2)
                            : log.failureReason || '没有可解析的结构化结果。'
                        }
                      />
                      <LogPanel title="HTTP 原始响应" content={log.responseBodyRaw || '没有返回 HTTP 响应正文。'} />

                      {log.transactionId ? (
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
                          已创建交易 {log.transactionId}
                          {relatedTransaction && `，金额 ¥${relatedTransaction.amount.toFixed(2)}`}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
                          本次截图未入账。{log.failureReason ? `失败原因：${log.failureReason}` : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="mt-6 text-center">
        <p className="text-xs uppercase tracking-widest text-zinc-300">记账 v2.0</p>
      </div>
    </div>
  );
};

const SectionHeader = ({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) => (
  <div className="mb-4 flex items-center justify-between gap-4 px-1">
    <div className="flex items-center gap-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-secondary">{title}</h3>
      {meta && <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-zinc-500">{meta}</span>}
    </div>
    {action}
  </div>
);

const InlineBadge = ({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning';
}) => {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : tone === 'warning'
        ? 'border-amber-100 bg-amber-50 text-amber-700'
        : 'border-border bg-surface text-secondary';

  return <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${toneClass}`}>{children}</span>;
};

const PrimaryActionButton = ({
  children,
  onClick,
  disabled,
  icon: Icon,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ComponentType<any>;
  tone: 'primary' | 'dark' | 'ghost';
}) => {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary text-white hover:bg-zinc-800'
      : tone === 'dark'
        ? 'bg-zinc-900 text-white hover:bg-black'
        : 'bg-zinc-100 text-primary hover:bg-zinc-200';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 ${toneClass}`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
};

const ConfigField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-secondary">{label}</span>
    {children}
  </label>
);

const StatusCard = ({ icon: Icon, label, value }: { icon: React.ComponentType<any>; label: string; value: string }) => (
  <div className="rounded-3xl border border-border bg-surface/40 p-4">
    <div className="mb-2 flex items-center gap-2 text-secondary">
      <Icon className="w-4 h-4" />
      <span className="text-xs uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-sm font-semibold text-primary break-words">{value}</p>
  </div>
);

const CaptureLogStatusBadge = ({ status }: { status: CaptureAttemptLog['status'] }) => {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="w-3 h-3" />
        成功
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
        <CircleAlert className="w-3 h-3" />
        失败
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
      <Clock3 className="w-3 h-3" />
      处理中
    </span>
  );
};

const LogMeta = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-border bg-white p-4">
    <p className="text-xs font-semibold text-secondary uppercase tracking-wider">{label}</p>
    <p className="text-sm text-primary mt-2 break-words">{value}</p>
  </div>
);

const LogPanel = ({ title, content }: { title: string; content: string }) => (
  <div>
    <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2">{title}</p>
    <pre className="rounded-2xl border border-border bg-white p-4 text-xs text-primary whitespace-pre-wrap break-all overflow-x-auto">
      {content}
    </pre>
  </div>
);

export default Settings;
