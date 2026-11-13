<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SmartWallet

记账与资产管理应用。前端为 React + Vite，通过 Capacitor 打包成 Android App，自带一套 Node.js + PostgreSQL 云端服务做多设备同步、行情汇率和应用内更新。数据以本地 SQLite 为准，云端保存加密副本。

> 内部使用项目，仅构建和分发 Debug APK，沿用本机固定 Debug 签名，应用 ID `com.smartwallet.app`。

## 功能

- **记账** — 计算器键盘录入金额，自定义分类，支持周期性收支（定投/定期账单）。
- **资产管理** — 股票、基金持仓的加减仓与定投，成交价按金额/份额/成交价三栏联动自动算出；行情按周更新，展示市值、持有收益、收益率，并换算美元持仓到人民币。
- **数据统计** — 收支概览、分类占比、趋势图表。
- **AI 分析** — 基于消费数据生成财务健康评估和理财建议，含财富自由测算。
- **截图自动入账**（Android） — 无障碍截图后由模型一次识别并判断截图类型：支付/账单页自动生成记账记录，持仓页自动对比现有持仓判定建仓/加仓/减仓/改成本并写入交易。可从通知栏直接触发，无需回到 App。
- **多设备同步** — 账本操作先落本地 SQLite 事务，再增量推送到云端；云端保存整体加密副本，支持恢复与设备间拉取。
- **应用内更新** — 启动时检查服务器版本，设置页可手动检查；下载后校验大小与 SHA-256 再交系统安装。

## 技术栈

**前端/App**：React 19 · Vite 6 · TypeScript 5.8 · Capacitor 7 (Android) · Recharts · Lucide · Vitest

**云端**：Node.js 24 · Fastify · PostgreSQL 16 · Nginx (HTTPS)

**AI**：兼容 OpenAI `chat/completions` 的多模态模型（支持图片输入），接口与密钥在应用设置内配置。

## 目录结构

```
App.tsx, index.tsx       应用入口与主框架（底部四个页签）
components/               各页面与交互组件（记账、资产、统计、设置、云账户、更新等）
services/                纯逻辑层，带单元测试
  assetEngine.ts           持仓/行情/成交价/截图 diff 计算
  analysisEngine.ts        财务分析快照
  wealthFreedom.ts         财富自由测算
  walletStore.ts           本地快照读写与归一化
  cloudSync.ts             云端同步插件桥接
  appUpdate.ts             应用内更新
types.ts                 全部数据模型（Transaction / AssetHolding / WalletSnapshot 等）
android/                 Capacitor Android 工程（原生记账、截图识别、同步、无障碍恢复）
server/                  云端服务（同步、鉴权、行情汇率、更新分发）
docs/                    运维与接入文档
scripts/                 发布与数据导出脚本
```

Android 原生代码按职责分包：`screencapture`（截图识别与通知）、`assets`（持仓识别与变更应用）、`data`（本地仓库与数据库）、`accessibility`（无障碍采集与自动恢复）。

## 本地开发

需要 Node.js。

```bash
npm install
npm run dev          # 启动 Web 开发服务器
npm test             # 运行 Vitest 单元测试
npm run build        # 构建 Web 产物到 dist/
```

## Android 构建

本机需设置 `JAVA_HOME` 指向 JDK 21。

```bash
npm run android:sync   # 构建 Web 并同步到 Android 工程
npm run android:open   # 在 Android Studio 打开
npm run android:run    # 构建并安装到已连接的设备
```

最低 SDK 30，目标/编译 SDK 35。

## 应用更新分发

始终发布 Debug APK 并沿用本机固定 Debug 签名。发布前递增 `android/app/build.gradle` 的 `versionCode` 并更新 `versionName`，然后在项目根目录执行：

```powershell
.\scripts\publish-android-update.ps1
```

脚本执行 `assembleDebug`，校验包名、可调试状态与固定签名，通过 SSH 原子发布到服务器。安装包与版本清单保存在仓库外 `/var/lib/wallet/releases`。完整的构建、发布、校验、首次接入和故障处理见 [docs/Android更新分发.md](docs/Android更新分发.md)。

## 云端服务

部署、协议、备份还原、密钥与排查步骤见 [server/README.md](server/README.md)。相关文档：

- [docs/云端同步与调试.md](docs/云端同步与调试.md) — 同步机制与 Debug 调试
- [docs/无障碍自动恢复.md](docs/无障碍自动恢复.md) — 无障碍服务绑定的自动恢复

## 数据与安全

- 账本改动与待上传操作在同一 SQLite 事务提交；Android 数据库为 `wallet-v2.db`。
- 云端对账本记录和模型配置整体加密，启用强制行级安全（RLS），服务角色无超级用户或 BYPASSRLS 权限。
- 数据库凭据、模型密钥、登录密码、服务器主密钥和用户数据副本均不提交到仓库。
- 手机端可导出 JSON 作为服务器外的账本副本。
