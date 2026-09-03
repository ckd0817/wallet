import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { createPool,migration,transaction } from '../src/db.js';
import { buildApp } from '../src/app.js';

const url=process.env.DATABASE_URL!;
if(!url?.includes('/wallet_test')) throw new Error('测试只能使用 wallet_test 数据库');
const pool=createPool(url),master=process.env.WALLET_MASTER_KEY??randomBytes(32).toString('base64');
const app=buildApp(pool,master),users:string[]=[];
before(async()=>{await pool.query(migration);});
after(async()=>{for(const id of users)await pool.query('DELETE FROM users WHERE id=$1',[id]);await app.close();await pool.end();});
async function account() {
  const response=await app.inject({method:'POST',url:'/api/v1/auth/register',payload:{username:'test_'+randomUUID().slice(0,12),password:'test-password-1234'}});
  assert.equal(response.statusCode,201,response.body);
  const body=response.json();users.push(body.user.id);return body;
}
async function call(user:any,method:any,path:string,payload?:any) {
  return app.inject({method,url:'/api/v1'+path,payload,headers:{authorization:'Bearer '+user.accessToken}});
}
const tx=(id:string,amount=10)=>({kind:'transactions',id,value:{id,amount,type:'expense',categoryId:'food',date:'2026-09-04',note:''}});
const op=(changes:any[],mode='mutate',id=randomUUID())=>({id,mode,changes});
const push=(u:any,operations:any[],epoch=1)=>call(u,'POST','/sync/push',{deviceId:'test-device',epoch,operations});

test('独立账户、RLS、非法用户参数与密钥加密',async()=>{
  const a=await account(),b=await account();
  assert.equal((await push(a,[op([tx('a')])])).statusCode,200);
  const response=await call(b,'GET','/sync/pull?cursor=0');
  assert.equal(response.statusCode,200);assert.equal(response.json().changes.length,0);
  const rows=await pool.query('SELECT * FROM records WHERE user_id=$1',[a.user.id]);assert.equal(rows.rowCount,0);
  assert.equal((await app.inject({method:'GET',url:'/api/v1/sync/pull'})).statusCode,401);
  assert.equal((await call(a,'POST','/sync/push',{userId:b.user.id,deviceId:'x',epoch:1,operations:[]})).statusCode,400);
  const config={apiKey:'sensitive-key',baseUrl:'https://example.com',modelName:'test',timeoutMs:30000,capturePrompt:'prompt'};
  assert.equal((await push(a,[op([{kind:'llmConfig',id:'singleton',value:config}])])).statusCode,200);
  await transaction(pool,a.user.id,async db=>{
    const stored=(await db.query("SELECT value FROM records WHERE kind='llmConfig' AND user_id=$1",[a.user.id])).rows[0].value;
    assert.ok(stored.encrypted);assert.ok(!JSON.stringify(stored).includes('sensitive-key'));
  });
});
test('重试幂等、不同记录合并、最后提交覆盖、删除标记',async()=>{
  const u=await account(),operation=op([tx('one',10)]);
  const first=await push(u,[operation]);assert.equal(first.statusCode,200);
  const repeat=await push(u,[operation]);assert.equal(repeat.json().revision,first.json().revision);
  await push(u,[op([tx('two',20)])]);await push(u,[op([tx('one',30)])]);
  const changes=(await call(u,'GET','/sync/pull?cursor=0')).json().changes;
  assert.equal(changes.length,2);assert.equal(changes.find((c:any)=>c.id==='one').value.amount,30);
  await push(u,[op([{kind:'transactions',id:'one',value:null}])]);
  assert.equal((await call(u,'GET','/sync/pull?cursor=0')).json().changes.find((c:any)=>c.id==='one').value,null);
  assert.equal((await push(u,[{...operation,changes:[tx('one',99)]}])).statusCode,409);
});
test('周期重复执行和投资结算只记一次，独立买入累加',async()=>{
  const u=await account();
  const holding={id:'h',assetType:'fund',code:'000001',market:'fund',name:'基金',shares:10,costAmount:100,createdAt:'2026-09-04',updatedAt:'2026-09-04'};
  await push(u,[op([{kind:'assetHoldings',id:'h',value:holding}],'seed')]);
  const trade=(id:string)=>({kind:'assetTradeRecords',id,value:{id,holdingId:'h',assetType:'fund',code:'000001',name:'基金',tradeType:'buy',source:'manual',status:'completed',shares:2,amount:20,price:10,occurredAt:'2026-09-04',createdAt:'2026-09-04'}});
  const changes=[{kind:'assetHoldings',id:'h',value:{...holding,shares:12,costAmount:120},fields:['shares','costAmount']},trade('t1')];
  assert.equal((await push(u,[op(changes)])).statusCode,200);
  await push(u,[op(changes)]);await push(u,[op([{...changes[0]},trade('t2')])]);
  await push(u,[op([tx('recurring:rule:2026-09-04')])]);await push(u,[op([tx('recurring:rule:2026-09-04',999)])]);
  const rows=(await call(u,'GET','/sync/pull?cursor=0')).json().changes;
  assert.equal(rows.find((r:any)=>r.kind==='assetHoldings').value.shares,14);
  assert.equal(rows.find((r:any)=>r.id.startsWith('recurring:')).value.amount,10);
  const invalid=trade('sell');invalid.value.tradeType='sell';invalid.value.shares=100;
  assert.equal((await push(u,[op([tx('rollback'),invalid])])).statusCode,409);
  assert.ok(!(await call(u,'GET','/sync/pull?cursor=0')).json().changes.some((r:any)=>r.id==='rollback'));
});
test('覆盖版本检查、整体替换、旧设备拦截及丢失响应后重试',async()=>{
  const u=await account();await push(u,[op([tx('before')])]);
  let state=(await call(u,'GET','/sync/pull?cursor=0')).json();
  const body={id:randomUUID(),epoch:1,revision:state.revision,data:{transactions:[tx('restored',80).value]}};
  await push(u,[op([tx('concurrent')])]);
  assert.equal((await call(u,'POST','/backup/restore',body)).statusCode,409);
  state=(await call(u,'GET','/sync/pull?cursor=0')).json();body.revision=state.revision;
  const restored=await call(u,'POST','/backup/restore',body);assert.equal(restored.statusCode,200,restored.body);
  assert.equal(restored.json().epoch,2);
  assert.equal((await call(u,'POST','/backup/restore',body)).json().epoch,2);
  assert.equal((await push(u,[op([tx('old-device')])])).statusCode,409);
  state=(await call(u,'GET','/sync/pull?cursor=0')).json();
  assert.deepEqual(state.changes.filter((r:any)=>r.value).map((r:any)=>r.id),['restored']);
  await transaction(pool,u.user.id,async db=>{
    assert.equal((await db.query('SELECT count(*) FROM recovery_backups WHERE user_id=$1',[u.user.id])).rows[0].count,'1');
  });
});
test('批次格式错误整体回滚、分页无遗漏',async()=>{
  const u=await account();
  const bad=tx('bad');bad.value.amount=-2;
  assert.equal((await push(u,[op([tx('good'),bad])])).statusCode,400);
  assert.equal((await call(u,'GET','/sync/pull?cursor=0')).json().changes.length,0);
  assert.equal((await push(u,[op(Array.from({length:620},(_,i)=>tx('tx'+i)))])).statusCode,200);
  const first=(await call(u,'GET','/sync/pull?cursor=0')).json();
  assert.equal(first.changes.length,500);assert.equal(first.hasMore,true);
  const second=(await call(u,'GET','/sync/pull?cursor='+first.nextCursor+'&epoch=1')).json();
  assert.equal(second.changes.length,120);assert.equal(second.hasMore,false);
});
test('刷新会话、修改密码撤销旧会话',async()=>{
  const u=await account(),old=u.accessToken;
  const refreshed=await call(u,'POST','/auth/refresh',{refreshToken:u.refreshToken});
  assert.equal(refreshed.statusCode,200);u.accessToken=refreshed.json().accessToken;
  const changed=await call(u,'POST','/auth/password',{currentPassword:'test-password-1234',newPassword:'new-password-1234'});
  assert.equal(changed.statusCode,200);
  assert.equal((await call({...u,accessToken:old},'GET','/sync/pull')).statusCode,401);
  assert.equal((await call(u,'GET','/sync/pull')).statusCode,401);
});
