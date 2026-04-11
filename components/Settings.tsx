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
  onCaptureNow: () => Promise<void> | void;
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
  onCaptureNow,
  onTestModelConfig,
  onRefreshAutoBookkeepingStatus,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'append' | 'overwrite'>('append');
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [modelTestResult, setModelTestResult] = useState<LLMConfigTestResult | null>(null);

  const isAndroidNative = Capacitor.getPlatform() === 'android';
  const llmConfigured = Boolean(llmConfig.apiKey && llmConfig.baseUrl && llmConfig.modelName);
  const llmReady = Boolean(llmConfig.enabled && llmConfigured);
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

  const handleCaptureNow = async () => {
    setIsCapturing(true);
    try {
      await onCaptureNow();
      if (isAndroidNative) {
        alert('已请求截图，请在支付结果页等待识别完成。');
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleTestModel = async () => {
    setIsTestingModel(true);
    setModelTestResult(null);
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
    <div className="flex flex-col h-full space-y-10 animate-slide-up pb-32">
      <section>
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-sm font-bold text-secondary uppercase tracking-wider">截图自动记账</h3>
          <button
            onClick={handleRefreshStatus}
            disabled={isRefreshingStatus || !isAndroidNative}
            className="text-xs text-secondary inline-flex items-center gap-2 hover:text-primary transition-colors"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
            刷新状态
          </button>
        </div>

        <div className="bg-white border border-border rounded-xl overflow-hidden p-5 space-y-5">
          <div>
            <p className="text-lg font-semibold text-primary">支付页截图入账</p>
            <p className="text-sm text-secondary mt-1">
              先开启一次截图会话，再在付款结果页点通知触发截图分析。截图成功后会话会继续保持开启，可连续自动记账。
            </p>
          </div>

          {!isAndroidNative && (
            <div className="rounded-2xl bg-zinc-50 text-secondary text-sm p-4 border border-border">
              截图自动记账依赖 Android 原生截图会话和前台服务，当前环境仅展示配置结构。
            </div>
          )}

          {!llmReady && (
            <div className="rounded-2xl bg-amber-50 text-amber-800 text-sm p-4 border border-amber-100">
              需要先填写并启用支持图片输入的模型配置，否则截图后无法完成自动识别。
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {statusCards.map(({ icon: Icon, label, value }) => (
              <StatusCard key={label} icon={Icon} label={label} value={value} />
            ))}
          </div>

          {autoBookkeepingSettings.lastError && (
            <div className="rounded-2xl bg-amber-50 text-amber-800 text-sm p-4 border border-amber-100">
              最近一次错误：{autoBookkeepingSettings.lastError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              onClick={handleStartSession}
              disabled={isStartingSession || !isAndroidNative}
              className="bg-primary text-white py-3 rounded-2xl font-semibold inline-flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {isStartingSession ? '开启中...' : autoBookkeepingSettings.sessionActive ? '重开会话' : '开启截图模式'}
            </button>
            <button
              onClick={handleCaptureNow}
              disabled={isCapturing || !isAndroidNative || !autoBookkeepingSettings.sessionActive || !llmReady}
              className="bg-zinc-900 text-white py-3 rounded-2xl font-semibold inline-flex items-center justify-center gap-2 disabled:bg-zinc-200 disabled:text-zinc-400"
            >
              <Camera className="w-4 h-4" />
              {isCapturing ? '截图中...' : '立即截图记账'}
            </button>
            <button
              onClick={handleStopSession}
              disabled={isStoppingSession || !isAndroidNative || !autoBookkeepingSettings.sessionActive}
              className="bg-zinc-100 text-primary py-3 rounded-2xl font-semibold inline-flex items-center justify-center gap-2 disabled:text-zinc-400"
            >
              <Square className="w-4 h-4" />
              {isStoppingSession ? '停止中...' : '停止会话'}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 px-1">截图分析日志</h3>
        <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
          {captureLogs.length === 0 ? (
            <div className="p-6 text-center text-base text-zinc-400">还没有截图分析日志</div>
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
                <div key={log.id} className="p-5">
                  <button
                    type="button"
                    onClick={() => setExpandedLogId((current) => (current === log.id ? null : log.id))}
                    className="w-full flex items-start justify-between gap-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CaptureLogStatusBadge status={log.status} />
                        <span className="text-base font-medium text-primary break-words">{title}</span>
                      </div>
                      <p className="text-xs text-secondary mt-1">{detailLine}</p>
                      {(log.summary || log.responseBodyRaw || log.assistantReplyRaw) && (
                        <p className="text-xs text-zinc-400 mt-2 line-clamp-2">
                          {log.summary || log.assistantReplyRaw || log.responseBodyRaw}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {typeof log.amount === 'number' && (
                        <span className="font-semibold text-primary whitespace-nowrap">¥{log.amount.toFixed(2)}</span>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <LogMeta label="状态" value={log.status === 'success' ? '已创建交易' : log.status === 'failed' ? '未入账' : '处理中'} />
                        <LogMeta label="时间" value={new Date(log.capturedAt).toLocaleString('zh-CN')} />
                        {typeof log.httpStatus === 'number' && <LogMeta label="HTTP 状态" value={String(log.httpStatus)} />}
                        {log.failureStage && <LogMeta label="失败阶段" value={log.failureStage} />}
                      </div>

                      {log.imagePath && (
                        <div>
                          <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2">截图</p>
                          <img
                            src={resolveImagePreview(log.imagePath)}
                            alt="截图分析日志"
                            className="w-full rounded-2xl border border-border bg-surface object-contain max-h-[28rem]"
                          />
                        </div>
                      )}

                      <LogPanel
                        title="AI 原始回复"
                        content={log.assistantReplyRaw || '没有拿到模型回复。'}
                      />

                      <LogPanel
                        title="解析后的结构化结果"
                        content={
                          log.assistantReplyParsed
                            ? JSON.stringify(log.assistantReplyParsed, null, 2)
                            : log.failureReason || '没有可解析的结构化结果。'
                        }
                      />

                      <LogPanel
                        title="HTTP 原始响应"
                        content={log.responseBodyRaw || '没有返回 HTTP 响应正文。'}
                      />

                      {log.transactionId ? (
                        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800">
                          已创建交易 {log.transactionId}
                          {relatedTransaction && `，金额 ¥${relatedTransaction.amount.toFixed(2)}`}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800">
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

      <section>
        <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 px-1">截图模型配置</h3>
        <div className="bg-white border border-border rounded-xl overflow-hidden p-5 space-y-4">
          <div>
            <label className="text-xs text-secondary block mb-1.5">Api Key</label>
            <input
              type="password"
              value={llmConfig.apiKey}
              onChange={(event) => onUpdateLLMConfig({ ...llmConfig, apiKey: event.target.value })}
              placeholder="sk-..."
              className="w-full text-sm bg-surface border border-border rounded-lg p-2"
            />
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1.5">Base URL</label>
            <input
              type="text"
              value={llmConfig.baseUrl}
              onChange={(event) => onUpdateLLMConfig({ ...llmConfig, baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full text-sm bg-surface border border-border rounded-lg p-2"
            />
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1.5">Model Name</label>
            <input
              type="text"
              value={llmConfig.modelName}
              onChange={(event) => onUpdateLLMConfig({ ...llmConfig, modelName: event.target.value })}
              placeholder="填写支持图片输入的模型"
              className="w-full text-sm bg-surface border border-border rounded-lg p-2"
            />
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1.5">Timeout (ms)</label>
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
              className="w-full text-sm bg-surface border border-border rounded-lg p-2"
            />
            <p className="text-xs text-zinc-400 mt-1">原生截图分析和模型测试都会使用这个超时时间。</p>
          </div>
          <div>
            <label className="text-xs text-secondary block mb-1.5">截图分析提示词</label>
            <textarea
              value={llmConfig.capturePrompt}
              onChange={(event) => onUpdateLLMConfig({ ...llmConfig, capturePrompt: event.target.value })}
              rows={8}
              className="w-full text-sm bg-surface border border-border rounded-lg p-3 leading-6"
            />
            <p className="text-xs text-zinc-400 mt-1">
              建议保留 <code className="font-mono text-[11px]">{'{{expense_categories}}'}</code> 和{' '}
              <code className="font-mono text-[11px]">{'{{income_categories}}'}</code>、{' '}
              <code className="font-mono text-[11px]">{'{{today_date}}'}</code>，运行时会自动替换成当前分类列表和今天日期。
            </p>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onUpdateLLMConfig({ ...llmConfig, capturePrompt: DEFAULT_CAPTURE_PROMPT })}
                disabled={llmConfig.capturePrompt === DEFAULT_CAPTURE_PROMPT}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-4 py-2 text-sm font-medium text-primary transition-colors disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                恢复默认提示词
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="enableLLM"
              checked={llmConfig.enabled}
              onChange={(event) => onUpdateLLMConfig({ ...llmConfig, enabled: event.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label htmlFor="enableLLM" className="text-sm font-medium text-primary cursor-pointer select-none">
              启用截图自动记账模型
            </label>
          </div>

          <div className="rounded-2xl bg-surface/40 border border-border p-4 space-y-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-primary">模型连通性测试</p>
                <p className="text-xs text-secondary mt-1">
                  这一步只测试当前配置能否正常请求多模态模型，不会创建交易，也不需要先截图。
                </p>
              </div>
              <div className="sm:flex sm:justify-start">
                <button
                  onClick={handleTestModel}
                  disabled={isTestingModel || !isAndroidNative || !llmConfigured}
                  className="w-full sm:w-auto min-w-[8rem] whitespace-nowrap bg-zinc-900 text-white py-3 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:bg-zinc-200 disabled:text-zinc-400"
                >
                  <Bot className="w-4 h-4" />
                  {isTestingModel ? '测试中...' : '测试模型'}
                </button>
              </div>
            </div>

            {!llmConfigured && (
              <p className="text-xs text-amber-700">请先填好 Api Key、Base URL 和 Model Name，再测试。</p>
            )}

            {modelTestResult && (
              <div className="space-y-3 pt-2">
                <div
                  className={`rounded-2xl border p-4 text-sm ${
                    modelTestResult.ok
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                      : 'bg-amber-50 border-amber-100 text-amber-800'
                  }`}
                >
                  {modelTestResult.message}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <LogMeta label="测试结果" value={modelTestResult.ok ? '成功' : '失败'} />
                  <LogMeta label="耗时" value={`${modelTestResult.elapsedMs} ms`} />
                  <LogMeta label="HTTP 状态" value={String(modelTestResult.httpStatus || 0)} />
                  <LogMeta label="失败阶段" value={modelTestResult.failureStage || '无'} />
                  <LogMeta label="模型" value={modelTestResult.modelName || '未返回'} />
                  <LogMeta label="Endpoint" value={modelTestResult.endpoint || '未返回'} />
                </div>

                <LogPanel
                  title="模型原始回复"
                  content={modelTestResult.assistantReplyRaw || '没有拿到模型回复。'}
                />

                <LogPanel
                  title="HTTP 原始响应"
                  content={modelTestResult.responseBodyRaw || '没有返回 HTTP 响应正文。'}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 px-1">周期性记账规则</h3>
        <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
          {recurringProfiles.length === 0 ? (
            <div className="p-6 text-center text-base text-zinc-400">暂无生效的自动记账规则</div>
          ) : (
            recurringProfiles.map((profile) => {
              const category = categories.find((item) => item.id === profile.categoryId);
              return (
                <div key={profile.id} className="p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary"></div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base font-medium">{category?.name}</span>
                      <span className="text-xs text-secondary uppercase">
                        {profile.frequency === 'daily' && '每天'}
                        {profile.frequency === 'weekly' && '每周'}
                        {profile.frequency === 'monthly' && '每月'}
                        {profile.frequency === 'yearly' && '每年'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-base">¥{profile.amount}</span>
                    <button onClick={() => onDeleteRecurring(profile.id)} className="text-zinc-300 hover:text-danger">
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
        <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4 px-1">数据管理</h3>
        <div className="bg-white border border-border rounded-xl overflow-hidden divide-y divide-border">
          <div className="p-5 text-sm text-secondary border-b border-border">
            JSON 备份会同时保存交易、分类和周期规则。清空数据后重新导入时，自定义分类会一并恢复。
          </div>

          <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-surface transition-colors" onClick={handleExport}>
            <div className="flex items-center gap-4">
              <Download className="w-5 h-5 text-primary" />
              <span className="text-base font-medium">导出 JSON 备份</span>
            </div>
            <ChevronRight className="w-5 h-5 text-zinc-300" />
          </div>

          <div className="p-5">
            <div className="flex items-center gap-4 mb-4">
              <Upload className="w-5 h-5 text-primary" />
              <span className="text-base font-medium">导入 JSON 备份</span>
            </div>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setImportMode('append')}
                className={`flex-1 py-2 text-sm border rounded-lg ${
                  importMode === 'append' ? 'bg-primary text-white border-primary' : 'border-border text-secondary'
                }`}
              >
                追加模式
              </button>
              <button
                onClick={() => setImportMode('overwrite')}
                className={`flex-1 py-2 text-sm border rounded-lg ${
                  importMode === 'overwrite' ? 'bg-danger text-white border-danger' : 'border-border text-secondary'
                }`}
              >
                覆盖模式
              </button>
            </div>
            <input type="file" ref={fileInputRef} accept=".json,application/json" onChange={processImport} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 bg-primary text-white text-sm font-bold rounded-xl hover:bg-zinc-800 transition-colors"
            >
              选择 JSON 文件
            </button>
          </div>
        </div>
      </section>

      <div className="text-center mt-8">
        <p className="text-xs text-zinc-300 uppercase tracking-widest">记账 v2.0</p>
      </div>
    </div>
  );
};

const StatusCard = ({ icon: Icon, label, value }: { icon: React.ComponentType<any>; label: string; value: string }) => (
  <div className="border border-border rounded-2xl p-4 bg-surface/40">
    <div className="flex items-center gap-2 text-secondary mb-2">
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
  <div className="rounded-2xl border border-border bg-surface/40 p-4">
    <p className="text-xs font-semibold text-secondary uppercase tracking-wider">{label}</p>
    <p className="text-sm text-primary mt-2 break-words">{value}</p>
  </div>
);

const LogPanel = ({ title, content }: { title: string; content: string }) => (
  <div>
    <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2">{title}</p>
    <pre className="rounded-2xl border border-border bg-surface/40 p-4 text-xs text-primary whitespace-pre-wrap break-all overflow-x-auto">
      {content}
    </pre>
  </div>
);

export default Settings;
