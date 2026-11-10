#!/usr/bin/env bash
# Pubblica i soli file sorgente di GE360 Smart sul repository GitHub scelto.
# Non copia database, foto, credenziali o dati persistenti.
set -Eeuo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_URL='https://github.com/milanstevic1992ts-gif/debian-preventivi.git'
DEST_DIR="${1:-$HOME/ge360-smart-github-upload}"
TARGET_BRANCH="${GE360_PUBLISH_BRANCH:-feat/import-pwa-v1}"
if [[ "$TARGET_BRANCH" == main || "$TARGET_BRANCH" == master || "$TARGET_BRANCH" == refs/heads/main || "$TARGET_BRANCH" == refs/heads/master ]]; then
  echo 'BLOCCO: la pubblicazione diretta sul branch principale non è consentita.' >&2
  exit 1
fi
if ! git check-ref-format --branch "$TARGET_BRANCH" >/dev/null 2>&1; then
  echo 'BLOCCO: nome del branch non valido.' >&2
  exit 1
fi
for command in git rsync; do
  command -v "$command" >/dev/null 2>&1 || { echo "Installa prima: $command" >&2; exit 1; }
done
if [[ -e "$DEST_DIR" ]]; then
  echo "La cartella di destinazione esiste gia': $DEST_DIR. Nessuna modifica effettuata." >&2
  echo "Scegli una cartella nuova passando un percorso come argomento." >&2
  exit 1
fi
if [[ -e "$SOURCE_DIR/.env" ]]; then
  echo 'Nota: il file .env locale non sara\x27 copiato su GitHub.'
fi
printf '\nATTENZIONE: il repository %s e\x27 PUBBLICO.\n' "$REMOTE_URL"
printf 'Verranno pubblicati solo i sorgenti, senza password, foto o database.\n'
read -r -p 'Scrivi PUBBLICA per proseguire: ' approval
[[ "$approval" == 'PUBBLICA' ]] || { echo 'Operazione annullata.'; exit 0; }
git clone "$REMOTE_URL" "$DEST_DIR"
git -C "$DEST_DIR" switch -c "$TARGET_BRANCH"
rsync -a --exclude='.git/' --exclude='.github/' --exclude='README.md' --exclude='.gitignore' --exclude='docs/STATO_PROGETTO.md' --exclude='*.zip' --include='.env.example' --exclude='.env*' --exclude='data/' --exclude='__pycache__/' --exclude='.pytest_cache/' --exclude='node_modules/' --exclude='*.pyc' --exclude='*.sqlite*' --exclude='*.db' --exclude='photos/' --exclude='backups/' --exclude='secrets/' --exclude='*.pem' --exclude='*.key' "$SOURCE_DIR/" "$DEST_DIR/"
# Il .gitignore esclude anche file privati aggiunti in futuro.
git -C "$DEST_DIR" add -- .
STAGED="$(git -C "$DEST_DIR" diff --cached --name-only)"
if [[ -z "$STAGED" ]]; then
  echo 'Nessuna modifica da pubblicare.'
  exit 0
fi
if printf '%s\n' "$STAGED" | grep -vE '(^|/)\.env\.example$' | grep -E '(^|/)(\.env($|\.)|data/|photos/|backups/|secrets/|node_modules/|__pycache__/|\.pytest_cache/|\.github/)|\.(db|sqlite3?|pem|key|zip)$'; then
  echo 'BLOCCO: rilevati file privati nei file preparati. Nessun commit eseguito.' >&2
  exit 1
fi
printf '\nFILE DA PUBBLICARE:\n%s\n' "$STAGED"
git -C "$DEST_DIR" -c user.name="$(git config user.name || printf 'GE360 Smart')" -c user.email="$(git config user.email || printf 'ge360-local@users.noreply.github.com')" commit -m 'GE360 Smart PWA V1: sorgenti, checklist bagno, Docker e test'
git -C "$DEST_DIR" push -u origin "$TARGET_BRANCH"
printf '\nBranch pubblicato: %s (non su main).\n' "$TARGET_BRANCH"
printf 'Apri una PR di revisione verso main prima di integrare i sorgenti.\n'
printf 'Repository: %s\n' "$REMOTE_URL"
printf 'La cartella di lavoro Git e\x27: %s\n' "$DEST_DIR"
