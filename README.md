# SmartWallet - 智能记账

<div align="center">
  <h2>📱 个人财务管理应用</h2>
  <p>支持收支记录、数据统计和AI智能理财建议的现代化记账应用</p>
</div>

## ✨ 功能特性

- 💰 **收支管理** - 简单快速的收支记录
- 📊 **数据统计** - 可视化财务数据分析
- 🤖 **AI智能顾问** - 基于交易记录的个性化理财建议
- 🔄 **自动记账** - 支持周期性交易自动记录
- 📱 **PWA支持** - 可安装为原生应用，支持离线使用
- 🎨 **现代设计** - 简洁优雅的用户界面

## 🚀 快速开始

### 环境要求

- Node.js 16+
- npm 或 yarn

### 安装和运行

```bash
# 克隆仓库
git clone https://github.com/yourusername/wallet.git
cd wallet

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

应用将在 `http://localhost:3000` 启动

### 构建生产版本

```bash
# 构建应用
npm run build

# 预览生产版本
npm run preview
```

## 📱 PWA 安装

### 自动安装
访问应用后，浏览器会自动显示安装提示，点击"安装"即可将应用添加到主屏幕。

### 手动安装
1. 在浏览器中打开应用
2. 点击浏览器菜单 (⋮)
3. 选择"添加到主屏幕"或"安装应用"

## 🤖 AI 功能配置

### 使用默认 Gemini API
创建 `.env.local` 文件并添加：
```
GEMINI_API_KEY=your_gemini_api_key
```

### 配置自定义 AI
在应用的设置页面中配置 OpenAI 兼容的 API：

- **API 地址**: 你的 AI 服务端点
- **API 密钥**: 认证密钥
- **模型名称**: 要使用的模型

## 🎨 图标生成

项目包含自动图标生成工具：

```bash
cd public/icons
node auto-generate-icons.js
```

然后在浏览器中打开 `auto-icon-generator.html` 即可自动生成所有尺寸的应用图标。

## 📁 项目结构

```
wallet/
├── public/                 # 静态资源
│   ├── manifest.json      # PWA 配置
│   ├── sw.js             # Service Worker
│   └── icons/            # 应用图标
├── components/            # React 组件
│   ├── Dashboard.tsx     # 仪表盘
│   ├── Stats.tsx         # 统计页面
│   ├── Advisor.tsx       # AI 顾问
│   └── Settings.tsx      # 设置页面
├── services/             # 业务逻辑
│   └── geminiService.ts  # AI 服务
├── App.tsx              # 主应用组件
├── types.ts             # TypeScript 类型定义
└── constants.ts         # 常量配置
```

## 🛠️ 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite
- **样式**: Tailwind CSS
- **图标**: Lucide React
- **图表**: Recharts
- **PWA**: Service Worker + Web App Manifest
- **AI**: Google Gemini API / OpenAI 兼容 API

## 📦 部署

### GitHub Pages
```bash
# 构建应用
npm run build

# 部署到 gh-pages 分支
npm run deploy
```

### 其他平台
应用支持部署到任何支持静态文件的托管平台：
- Netlify
- Vercel
- Cloudflare Pages
- Firebase Hosting

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🔗 相关链接

- [在线演示](https://yourusername.github.io/wallet)
- [PWA Builder](https://pwabuilder.com)
- [React](https://reactjs.org)
- [Vite](https://vitejs.dev)

---

<div align="center">
  <p>Made with ❤️ by SmartWallet Team</p>
</div>