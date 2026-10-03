import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const releaseSchema = z.object({
  versionCode: z.number().int().positive().max(2_100_000_000),
  versionName: z.string().min(1).max(80),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().positive().max(200 * 1024 * 1024),
  publishedAt: z.string().datetime(),
}).strict();

export function registerAppUpdates(app: FastifyInstance, directory = process.env.WALLET_RELEASE_DIR ?? '/var/lib/wallet/releases') {
  app.get('/api/v1/app-updates/android', async (_request, reply) => {
    try {
      const release = releaseSchema.parse(JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8')));
      const apk = await stat(join(directory, `${release.versionCode}.apk`));
      if (!apk.isFile() || apk.size !== release.size) throw new Error('安装包无效');
      return { release };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { release: null };
      return reply.code(503).send({ message: '更新暂时不可用' });
    }
  });
  app.get<{ Params: { version: string } }>('/api/v1/app-updates/android/:version.apk', async (request, reply) => {
    if (!/^[1-9]\d{0,9}$/.test(request.params.version)) return reply.code(404).send();
    const path = join(directory, `${request.params.version}.apk`);
    try {
      const apk = await stat(path);
      if (!apk.isFile()) return reply.code(404).send();
      return reply.type('application/vnd.android.package-archive')
        .header('Content-Length', apk.size)
        .header('X-Content-Type-Options', 'nosniff')
        .send(createReadStream(path));
    } catch (error) {
      return reply.code((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 503).send();
    }
  });
}
