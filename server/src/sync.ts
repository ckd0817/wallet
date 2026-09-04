import type { DB } from './db.js';
import { vault, hash } from './crypto.js';
import { type Change, type Operation, HttpError, validateChange, backupKinds } from './protocol.js';

type Value = Record<string, any>;
type Row = {kind: Change['kind']; id:string; value:Value|null; revision:number};
const keyOf = (kind:string,id:string) => kind + '/' + id;

export class Wallet {
  private constructor(
    private db:DB, readonly userId:string, public epoch:number, public revision:number,
    private rows:Map<string,Row>, private secrets:ReturnType<typeof vault>,
  ) {}
  static async load(db:DB,userId:string,secrets:ReturnType<typeof vault>) {
    const state = (await db.query('SELECT epoch,revision FROM wallets WHERE user_id=$1 FOR UPDATE',[userId])).rows[0];
    if (!state) throw new HttpError(404,'账户不存在');
    const rows = new Map<string,Row>();
    for (const row of (await db.query('SELECT kind,id,value,revision FROM records WHERE user_id=$1',[userId])).rows) {
      if (row.kind === 'llmConfig' && row.value) row.value = secrets.open(row.value.encrypted);
      row.revision = Number(row.revision);
      rows.set(keyOf(row.kind,row.id),row);
    }
    return new Wallet(db,userId,Number(state.epoch),Number(state.revision),rows,secrets);
  }
  assertEpoch(epoch:number) {
    if(epoch !== this.epoch) throw new HttpError(409,'云端账本已恢复',{code:'EPOCH_CHANGED',epoch:this.epoch});
  }
  value(kind:string,id:string): Value|null { return this.rows.get(keyOf(kind,id))?.value ?? null; }
  async set(change:Change) {
    validateChange(change);
    const row = {...change,revision:++this.revision};
    this.rows.set(keyOf(change.kind,change.id),row);
    const value = change.kind === 'llmConfig' && change.value ? {encrypted:this.secrets.seal(change.value)} : change.value;
    await this.db.query(
      'INSERT INTO records(user_id,kind,id,value,revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,kind,id) DO UPDATE SET value=EXCLUDED.value,revision=EXCLUDED.revision',
      [this.userId,change.kind,change.id,value === null ? null : JSON.stringify(value),this.revision]);
  }
  async save() {
    await this.db.query('UPDATE wallets SET epoch=$2,revision=$3 WHERE user_id=$1',[this.userId,this.epoch,this.revision]);
  }
  async backup(reason:string) {
    const data = [...this.rows.values()].filter(row=>row.value !== null);
    await this.db.query('INSERT INTO recovery_backups(user_id,reason,encrypted_data) VALUES($1,$2,$3)',
      [this.userId,reason,this.secrets.seal({epoch:this.epoch,revision:this.revision,records:data})]);
  }
  async apply(operation:Operation) {
    const digest = hash(JSON.stringify(operation));
    const done = (await this.db.query('SELECT digest FROM operations WHERE user_id=$1 AND epoch=$2 AND id=$3',
      [this.userId,this.epoch,operation.id])).rows[0];
    if(done) {
      if(done.digest !== digest) throw new HttpError(409,'操作编号已被使用');
      return;
    }
    operation.changes.forEach(validateChange);
    if(operation.mode === 'seed') await this.backup('首次迁移');
    const trades = operation.changes.filter(c=>c.kind==='assetTradeRecords' && c.value);
    const tradeHoldings = new Set(trades.map(c=>String(c.value!.holdingId)));
    // 先保存分类、持仓和规则，再将独立交易应用到当前服务器持仓。
    for(const change of operation.changes.filter(c=>c.kind!=='assetTradeRecords')) {
      const current = this.value(change.kind,change.id);
      if(operation.mode !== 'mutate' && this.rows.has(keyOf(change.kind,change.id))) continue;
      let value = change.value && {...change.value};
      if(value && change.kind==='assetHoldings' && current) {
        if(change.fields) {
          value = {...current};
          for(const field of change.fields) {
            if(Object.hasOwn(change.value!,field)) value[field]=change.value![field];
            else delete value[field];
          }
        }
        if(operation.mode==='mutate' && tradeHoldings.has(change.id)) {
          value.shares=current.shares; value.costAmount=current.costAmount;
        }
      }
      // 自动推进只能向前，显式编辑规则通过 nextDueDate 之外的字段识别。
      if(value && current && ['recurringProfiles','assetRecurringPlans'].includes(change.kind)
        && change.fields?.every(f=>['nextDueDate','updatedAt'].includes(f))) {
        value.nextDueDate = [String(current.nextDueDate),String(value.nextDueDate)].sort().at(-1);
      }
      if(change.kind==='transactions' && change.id.startsWith('recurring:') && this.rows.has(keyOf(change.kind,change.id))) continue;
      await this.set({...change,value});
      if(change.kind==='assetHoldings' && value===null) {
        for(const row of [...this.rows.values()]) {
          if(row.kind==='assetRecurringPlans' && row.value?.holdingId===change.id) await this.set({...row,value:null});
        }
      }
    }
    for(const change of operation.changes.filter(c=>c.kind==='assetTradeRecords')) {
      const existing = this.rows.get(keyOf(change.kind,change.id));
      const current = existing?.value;
      const trade = change.value;
      if(operation.mode!=='mutate') {
        if(!existing) await this.set(change);
        continue;
      }
      // 币种等展示字段的补全不属于一笔新交易。即使原持仓已清仓删除，也可安全更新历史记录。
      const metadataFields = new Set(['assetType','code','name','currency']);
      if(existing && current && trade && change.fields?.length && change.fields.every(field=>metadataFields.has(field))) {
        const value = {...current};
        for(const field of change.fields) {
          if(Object.hasOwn(trade,field)) value[field]=trade[field];
          else delete value[field];
        }
        await this.set({...change,value});
        continue;
      }
      // 已结算交易和删除标记不能被另一个设备重复执行。
      if(existing && (current===null || current?.status!=='pending')) continue;
      if(!trade) { await this.set(change); continue; }
      const holding = this.value('assetHoldings',String(trade.holdingId));
      if(!holding) throw new HttpError(409,'持仓已删除',{code:'HOLDING_DELETED'});
      if(trade.status!=='pending') {
        const quantity=Number(trade.shares), amount=Number(trade.amount);
        if(trade.tradeType==='sell') {
          if(quantity>holding.shares+1e-8) throw new HttpError(409,'卖出份额超过当前持仓',{code:'INSUFFICIENT_SHARES'});
          const shares=Math.max(0,holding.shares-quantity);
          await this.set({kind:'assetHoldings',id:String(trade.holdingId),value:{
            ...holding,shares,costAmount:shares===0?0:Math.max(0,holding.costAmount-quantity*(holding.shares?holding.costAmount/holding.shares:0)),
            updatedAt:new Date().toISOString()}});
        } else {
          await this.set({kind:'assetHoldings',id:String(trade.holdingId),value:{
            ...holding,shares:holding.shares+quantity,costAmount:holding.costAmount+amount,updatedAt:new Date().toISOString()}});
        }
      }
      await this.set(change);
    }
    await this.db.query('INSERT INTO operations(user_id,epoch,id,digest) VALUES($1,$2,$3,$4)',
      [this.userId,this.epoch,operation.id,digest]);
  }
  pull(cursor:number,limit=500) {
    const changes=[...this.rows.values()].filter(row=>row.revision>cursor).sort((a,b)=>a.revision-b.revision);
    const page=changes.slice(0,limit);
    return {epoch:this.epoch,revision:this.revision,changes:page,
      nextCursor:changes.length>limit ? page.at(-1)!.revision : this.revision,hasMore:changes.length>limit};
  }
  async restore(id:string,epoch:number,revision:number,changes:Change[]) {
    const digest=hash(JSON.stringify({epoch,revision,changes}));
    const done=(await this.db.query('SELECT epoch,digest FROM restores WHERE user_id=$1 AND id=$2',[this.userId,id])).rows[0];
    if(done) {
      if(done.digest!==digest) throw new HttpError(409,'恢复编号已被使用');
      return {epoch:Number(done.epoch),revision:this.revision};
    }
    this.assertEpoch(epoch);
    if(revision!==this.revision) throw new HttpError(409,'账本已更新，请重新确认',{code:'REVISION_CHANGED'});
    await this.backup('覆盖导入');
    for(const row of [...this.rows.values()]) {
      if(backupKinds.includes(row.kind)) await this.set({...row,value:null});
    }
    for(const change of changes) await this.set(change);
    this.epoch++;
    await this.db.query('INSERT INTO restores(user_id,id,epoch,digest) VALUES($1,$2,$3,$4)',
      [this.userId,id,this.epoch,digest]);
    await this.save();
    return {epoch:this.epoch,revision:this.revision};
  }
}
