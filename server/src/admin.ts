import { createPool,migration,transaction } from './db.js';
import argon2 from 'argon2';
import { vault } from './crypto.js';
const pool=createPool(process.env.DATABASE_URL!);
try {
  const command=process.argv[2];
  if(command==='migrate') {
    await pool.query(migration);
    console.log('数据库结构已更新');
  } else if(command==='reset-password') {
    const username=process.argv[3]?.toLowerCase(), password=process.env.WALLET_NEW_PASSWORD;
    if(!username || !password || password.length<8) throw new Error('需要用户名和 WALLET_NEW_PASSWORD（至少 8 位）');
    const result=await pool.query('UPDATE users SET password_hash=$2 WHERE username=$1 RETURNING id',
      [username,await argon2.hash(password,{type:argon2.argon2id})]);
    if(!result.rowCount) throw new Error('账户不存在');
    await pool.query('DELETE FROM sessions WHERE user_id=$1',[result.rows[0].id]);
    console.log('密码已重置，所有会话已退出');
  } else if(command==='export-recovery') {
    const username=process.argv[3]?.toLowerCase(),backupId=process.argv[4];
    const user=(await pool.query('SELECT id FROM users WHERE username=$1',[username])).rows[0];
    if(!user) throw new Error('账户不存在');
    const data=await transaction(pool,user.id,async db=>(await db.query(
      'SELECT encrypted_data FROM recovery_backups WHERE user_id=$1 AND id=$2',[user.id,backupId])).rows[0]);
    if(!data) throw new Error('备份不存在');
    process.stdout.write(JSON.stringify(vault(process.env.WALLET_MASTER_KEY!).open(data.encrypted_data)));
  } else throw new Error('命令: migrate / reset-password 用户名 / export-recovery 用户名 备份编号');
} finally { await pool.end(); }
