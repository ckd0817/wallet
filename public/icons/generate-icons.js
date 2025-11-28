// 这个脚本需要使用图标生成工具
// 由于在Node.js环境中无法直接生成PNG，提供SVG作为基础

const fs = require('fs');
const path = require('path');

// SVG内容（简化版本）
const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="120" fill="#09090b"/>
  <path d="M128 160C128 142.3 142.3 128 160 128H352C369.7 128 384 142.3 384 160V192H128V160Z" fill="white" opacity="0.9"/>
  <path d="M128 192H384V352C384 369.7 369.7 384 352 384H160C142.3 384 128 369.7 128 352V192Z" fill="white" opacity="0.8"/>
  <circle cx="320" cy="280" r="32" fill="#10b981"/>
  <path d="M308 280L316 288L332 272" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// 创建HTML文件用于手动生成图标
const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <title>SmartWallet Icon Generator</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .icon-container { margin: 20px 0; }
        canvas { border: 1px solid #ccc; margin: 10px; }
        .download-btn { background: #09090b; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
        .download-btn:hover { background: #333; }
    </style>
</head>
<body>
    <h1>SmartWallet Icon Generator</h1>
    <p>点击下面的按钮下载不同尺寸的图标：</p>

    <div id="icon-container"></div>

    <script>
        const svgContent = \`${svgContent.replace(/`/g, '\\`')}\`;
        const iconSizes = [16, 32, 72, 76, 96, 114, 120, 128, 144, 152, 192, 384, 512];

        function createIcon(size) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = size;
            canvas.height = size;

            const img = new Image();
            const blob = new Blob([svgContent], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);

            img.onload = function() {
                ctx.drawImage(img, 0, 0, size, size);
                URL.revokeObjectURL(url);

                const container = document.getElementById('icon-container');
                const div = document.createElement('div');
                div.className = 'icon-container';
                div.innerHTML = \`
                    <h3>\${size}x\${size}px</h3>
                    <canvas id="canvas-\${size}" width="\${size}" height="\${size}"></canvas>
                    <button class="download-btn" onclick="downloadIcon(\${size})">下载 icon-\${size}x\${size}.png</button>
                \`;
                container.appendChild(div);

                const downloadCanvas = document.getElementById(\`canvas-\${size}\`);
                const downloadCtx = downloadCanvas.getContext('2d');
                downloadCtx.drawImage(img, 0, 0, size, size);
            };

            img.src = url;
        }

        function downloadIcon(size) {
            const canvas = document.getElementById(\`canvas-\${size}\`);
            const link = document.createElement('a');
            link.download = \`icon-\${size}x\${size}.png\`;
            link.href = canvas.toDataURL();
            link.click();
        }

        // 生成所有尺寸的图标
        iconSizes.forEach(size => {
            setTimeout(() => createIcon(size), iconSizes.indexOf(size) * 100);
        });
    </script>
</body>
</html>`;

// 写入HTML文件
fs.writeFileSync(path.join(__dirname, 'icon-generator.html'), htmlContent);

console.log('图标生成器已创建: public/icons/icon-generator.html');
console.log('请在浏览器中打开此文件来生成和下载不同尺寸的PNG图标');
console.log('需要的尺寸: 16x16, 32x32, 72x72, 76x76, 96x96, 114x114, 120x120, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512');