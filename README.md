<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SmartWallet

基于 React + Capacitor 的智能记账应用，支持 Web 端本地运行和 Android 原生打包。

## 功能

- **记账** — 自定义计算器键盘输入金额，分类选择提醒，快速录入支出/收入
- **仪表盘** — 收支统计概览与可视化图表
- **AI 分析** — 基于消费数据生成洞察和理财建议
- **截图自动记账** — Android 端通过无障碍截图识别支付结果页，自动生成记账草稿

## 技术栈

React 19 · Vite · TypeScript · Capacitor (Android) · Google GenAI · Recharts · Lucide Icons

## 本地运行

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

## Android 构建

```bash
npm run android:sync   # 构建 Web 并同步到 Android 项目
npm run android:open   # 在 Android Studio 中打开
npm run android:run    # 构建并在连接的设备上运行
```

## Android 更新分发

始终使用 Debug APK 和本机固定 Debug 签名。应用启动时检查服务器版本，设置页也可手动检查更新。

发布前递增 `android/app/build.gradle` 中的版本号，在项目根目录执行：

```powershell
.\scripts\publish-android-update.ps1
```

完整的构建、发布、校验、首次接入和故障处理步骤见 [Android 更新分发](docs/Android更新分发.md)。
