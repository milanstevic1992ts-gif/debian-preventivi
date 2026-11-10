# GE360 — Sviluppo e aggiornamenti SENZA crediti GitHub Actions

## Obiettivo
Il repository `milanstevic1992ts-gif/debian-preventivi` contiene **solo codice** della PWA GE360 Smart Sopralluoghi, che raccoglie dati da smartphone e prepara il prompt per GPT Preventivi Premium V3.1. Non conserva documenti dei clienti.

## Regola fissa
Non introdurre file `.yml` o `.yaml` in `.github/workflows/`. Non attivare GitHub Actions, Codespaces, hosted runners, build cloud, servizi di deployment esterni o API IA a pagamento. Lavorare tramite commit GitHub e compilazione/test sul Debian.

> GitHub Git e la gestione dei commit non richiedono minuti GitHub Actions. Rimangono applicabili i limiti del piano GitHub e dell'account ChatGPT; questa politica **non garantisce** che ogni servizio possibile sia gratuito.

## Flusso di lavoro
1. Modificare codice o checklist sul branch di sviluppo e salvare il commit su GitHub.
2. Sul Debian: `git fetch origin` e `git pull --ff-only`, dopo aver controllato i cambiamenti.
3. Eseguire `bash scripts/test_locale.sh` (oppure il percorso `tools/test_locale.sh` durante la fase iniziale).
4. Soltanto quando i test passano, eseguire lo script di aggiornamento/ricostruzione Docker **sul Debian**.
5. Provare la PWA da Android tramite **Tailscale Serve**, senza `Funnel`.
6. Se la versione funziona, registrarla come release/tag Git; se crea problemi, ripristinare il codice precedente e i dati dal backup quando necessario.

## Separazione dei dati
- Da versionare: `backend/`, `frontend/`, `config/`, `tests/`, `scripts/`, `Dockerfile`, `docker-compose.yml`, documentazione.
- Da NON versionare: `.env`, credenziali, fotografie, database `*.sqlite3`, `data/`, `photos/`, `backups/`, token Tailscale, dati dei clienti.
- Il backup dei dati resta separato dai rollback di Git: un rollback di codice **non** annulla automaticamente le migrazioni del database.

## Test e aggiornamenti
- Backend: `python3 -m pytest -q`, con dipendenze già installate sul Debian.
- Frontend: `node --test tests/test_frontend.mjs`, se Node è presente.
- Sicurezza: verificare `git status`, i file staged e l'assenza di segreti prima del push.
- Aggiornamenti checklist: modificare i JSON versionati e preservare lo schema dei sopralluoghi esistenti.
- Aggiornamenti PWA: gestire la cache del service worker e **non** interrompere un sopralluogo in compilazione.

## Pubblicazione iniziale del codice V1
Il README del pacchetto `GE360_SMART_PWA_V1_GITHUB_READY_AGGIORNATO.zip` include `scripts/pubblica_github.sh`. Serve per il primo upload dei file applicativi; non richiede GitHub Actions. Può chiedere credenziali GitHub al momento del push se non già configurate.

**Non eseguire** lo script di installazione finché `Dockerfile`, `backend/` e `frontend/` non sono effettivamente presenti nel clone.
