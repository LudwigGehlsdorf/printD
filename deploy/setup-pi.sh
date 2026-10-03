#!/usr/bin/env bash
# Sets up printD on a Raspberry Pi running Raspberry Pi OS (64-bit, Bookworm or newer).
#
#   sudo git clone <repo> /opt/printd
#   sudo /opt/printd/deploy/setup-pi.sh [hostname]
#
# Safe to run again: every step only does what is still missing. Run it again after
# connecting the printer if the printer queue could not be created the first time.
set -euo pipefail
# Corepack fetches the pnpm version pinned in package.json without asking.
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

HOST="${1:-}"
REPO_DIR=/opt/printd
APP_DIR="$REPO_DIR/web"
DATA_DIR=/var/lib/printd
ENV_FILE=/etc/printd/printd.env
QUEUE=printd

# Canon UFR II/UFRII LT Printer Driver for Linux V6.30 (official Canon download).
CANON_URL="http://gdlp01.c-wss.com/gds/8/0100007658/48/linux-UFRII-drv-v630-m17n-07.tar.gz"
CANON_SHA256="4ae588d8e4e14b25b74b8f8d2d5bee1e4621c27d2dd2e12ce7203e191693c755"
CANON_PPD=/usr/share/cups/model/CNRCUPSMF742CZK.ppd

step() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run with sudo"
[[ "$(uname -m)" == "aarch64" ]] || die "needs 64-bit Raspberry Pi OS (found $(uname -m))"
[[ -d "$APP_DIR" ]] || die "clone the repository to $REPO_DIR first"

export DEBIAN_FRONTEND=noninteractive

step "Keeping ipp-usb off this machine"
# ipp-usb claims the printer's USB interface and blocks Canon's driver ("printer is offline").
if dpkg -s ipp-usb >/dev/null 2>&1; then
  apt-get purge -y ipp-usb
fi
cat >/etc/apt/preferences.d/no-ipp-usb <<'EOF'
# printD: Canon's UFR II driver needs the USB connection to itself.
Package: ipp-usb
Pin: release *
Pin-Priority: -1
EOF

step "Installing system packages"
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git openssl \
  cups cups-client cups-bsd \
  libreoffice-writer libreoffice-calc libreoffice-impress \
  fonts-dejavu fonts-liberation2 fonts-crosextra-carlito fonts-crosextra-caladea \
  build-essential python3 \
  caddy

step "Installing Node.js 22"
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
note "node $(node --version)"

step "Installing Canon's UFR II driver"
if ! dpkg -s cnrdrvcups-ufr2-uk >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  curl -fL -A "Mozilla/5.0" -o "$tmp/canon.tar.gz" "$CANON_URL"
  echo "$CANON_SHA256  $tmp/canon.tar.gz" | sha256sum -c - || die "Canon driver download has an unexpected checksum"
  tar -xzf "$tmp/canon.tar.gz" -C "$tmp"
  apt-get install -y "$(ls "$tmp"/linux-UFRII-drv-*/ARM64/Debian/cnrdrvcups-ufr2-uk_*_arm64.deb)"
  rm -rf "$tmp"
fi
[[ -f "$CANON_PPD" ]] || die "Canon driver installed, but $CANON_PPD is missing"

step "Creating the printd user and directories"
id printd >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin printd
install -d -o printd -g printd -m 750 "$DATA_DIR"
chown -R printd:printd "$REPO_DIR"

step "Writing $ENV_FILE"
install -d -m 750 -g printd /etc/printd
if [[ ! -f "$ENV_FILE" ]]; then
  sed "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 33)|" "$REPO_DIR/deploy/printd.env.example" >"$ENV_FILE"
  note "Created. Fill in the AUTH_AUTHENTIK_* values before logging in."
else
  note "Exists, leaving it as it is."
fi
chown root:printd "$ENV_FILE"
chmod 640 "$ENV_FILE"

step "Setting up the printer queue '$QUEUE'"
systemctl enable --now cups
if lpstat -p "$QUEUE" >/dev/null 2>&1; then
  note "Exists."
else
  uri="$(lpinfo -v 2>/dev/null | awk '/usb:\/\/Canon\/MF742C/ {print $2; exit}')"
  if [[ -n "$uri" ]]; then
    lpadmin -p "$QUEUE" -D "Canon MF744Cdw (printD, Secure Print)" -E -v "$uri" -P "$CANON_PPD" \
      -o printer-is-shared=false
    note "Created for $uri"
  else
    note "The printer was not found on USB. Connect it, turn it on and run this script again."
  fi
fi

step "Building the app (this takes a few minutes)"
sudo -u printd -H COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -c "cd '$APP_DIR' && corepack pnpm install --frozen-lockfile && corepack pnpm build"

step "Starting the printd service"
install -m 644 "$REPO_DIR/deploy/printd.service" /etc/systemd/system/printd.service
systemctl daemon-reload
systemctl enable printd
systemctl restart printd

step "Configuring Caddy"
if [[ -n "$HOST" ]]; then
  sed "s|^PRINTD_HOST {|$HOST {|" "$REPO_DIR/deploy/Caddyfile" >/etc/caddy/Caddyfile
  systemctl reload-or-restart caddy
  note "Serving https://$HOST"
else
  note "No hostname given, so Caddy is left alone. Run again with the hostname once it exists:"
  note "  sudo $REPO_DIR/deploy/setup-pi.sh print.example.org"
fi

step "Done"
note "Check the service:      systemctl status printd"
note "Follow its log:         journalctl -u printd -f"
note "Settings:               sudoedit $ENV_FILE && sudo systemctl restart printd"
note "First test: print one page from the website and release it on the printer with the PIN."
