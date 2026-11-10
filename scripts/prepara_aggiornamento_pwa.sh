#!/usr/bin/env bash
# Eseguire prima di pubblicare modifiche a file statici dell'app.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
from pathlib import Path
from datetime import datetime
import re
p=Path('frontend/sw.js')
s=p.read_text()
new="ge360-pwa-shell-"+datetime.now().strftime('%Y%m%d%H%M%S')
s2,n=re.subn(r"const CACHE='ge360-pwa-shell-[^']+';", "const CACHE='"+new+"';",s,count=1)
if n!=1: raise SystemExit('Stringa cache non trovata')
p.write_text(s2)
print('Nuova cache SW:',new)
PY
