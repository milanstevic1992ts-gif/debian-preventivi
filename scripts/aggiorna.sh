#!/usr/bin/env bash
# Eseguire dopo avere aggiornato il codice (git pull o copia nuovi file).
# I dati sotto ./data e le credenziali .env rimangono intatti.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo 'Prima esegui scripts/installa_debian.sh.' >&2;exit 1
fi
# La PWA può aggiornare i propri file solo quando cambia la cache service worker.
# In un aggiornamento interfaccia, cambiare prima la stringa CACHE in frontend/sw.js.
docker compose up -d --build
echo 'Pubblicazione completata. Controllo stato:'
docker compose ps
