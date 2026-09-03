#!/usr/bin/env bash
set -euo pipefail
umask 077
install -d -m 700 /var/backups/wallet
file="/var/backups/wallet/wallet-$(date -u +%Y%m%dT%H%M%SZ).dump"
sudo -u postgres pg_dump -Fc wallet > "$file.tmp"
pg_restore --list "$file.tmp" > /dev/null
mv "$file.tmp" "$file"
find /var/backups/wallet -maxdepth 1 -type f -name 'wallet-*.dump' -mtime +30 -delete
