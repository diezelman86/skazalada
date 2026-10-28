#!/bin/bash
# Первичная настройка сервера #СказалаДа! (Ubuntu 24.04). Вставляется в поле Cloud-init при создании сервера.
set -euxo pipefail
DOMAIN="xn----7sbaabxrwm9c.xn--p1ai"          # сказала-да.рф
REPO="https://github.com/diezelman86/skazalada.git"
ADMIN_EMAILS="${ADMIN_EMAILS:-admin@example.com}"   # подставляется при создании сервера
APP=/opt/skazalada/app
DATA=/var/lib/skazalada

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git gnupg ca-certificates sqlite3 ufw debian-keyring debian-archive-keyring apt-transport-https

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Caddy: HTTPS-сертификат Let's Encrypt выпускается и продлевается сам
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

id skazalada >/dev/null 2>&1 || useradd -r -m -d /opt/skazalada -s /usr/sbin/nologin skazalada
mkdir -p "$DATA" /var/backups/skazalada
[ -d "$APP/.git" ] || git clone "$REPO" "$APP"
chown -R skazalada:skazalada /opt/skazalada "$DATA"
git config --system --add safe.directory "$APP"

cat > /etc/systemd/system/skazalada.service <<EOF
[Unit]
Description=#СказалаДа! portal
After=network.target
[Service]
User=skazalada
WorkingDirectory=$APP
Environment=DATA_DIR=$DATA
Environment=ADMIN_EMAILS=$ADMIN_EMAILS
Environment=PORT=3000
Environment=HOST=127.0.0.1
ExecStart=/usr/bin/node --no-warnings server/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:3000
  header Strict-Transport-Security "max-age=31536000"
}
www.$DOMAIN {
  redir https://$DOMAIN{uri} permanent
}
EOF

# Автообновление: каждые 2 минуты забирает новую версию из GitHub и перезапускает портал
cat > /usr/local/bin/skazalada-update <<'EOF'
#!/bin/bash
cd /opt/skazalada/app || exit 0
sudo -u skazalada git fetch -q origin main || exit 0
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  sudo -u skazalada git reset -q --hard origin/main && systemctl restart skazalada && logger "skazalada updated to $(git rev-parse --short HEAD)"
fi
EOF
chmod +x /usr/local/bin/skazalada-update
cat > /etc/systemd/system/skazalada-update.service <<'EOF'
[Unit]
Description=Update #СказалаДа! from GitHub
[Service]
Type=oneshot
ExecStart=/usr/local/bin/skazalada-update
EOF
cat > /etc/systemd/system/skazalada-update.timer <<'EOF'
[Unit]
Description=Update #СказалаДа! every 2 minutes
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
EOF

# Резервная копия базы и фото каждую ночь, хранится 14 дней
cat > /etc/cron.daily/skazalada-backup <<'EOF'
#!/bin/bash
D=/var/backups/skazalada; S=$(date +%F)
sqlite3 /var/lib/skazalada/portal.db ".backup $D/portal-$S.db"
tar -czf $D/uploads-$S.tgz -C /var/lib/skazalada uploads
find $D -type f -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/skazalada-backup

ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

systemctl daemon-reload
systemctl enable --now skazalada skazalada-update.timer
systemctl restart caddy
