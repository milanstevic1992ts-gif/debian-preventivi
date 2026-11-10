#!/usr/bin/env bash
# GE360 Smart: test completamente locali, nessun runner GitHub Actions.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -d .github/workflows ]] && find .github/workflows -type f \( -name '*.yml' -o -name '*.yaml' \) | grep -q .; then
  echo "ATTENZIONE: trovati workflow GitHub Actions. Non eseguire push senza revisione." >&2
  exit 1
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  files="$(git ls-files)"
  if printf '%s\n' "$files" | grep -E '(^|/)(\.env($|\.)|data/|photos/|backups/|secrets/)|\.(sqlite|sqlite3|db|pem|key)$'; then
    echo "ERRORE: file riservato tracciato da Git, interrompo." >&2
    exit 1
  fi
fi

[[ -d tests ]] || { echo "Tests non ancora caricati nel repository."; exit 2; }
command -v python3 >/dev/null || { echo "python3 non trovato."; exit 2; }
python3 -m pytest -q

if command -v node >/dev/null 2>&1 && [[ -f tests/test_frontend.mjs ]]; then
  node --test tests/test_frontend.mjs
else
  echo "Test frontend ignorati (Node o test non presenti)."
fi
echo "Test locali completati. Nessun GitHub Actions utilizzato."
