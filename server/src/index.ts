import { createPool } from './db.js';
import { buildApp } from './app.js';
const pool=createPool(process.env.DATABASE_URL!);
const app=buildApp(pool,process.env.WALLET_MASTER_KEY!);
await app.listen({host:'127.0.0.1',port:Number(process.env.PORT ?? 8787)});
for(const event of ['SIGTERM','SIGINT']) process.on(event,async()=>{await app.close();await pool.end();process.exit(0);});
