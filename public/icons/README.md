# 应用图标说明

## 当前状态
- ✅ 已创建 SVG 源文件 (icon.svg)
- ✅ 已创建图标生成器 (icon-generator.html)
- ⚠️ 需要生成 PNG 图标文件

## 图标尺寸要求
PWA需要以下尺寸的图标：
- 16x16px - 浏览器标签页
- 32x32px - 任务栏等
- 72x72px - Windows开始菜单
- 76x76px - Windows开始菜单
- 96x96px - 桌面快捷方式
- 114x114px - iOS旧版本
- 120x120px - iOS Retina
- 128x128px - 桌面应用
- 144x144px - Windows瓷砖
- 152x152px - iOS Retina
- 192x192px - PWA图标
- 384x384px - PWA高分辨率
- 512x512px - PWA启动画面

## 生成图标方法

### 方法1: 使用在线工具
1. 访问 https://favicon.io/ 或 https://realfavicongenerator.net/
2. 上传 icon.svg 文件
3. 下载生成的图标包
4. 将PNG文件复制到此目录

### 方法2: 使用本地HTML生成器
1. 在浏览器中打开 `icon-generator.html`
2. 点击每个下载按钮获取对应尺寸的图标
3. 将下载的PNG文件保存到此目录

### 方法3: 使用命令行工具 (需要安装)
```bash
# 安装依赖
npm install -g sharp

# 运行转换脚本
node generate-icons.js
```

## 图标设计说明
- 主色调: #09090b (Zinc 950)
- 强调色: #10b981 (Emerald 500)
- 风格: 简洁现代的钱包图标，带有智能元素
- 圆角: 120px 圆角矩形背景
- 适配: 深色和浅色主题

## 注意事项
- 确保所有图标文件都命名为正确的格式
- 文件名格式: icon-{width}x{height}.png
- 测试在不同设备和浏览器上的显示效果