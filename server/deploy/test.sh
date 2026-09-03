#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" = 0
set -a
source /etc/wallet/test.env
set +a
export PATH="/opt/node24/bin:$PATH"
cd /opt/wallet/server
npm test
