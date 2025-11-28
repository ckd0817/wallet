// 自动图标生成脚本
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 高质量SVG图标
const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- 背景 -->
  <rect width="512" height="512" rx="120" fill="#09090b"/>

  <!-- 钱包主体 -->
  <path d="M128 160C128 142.327 142.327 128 160 128H352C369.673 128 384 142.327 384 160V192H128V160Z" fill="white" fill-opacity="0.95"/>
  <path d="M128 192H384V352C384 369.673 369.673 384 352 384H160C142.327 384 128 369.673 128 352V192Z" fill="white" fill-opacity="0.9"/>

  <!-- 钱包细节线条 -->
  <rect x="148" y="160" width="216" height="8" rx="4" fill="#09090b" fill-opacity="0.2"/>
  <rect x="148" y="176" width="180" height="6" rx="3" fill="#09090b" fill-opacity="0.15"/>

  <!-- 智能标记圆圈 -->
  <circle cx="320" cy="280" r="36" fill="#10b981" fill-opacity="0.95"/>

  <!-- 对勾符号 -->
  <path d="M305 280L315 290L335 270" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- 装饰点 -->
  <circle cx="160" cy="360" r="4" fill="#10b981" fill-opacity="0.6"/>
  <circle cx="180" cy="360" r="4" fill="#10b981" fill-opacity="0.6"/>
  <circle cx="200" cy="360" r="4" fill="#10b981" fill-opacity="0.6"/>

  <!-- 高光效果 -->
  <ellipse cx="256" cy="100" rx="120" ry="40" fill="white" fill-opacity="0.1"/>
</svg>`;

// 需要生成的图标尺寸
const iconSizes = [
  16, 32, 72, 76, 96, 114, 120, 128, 144, 152, 192, 384, 512
];

// 创建SVG文件
function createSVGFile() {
  const svgPath = path.join(__dirname, 'icon.svg');
  fs.writeFileSync(svgPath, svgContent);
  console.log('✅ SVG文件已创建:', svgPath);
}

// 使用Canvas API生成PNG图标的HTML脚本
function createIconGeneratorHTML() {
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Auto Icon Generator</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; padding: 20px; background: #f5f5f5;
        }
        .container {
            max-width: 800px; margin: 0 auto; background: white;
            padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header { text-align: center; margin-bottom: 30px; }
        .progress {
            width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px;
            overflow: hidden; margin: 20px 0;
        }
        .progress-bar {
            height: 100%; background: linear-gradient(90deg, #10b981, #09090b);
            width: 0%; transition: width 0.3s ease;
        }
        .icon-grid {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 20px; margin-top: 30px;
        }
        .icon-item {
            text-align: center; padding: 15px; border: 2px solid #e0e0e0;
            border-radius: 8px; background: #fafafa;
        }
        .icon-item canvas {
            border: 1px solid #ddd; border-radius: 4px;
            background: white; margin-bottom: 8px;
        }
        .status {
            padding: 10px; border-radius: 6px; margin: 10px 0;
            font-weight: 500;
        }
        .status.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status.info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        .btn {
            background: #09090b; color: white; border: none; padding: 12px 24px;
            border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 500;
            margin: 10px 5px; transition: background 0.2s;
        }
        .btn:hover { background: #333; }
        .btn:disabled { background: #ccc; cursor: not-allowed; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎨 SmartWallet 图标自动生成器</h1>
            <p>正在为你生成所有尺寸的PNG图标...</p>
        </div>

        <div class="progress">
            <div class="progress-bar" id="progressBar"></div>
        </div>

        <div id="status" class="status info">
            准备开始生成图标...
        </div>

        <div style="text-align: center; margin: 20px 0;">
            <button id="downloadAll" class="btn hidden" onclick="downloadAllIcons()">
                📦 下载所有图标
            </button>
            <button id="generateBtn" class="btn" onclick="startGeneration()" disabled>
                开始生成图标
            </button>
        </div>

        <div id="iconGrid" class="icon-grid hidden"></div>
    </div>

    <script>
        const svgContent = \`${svgContent.replace(/`/g, '\\`')}\`;
        const iconSizes = ${JSON.stringify(iconSizes)};
        const generatedIcons = [];
        let currentIndex = 0;

        // 页面加载完成后自动开始
        window.addEventListener('load', () => {
            setTimeout(startGeneration, 1000);
        });

        function updateStatus(message, type = 'info') {
            const statusEl = document.getElementById('status');
            statusEl.textContent = message;
            statusEl.className = \`status \${type}\`;
        }

        function updateProgress(percentage) {
            document.getElementById('progressBar').style.width = percentage + '%';
        }

        async function generateIcon(size) {
            return new Promise((resolve) => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = size;
                canvas.height = size;

                const img = new Image();
                const blob = new Blob([svgContent], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);

                img.onload = function() {
                    // 高质量渲染
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    // 添加白色背景（防止透明）
                    ctx.fillStyle = '#09090b';
                    ctx.fillRect(0, 0, size, size);

                    // 绘制图标
                    ctx.drawImage(img, 0, 0, size, size);
                    URL.revokeObjectURL(url);

                    const dataURL = canvas.toDataURL('image/png', 1.0);
                    generatedIcons.push({ size, dataURL, canvas });

                    // 添加到网格显示
                    addToGrid(size, canvas);

                    resolve();
                };

                img.onerror = function() {
                    console.error('Failed to load SVG for size:', size);
                    resolve(); // 继续处理下一个
                };

                img.src = url;
            });
        }

        function addToGrid(size, canvas) {
            const grid = document.getElementById('iconGrid');
            const item = document.createElement('div');
            item.className = 'icon-item';
            item.innerHTML =
                '<canvas width="64" height="64" id="preview-' + size + '"></canvas>' +
                '<div><strong>' + size + '×' + size + '</strong></div>';
            grid.appendChild(item);

            // 绘制预览
            const previewCanvas = document.getElementById('preview-' + size);
            const previewCtx = previewCanvas.getContext('2d');
            previewCtx.drawImage(canvas, 0, 0, 64, 64);
        }

        async function startGeneration() {
            const btn = document.getElementById('generateBtn');
            const downloadBtn = document.getElementById('downloadAll');
            const grid = document.getElementById('iconGrid');

            btn.disabled = true;
            btn.textContent = '生成中...';
            grid.classList.remove('hidden');

            updateStatus('正在生成图标...', 'info');

            for (let i = 0; i < iconSizes.length; i++) {
                currentIndex = i;
                const size = iconSizes[i];

                updateStatus('正在生成 ' + size + '×' + size + ' 图标 (' + (i + 1) + '/' + iconSizes.length + ')...', 'info');
                updateProgress(((i + 1) / iconSizes.length) * 100);

                await generateIcon(size);

                // 添加小延迟避免界面卡顿
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            updateStatus('✅ 成功生成 ' + iconSizes.length + ' 个图标！点击下方按钮下载所有文件。', 'success');
            btn.textContent = '生成完成';
            downloadBtn.classList.remove('hidden');

            // 自动触发下载（可选）
            setTimeout(() => {
                if (confirm('图标生成完成！是否立即下载所有图标文件？')) {
                    downloadAllIcons();
                }
            }, 1000);
        }

        function downloadAllIcons() {
            generatedIcons.forEach(({ size, dataURL }) => {
                const link = document.createElement('a');
                link.download = 'icon-' + size + 'x' + size + '.png';
                link.href = dataURL;
                link.click();
            });

            updateStatus('🎉 所有图标已下载！请将它们放到 public/icons/ 文件夹中。', 'success');
        }

        // 自动下载功能（可选）
        function autoDownloadAll() {
            setTimeout(() => {
                downloadAllIcons();
            }, 2000);
        }
    </script>
</body>
</html>`;

  const htmlPath = path.join(__dirname, 'auto-icon-generator.html');
  fs.writeFileSync(htmlPath, htmlContent);
  console.log('✅ 自动图标生成器已创建:', htmlPath);

  return htmlPath;
}

// 主函数
async function main() {
  console.log('🚀 开始创建自动图标生成器...');

  try {
    // 1. 创建SVG文件
    createSVGFile();

    // 2. 创建HTML生成器
    const htmlPath = createIconGeneratorHTML();

    console.log('\\n📋 使用说明:');
    console.log('1. 在浏览器中打开:', htmlPath);
    console.log('2. 页面会自动开始生成所有图标');
    console.log('3. 生成完成后自动下载所有PNG文件');
    console.log('4. 将下载的图标文件放入 public/icons/ 目录');
    console.log('\\n🎯 包含的尺寸:', iconSizes.map(s => s + 'x' + s).join(', '));
    console.log('\\n⚡ 提示: 页面加载后会自动开始生成，无需手动操作！');

  } catch (error) {
    console.error('❌ 创建失败:', error.message);
  }
}

// 运行脚本
main();