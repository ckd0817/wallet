#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
if [ "$#" != 3 ]; then echo '用法：publish-update.sh 安装包 版本号 版本名' >&2; exit 1; fi
export PATH="/opt/node24/bin:$PATH"
node --input-type=module - "$1" "$2" "$3" <<'NODE'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const [source, codeText, versionName] = process.argv.slice(2);
const versionCode = Number(codeText);
if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000 || !versionName || versionName.length > 80) throw new Error('版本信息无效');
const directory = '/var/lib/wallet/releases';
await mkdir(directory, { recursive: true, mode: 0o755 });
let previous = null;
try { previous = JSON.parse(await readFile(`${directory}/latest.json`, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous && versionCode <= previous.versionCode) throw new Error('新版本号必须递增');
const content = await readFile(source);
if (content.length === 0 || content.length > 200 * 1024 * 1024) throw new Error('安装包大小无效');
const release = { versionCode, versionName, size: content.length,
  sha256: createHash('sha256').update(content).digest('hex'), publishedAt: new Date().toISOString() };
await writeFile(`${directory}/${versionCode}.apk.tmp`, content, { mode: 0o644 });
await rename(`${directory}/${versionCode}.apk.tmp`, `${directory}/${versionCode}.apk`);
await writeFile(`${directory}/latest.json.tmp`, JSON.stringify(release) + '\n', { mode: 0o644 });
await rename(`${directory}/latest.json.tmp`, `${directory}/latest.json`);
console.log(JSON.stringify(release));
NODE
