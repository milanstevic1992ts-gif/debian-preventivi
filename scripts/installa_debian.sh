#!/usr/bin/env bash
# Prima installazione della PWA sul Debian 13. NON tocca gli altri container.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
umask 077
printf '\n=== GE360 SMART · INSTALLAZIONE DEBIAN ===\n'
if ! command -v docker >/dev/null 2>&1; then
  printf 'ERRORE: Docker mancante. Installa Docker Engine + Compose plugin.\n' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  printf 'ERRORE: docker compose non disponibile.\n' >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  if ! command -v python3 >/dev/null 2>&1; then printf 'ERRORE: manca python3.\n' >&2; exit 1; fi
  APP_PASSWORD="$(python3 -c 'import secrets;print(secrets.token_urlsafe(24))')"
  SESSION_SECRET="$(python3 -c 'import secrets;print(secrets.token_hex(32))')"
  cat > .env <<VARS
GE360_APP_PASSWORD=$APP_PASSWORD
GE360_SESSION_SECRET=$SESSION_SECRET
GE360_COOKIE_SECURE=1
GE360_DATA_DIR=/data
VARS
  chmod 600 .env
  printf '\nPASSWORD DELLA TUA APP (COPIALA):\n%s\n' "$APP_PASSWORD"
  printf 'La password è stata scritta anche nel file locale .env (NON condividerlo).\n'
else
  printf '\n.env già esistente: password e segreto NON vengono modificati.\n'
fi
mkdir -p data
# Il container gira con UID 10001; il volume va reso scrivibile soltanto a tale utente.
if [[ $(id -u) -eq 0 ]]; then
  chown -R 10001:10001 data
  chmod 700 data
else
  printf 'Serve il permesso di assegnare UID 10001 alla directory data/.\n'
  if command -v sudo >/dev/null 2>&1; then
    sudo chown -R 10001:10001 data && sudo chmod 700 data
  else
    printf 'Esegui: sudo chown -R 10001:10001 "%s/data"\n' "$PWD"
    exit 1
  fi
fi
printf '\nAvvio build + container sulla porta 127.0.0.1:8095…\n'
docker compose up -d --build
printf '\nTest servizio locale:\n'
if command -v curl >/dev/null 2>&1; then
  curl --fail --silent --show-error --max-time 8 http://127.0.0.1:8095/api/health || true
else
  docker compose ps
fi
printf '\n\nPRIMO ACCESSO DA SMARTPHONE:\n'
printf '1. Controlla eventuali Serve esistenti: tailscale serve status\n'
printf '2. Se porta HTTPS 8443 libera: tailscale serve --https=8443 --bg 8095\n'
printf '3. Apri URL HTTPS mostrato dal comando sul telefono con Tailscale attivo.\n'
printf '4. Da Chrome: Installa app / Aggiungi a schermata Home.\n'
printf '\nNota: non usare tailscale funnel (sarebbe pubblico).\n'
