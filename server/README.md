# 记账云端服务

运行架构：Node.js 24 / Fastify / PostgreSQL 16，Nginx 暴露 HTTPS 8443。应用与 PostgreSQL 仅监听回环地址。当前地址为 https://152.32.147.55:8443。

## 部署

目标主机为 Ubuntu 24.04，已有 443 服务继续运行。首次准备环境：

1. 安装 postgresql-16、nginx、python3-venv、xz-utils。
2. 将本仓库 server 目录复制到 /opt/wallet/server，排除 node_modules 和 dist。
3. 使用 root 执行 deploy/bootstrap.sh，安装官方 Node.js 24 并校验 SHA-256，创建运行账户、生产数据库和隔离测试数据库。
4. 使用 /opt/wallet-certbot/bin/certbot，以 webroot /var/www/wallet-acme、IP 地址 152.32.147.55 和 shortlived 配置申请受信任证书，证书名称为 152.32.147.55。
5. 执行 deploy/activate.sh，构建、迁移数据库、启用 API 和备份/证书定时任务。

后续升级先备份数据库，再上传代码并执行 activate.sh。bootstrap.sh 仅用于首次准备；已有配置和证书应保留。

配置文件位于 /etc/wallet/server.env，权限为 root:wallet 640：

| 字段 | 用途 |
| --- | --- |
| DATABASE_URL | 生产数据库连接 |
| WALLET_MASTER_KEY | 32 字节 Base64 主密钥 |
| PORT | 本机 HTTP 监听端口，默认 8787 |

配置文件和主密钥必须独立妥善备份，不能提交到仓库。更换主密钥前需要解密重加密已有模型配置及恢复副本。

## 协议

全部业务接口位于 /api/v1，除注册、登录及刷新外需要 Bearer 登录令牌。用户 ID 从会话确定，不接受客户端指定数据归属。

| 接口 | 用途 |
| --- | --- |
| POST /auth/register、/auth/login | 用户名、密码登录 |
| POST /auth/refresh | 更新短期访问令牌 |
| POST /auth/logout、/auth/password | 退出、改密；改密撤销旧会话 |
| POST /sync/push | deviceId、epoch、operations |
| GET /sync/pull?cursor=0&epoch=1 | 分页返回 changes、nextCursor、epoch、hasMore |
| POST /backup/restore | id、epoch、revision、data |
| GET /health | 数据库连通性与协议版本 |

每个操作包含 id、mode 和 changes。mode 为 mutate、append 或 seed；changes 包含 kind、id、value，删除使用 null，fields 表示设备实际修改的字段。seed/append 将导入持仓视为基线，mutate 中的新交易或待结算交易完成时原子更新当前持仓。

操作按账户行锁串行提交，revision 由服务器递增。重复操作编号及相同请求只确认一次；同编号不同内容返回 409。恢复操作同时校验 epoch/revision，并创建加密副本、递增 epoch。旧设备收到 EPOCH_CHANGED 后停止自动上传。

records 保存当前记录及删除标记；所有账本表启用强制 RLS。服务数据库角色没有超级用户或 BYPASSRLS 权限。模型配置在 records 中整体加密，恢复副本整体加密，operations 仅保存摘要而不保存明文请求。

## 备份和还原

wallet-backup.timer 每天执行 PostgreSQL 自定义格式备份，目录为 /var/backups/wallet，保留 30 天。首次迁移和覆盖导入前还会在 recovery_backups 表中保存对应账户的加密快照。

这是同机备份；手机 JSON 导出用于保存服务器外的账本副本。服务器恢复还需要 /etc/wallet/server.env 中的主密钥。

先还原到独立检查数据库，确认表结构、记录数和应用查询正确，再安排生产切换：

```bash
sudo -u postgres createdb wallet_restore_check
sudo -u postgres pg_restore --no-owner --no-privileges -d wallet_restore_check /path/to/readable-backup.dump
```

备份目录默认只有 root 可读，可通过 root 打开备份文件并将标准输入交给 postgres 身份运行的 pg_restore。生产还原前停止 wallet.service、另存当前数据库并保留原配置；切换完成后重启服务并验证 /health。

可通过管理命令解密单个账户恢复快照，将输出重定向到受限文件：

```bash
export PATH=/opt/node24/bin:$PATH
set -a
source /etc/wallet/server.env
set +a
cd /opt/wallet/server
npm run admin -- export-recovery 用户名 备份编号
```

导出的管理恢复快照包含模型配置，仅用于受控恢复，不应公开分享。

## 重置密码与排查

以 root 加载 server.env 后，通过隐藏输入取得临时密码：

```bash
read -rs -p '新密码: ' WALLET_NEW_PASSWORD
export WALLET_NEW_PASSWORD
npm run admin -- reset-password 用户名
unset WALLET_NEW_PASSWORD
```

运行状态：systemctl status wallet.service；日志：journalctl -u wallet.service。日志只记录错误类型或代码，不输出请求正文。

证书每六小时检查续期，成功后重载 Nginx。续期验证可使用 certbot renew --cert-name 152.32.147.55 --dry-run --no-random-sleep-on-renew --run-deploy-hooks --deploy-hook "systemctl reload nginx"。

## 集成测试

以 root 加载 /etc/wallet/test.env，进入 /opt/wallet/server 后执行 npm test。测试启动 Fastify 内存接口，连接专用 wallet_test 数据库，创建并清理随机账户；禁止使用生产库运行。

覆盖账户隔离、RLS、密码和会话、密钥加密、幂等、分页、最后提交覆盖、投资去重、失败事务回滚、恢复版本检查及旧设备拦截。
