import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { registerAppUpdates } from '../src/appUpdates.js';

test('更新接口公开提供版本和安装包，拒绝无效或未完成的发布', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wallet-updates-'));
  const app = Fastify();
  registerAppUpdates(app, directory);
  try {
    assert.deepEqual((await app.inject('/api/v1/app-updates/android')).json(), { release: null });
    const apk = Buffer.from('测试安装包');
    const release = { versionCode: 4, versionName: '2.2-debug', size: apk.length,
      sha256: createHash('sha256').update(apk).digest('hex'), publishedAt: new Date().toISOString() };
    await writeFile(join(directory, '4.apk'), apk);
    await writeFile(join(directory, 'latest.json'), JSON.stringify(release));
    assert.deepEqual((await app.inject('/api/v1/app-updates/android')).json(), { release });
    const download = await app.inject('/api/v1/app-updates/android/4.apk');
    assert.equal(download.statusCode, 200);
    assert.deepEqual(download.rawPayload, apk);
    assert.equal(download.headers['content-type'], 'application/vnd.android.package-archive');
    assert.equal((await app.inject('/api/v1/app-updates/android/abc.apk')).statusCode, 404);
    assert.equal((await app.inject('/api/v1/app-updates/android/5.apk')).statusCode, 404);
    await writeFile(join(directory, '4.apk'), '未完成');
    assert.equal((await app.inject('/api/v1/app-updates/android')).statusCode, 503);
    await writeFile(join(directory, 'latest.json'), JSON.stringify({ ...release, versionCode: '../private' }));
    assert.equal((await app.inject('/api/v1/app-updates/android')).statusCode, 503);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});
