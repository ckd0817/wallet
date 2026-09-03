#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
umask 077
install -d -m 755 /opt/node24 /opt/wallet /var/www/wallet-acme
install -d -m 700 /etc/wallet /var/backups/wallet /opt/wallet-download
if ! test -x /opt/node24/bin/node; then
  cd /opt/wallet-download
  curl -fsSLO https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt
  archive=$(awk '/node-v24.*-linux-x64.tar.xz$/ {print $2}' SHASUMS256.txt)
  test -n "$archive"
  curl -fsSLO "https://nodejs.org/dist/latest-v24.x/$archive"
  awk -v name="$archive" '$2==name' SHASUMS256.txt | sha256sum --check -
  tar -xJf "$archive" --strip-components=1 -C /opt/node24
fi
id wallet >/dev/null 2>&1 || useradd --system --home-dir /var/lib/wallet --create-home --shell /usr/sbin/nologin wallet
if ! test -f /etc/wallet/server.env; then
  password=$(openssl rand -hex 32)
  master=$(openssl rand -base64 32)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "CREATE ROLE wallet LOGIN PASSWORD '$password' NOSUPERUSER NOBYPASSRLS"
  sudo -u postgres createdb -O wallet wallet
  printf 'DATABASE_URL=postgresql://wallet:%s@127.0.0.1:5432/wallet\nWALLET_MASTER_KEY=%s\nPORT=8787\n' "$password" "$master" > /etc/wallet/server.env
fi
chown root:wallet /etc/wallet /etc/wallet/server.env
chmod 750 /etc/wallet
chmod 640 /etc/wallet/server.env
if ! test -f /etc/wallet/test.env; then
  password=$(openssl rand -hex 32)
  master=$(openssl rand -base64 32)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q -c "CREATE ROLE wallet_test LOGIN PASSWORD '$password' NOSUPERUSER NOBYPASSRLS"
  sudo -u postgres createdb -O wallet_test wallet_test
  printf 'DATABASE_URL=postgresql://wallet_test:%s@127.0.0.1:5432/wallet_test\nWALLET_MASTER_KEY=%s\n' "$password" "$master" > /etc/wallet/test.env
fi
if ! test -x /opt/wallet-certbot/bin/certbot; then
  python3 -m venv /opt/wallet-certbot
  /opt/wallet-certbot/bin/pip install --quiet 'certbot>=5.4,<7'
fi
cat > /etc/nginx/sites-available/wallet <<'NGINX'
server {
    listen 80;
    server_name 152.32.147.55;
    location /.well-known/acme-challenge/ { root /var/www/wallet-acme; }
    location / { return 404; }
}
NGINX
ln -sfn /etc/nginx/sites-available/wallet /etc/nginx/sites-enabled/wallet
if test -L /etc/nginx/sites-enabled/default; then unlink /etc/nginx/sites-enabled/default; fi
nginx -t
systemctl reload nginx
/opt/node24/bin/node --version
/opt/wallet-certbot/bin/certbot --version
