#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/node24/bin:$PATH"
cd /opt/wallet/server
npm ci --no-fund --no-audit
npm run build
set -a
source /etc/wallet/server.env
set +a
npm run migrate
install -m 644 deploy/wallet.service deploy/wallet-backup.service deploy/wallet-backup.timer deploy/wallet-certificate.service deploy/wallet-certificate.timer /etc/systemd/system/
install -m 644 deploy/nginx.conf /etc/nginx/sites-available/wallet
nginx -t
systemctl daemon-reload
systemctl enable --now wallet.service wallet-backup.timer wallet-certificate.timer
systemctl restart wallet.service
systemctl reload nginx
bash deploy/backup.sh
for i in $(seq 1 10); do
  if curl -fsS http://127.0.0.1:8787/health; then break; fi
  sleep 1
done
