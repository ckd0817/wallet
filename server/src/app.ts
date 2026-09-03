import Fastify from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { transaction } from './db.js';
import { vault,token,hash } from './crypto.js';
import { pushSchema,validateBackup,HttpError } from './protocol.js';
import { Wallet } from './sync.js';

const credentials=z.object({username:z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_\-\u4e00-\u9fff]+$/).transform(v=>v.toLowerCase()),
  password:z.string().min(8).max(128)}).strict();
export function buildApp(pool:pg.Pool,masterKey:string) {
  const app=Fastify({bodyLimit:20*1024*1024,logger:false});
  const secrets=vault(masterKey);
  async function authenticate(header:string|undefined) {
    if(!header?.startsWith('Bearer ')) throw new HttpError(401,'请重新登录');
    const row=(await pool.query('SELECT s.id,s.user_id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE access_hash=$1 AND access_expires>now() AND refresh_expires>now()',
      [hash(header.slice(7))])).rows[0];
    if(!row) throw new HttpError(401,'请重新登录');
    return row as {id:string;user_id:string;username:string};
  }
  async function newSession(userId:string,username:string) {
    const accessToken=token(),refreshToken=token();
    await pool.query("INSERT INTO sessions(id,user_id,access_hash,refresh_hash,access_expires,refresh_expires) VALUES($1,$2,$3,$4,now()+interval '15 minutes',now()+interval '90 days')",
      [randomUUID(),userId,hash(accessToken),hash(refreshToken)]);
    return {user:{id:userId,username},accessToken,refreshToken};
  }
  app.addHook('onSend',async(_req,reply,payload)=>{
    reply.header('Cache-Control','no-store');
    return payload;
  });
  app.setErrorHandler((error,_req,reply)=>{
    if(error instanceof z.ZodError) return reply.code(400).send({message:'数据格式无效'});
    if(error instanceof HttpError) return reply.code(error.statusCode).send({message:error.message,details:error.details});
    if((error as any).code==='23505') return reply.code(409).send({message:'用户名已存在'});
    // 只记录错误代码，不记录请求正文、模型配置或数据库参数。
    process.stderr.write('请求失败: '+String((error as any).code ?? (error as any).name)+'\n');
    return reply.code(500).send({message:'服务暂时不可用'});
  });
  app.get('/health',async()=>{await pool.query('SELECT 1');return {ok:true,protocolVersion:1};});
  app.post('/api/v1/auth/register',async(req,reply)=>{
    const data=credentials.parse(req.body);
    const id=randomUUID(),passwordHash=await argon2.hash(data.password,{type:argon2.argon2id});
    await transaction(pool,id,async db=>{
      await db.query('INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3)',[id,data.username,passwordHash]);
      await db.query('INSERT INTO wallets(user_id) VALUES($1)',[id]);
    });
    reply.code(201);
    return newSession(id,data.username);
  });
  app.post('/api/v1/auth/login',async req=>{
    const data=credentials.parse(req.body);
    const user=(await pool.query('SELECT id,username,password_hash FROM users WHERE username=$1',[data.username])).rows[0];
    if(!user || !await argon2.verify(user.password_hash,data.password)) throw new HttpError(401,'用户名或密码错误');
    return newSession(user.id,user.username);
  });
  app.post('/api/v1/auth/refresh',async req=>{
    const data=z.object({refreshToken:z.string().min(20).max(200)}).strict().parse(req.body);
    // Refresh 令牌在有效期内稳定，刷新响应丢失后可安全重试。
    const accessToken=token();
    const row=(await pool.query("UPDATE sessions SET access_hash=$1,access_expires=now()+interval '15 minutes' WHERE refresh_hash=$2 AND refresh_expires>now() RETURNING user_id",
      [hash(accessToken),hash(data.refreshToken)])).rows[0];
    if(!row) throw new HttpError(401,'请重新登录');
    return {accessToken,refreshToken:data.refreshToken};
  });
  app.post('/api/v1/auth/logout',async req=>{
    const session=await authenticate(req.headers.authorization);
    await pool.query('DELETE FROM sessions WHERE id=$1',[session.id]);
    return {ok:true};
  });
  app.post('/api/v1/auth/password',async req=>{
    const session=await authenticate(req.headers.authorization);
    const data=z.object({currentPassword:z.string().max(128),newPassword:z.string().min(8).max(128)}).strict().parse(req.body);
    const user=(await pool.query('SELECT password_hash FROM users WHERE id=$1',[session.user_id])).rows[0];
    if(!await argon2.verify(user.password_hash,data.currentPassword)) throw new HttpError(400,'原密码错误');
    const encoded=await argon2.hash(data.newPassword,{type:argon2.argon2id});
    await transaction(pool,session.user_id,async db=>{
      await db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[session.user_id,encoded]);
      await db.query('DELETE FROM sessions WHERE user_id=$1',[session.user_id]);
    });
    return newSession(session.user_id,session.username);
  });
  app.post('/api/v1/sync/push',async req=>{
    const session=await authenticate(req.headers.authorization);
    const data=pushSchema.parse(req.body);
    return transaction(pool,session.user_id,async db=>{
      const wallet=await Wallet.load(db,session.user_id,secrets);
      wallet.assertEpoch(data.epoch);
      for(const op of data.operations) await wallet.apply(op);
      await wallet.save();
      return {epoch:wallet.epoch,revision:wallet.revision,acknowledged:data.operations.map(op=>op.id)};
    });
  });
  app.get('/api/v1/sync/pull',async req=>{
    const session=await authenticate(req.headers.authorization);
    const data=z.object({cursor:z.coerce.number().int().nonnegative().default(0),epoch:z.coerce.number().int().positive().optional()}).strict().parse(req.query);
    return transaction(pool,session.user_id,async db=>{
      const wallet=await Wallet.load(db,session.user_id,secrets);
      if(data.epoch!==undefined) wallet.assertEpoch(data.epoch);
      return wallet.pull(data.cursor);
    });
  });
  app.post('/api/v1/backup/restore',async req=>{
    const session=await authenticate(req.headers.authorization);
    const data=z.object({id:z.string().min(1).max(200),epoch:z.number().int().positive(),revision:z.number().int().nonnegative(),data:z.unknown()}).strict().parse(req.body);
    const changes=validateBackup(data.data);
    return transaction(pool,session.user_id,async db=>{
      const wallet=await Wallet.load(db,session.user_id,secrets);
      return wallet.restore(data.id,data.epoch,data.revision,changes);
    });
  });
  return app;
}
