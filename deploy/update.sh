#!/usr/bin/env bash
# Updates printD on the Pi to the latest commit and restarts it.
#
#   sudo /opt/printd/deploy/update.sh
set -euo pipefail
# Corepack fetches the pnpm version pinned in package.json without asking.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

[[ $EUID -eq 0 ]] || { echo "Run with sudo" >&2; exit 1; }

sudo -u printd -H git -C /opt/printd pull --ff-only
sudo -u printd -H COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -c "cd /opt/printd/web && corepack pnpm install --frozen-lockfile && corepack pnpm build"
install -m 644 /opt/printd/deploy/printd.service /etc/systemd/system/printd.service
systemctl daemon-reload
systemctl restart printd
systemctl --no-pager --lines=5 status printd
