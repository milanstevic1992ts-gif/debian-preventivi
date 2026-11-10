# STATO PROGETTO — GE360 Smart Sopralluoghi

Aggiornato: 2026-11-10. Memoria di progetto basata sul repository GitHub e sull'ispezione dell'archivio PWA V1 reperito nella Libreria. L'esecuzione sul Debian 13 dell'utente rimane da verificare.

## Obiettivo

Realizzare GE360 Smart Sopralluoghi: PWA mobile-first self-hosted su Debian 13, Docker, FastAPI e SQLite, accessibile privatamente via Tailscale Serve HTTPS (servizio locale su `127.0.0.1:8095`). Raccoglie dati strutturati di sopralluogo ed esporta un report/prompt per GPT Preventivi; la generazione del PDF finale resta separata.

## Roadmap

Roadmap iniziale, da dettagliare solo dopo l'ispezione dei sorgenti V1:

1. **Preparazione repository e memoria** — documentazione, regole di sicurezza, file di stato. **Completata per la parte documentale.**
2. **Importazione PWA V1** — **completata nel branch di importazione, in attesa di integrazione**: sorgenti inclusi, script di pubblicazione reso sicuro (solo branch dedicato), test locali isolati superati.
3. **Esecuzione locale su Debian 13** — verifica di dipendenze e configurazione Docker/FastAPI/SQLite, binding locale e avvio. **Da fare.**
4. **Accesso privato e verifica da smartphone** — Tailscale Serve HTTPS, PWA mobile-first, persistenza dei dati e gestione dei refresh. **Da fare.**
5. **Validazione funzionale e sicurezza** — checklist condizionali, misure senza doppi conteggi, esportazione report/prompt, test, backup e ripristino. **Da fare.**

## Fase attuale

**Fase 3 — collaudo locale su Debian 13 in corso.** Il branch `feat/import-pwa-v1` è stato clonato sul server JARVIS; Debian 13, Docker, Docker Compose, Git, Tailscale e porta 8095 sono stati verificati. Il primo test locale ha individuato un falso positivo su `.env.example`, corretto in questo commit. Nessun container è stato ancora avviato.

## Task in corso

**Installazione/collaudo Debian 13 in corso.** Il branch è clonato sul server JARVIS e le dipendenze di test sono installate in `.venv`. Sul Debian 13 reale sono stati superati **8/8 test backend** e **9/9 test frontend**. Rimane da creare la configurazione locale `.env`, avviare Docker e verificare `/api/health` su `127.0.0.1:8095`.

## Prossimo passo

**Sul server JARVIS eseguire l'installazione Docker controllata**, creando `.env` e `data/` solo localmente, avviando il container su `127.0.0.1:8095` e verificando `docker compose ps` e `GET /api/health`. Non configurare ancora Tailscale Serve.

## Decisioni

- **2026-11-10 — Perimetro:** repository esclusivo `milanstevic1992ts-gif/debian-preventivi`; non mescolare altri prodotti GE360.
- **2026-11-10 — Stack:** Debian 13, Docker, FastAPI, SQLite, PWA mobile-first, porta locale 8095, accesso tramite Tailscale Serve HTTPS; niente APK.
- **2026-11-10 — Dati e sicurezza:** repository pubblico; non committare `.env`, token, database, backup, fotografie o dati dei clienti. Nessun deploy o operazione distruttiva senza autorizzazione.
- **2026-11-10 — Costi:** nessun workflow GitHub Actions, Codespaces, registri di container o risorse a pagamento senza richiesta esplicita; test e build su Debian.
- **2026-11-10 — Flusso prodotto:** la PWA esporta report/prompt; il PDF definitivo rimane responsabilità del flusso GPT Preventivi.
- **2026-11-10 — Gestione modifiche:** un task per volta, branch dedicato e PR; niente modifiche dirette a `main`, merge o deploy non richiesti.

## Parcheggio

- **2026-11-10 — Collegamento API GE360 semplificato (richiesta utente; non ancora implementato):** usare l'API REST FastAPI **già esistente** in `backend/app.py` (`/api/*`, JSON, esportazione e versioni dei sopralluoghi) per il futuro collegamento ai software GE360 che dispongono già di una propria API. Niente seconda API, nuovo servizio, OAuth, ruoli o gestione credenziali complessa. Definire la sincronizzazione soltanto quando sarà noto il software da collegare e il suo contratto API; preferire il riuso degli endpoint esistenti, con adattamento minimo e compatibilità. **Sicurezza minima obbligatoria:** API non esposta pubblicamente, accesso via Tailscale Serve HTTPS e autenticazione esistente; se servirà comunicazione automatica senza sessione browser, valutare allora **una sola chiave API semplice** in configurazione locale Debian, mai in GitHub, senza introdurla adesso. Questo requisito resta parcheggiato fino al collaudo Debian; non modifica il task attuale.

## Verifica pacchetto V1 — 2026-11-10

- Archivio: `GE360_SMART_PWA_V1_GITHUB_READY_AGGIORNATO.zip`, reperito nella Libreria del progetto; SHA-256 `aa82627bfa0dead02b419d6fac7597fddecd0a1c8a6593d02d66f93b28425bd3`. **Non committare lo ZIP.**
- Inventario: 34 file, dimensione estratta circa 267 KB. Presenze verificate: `backend/`, `frontend/`, `config/`, `tests/`, `scripts/`, `Dockerfile`, `docker-compose.yml`, `requirements.txt`, `.env.example`.
- Sicurezza archivio: test integrità ZIP superato; nessun path traversal o link simbolico; non presenti `.env`, database, backup, dati clienti in directory riservate o workflow GitHub Actions. Scansione euristica di token/chiavi senza corrispondenze riconoscibili; non equivale a una garanzia assoluta di assenza di segreti. Gli indirizzi nell'esempio prompt sono dimostrativi.
- Checklist `config/checklist_bagno_v1.json`: versione 1.1.0, 91 domande, 30 regole; JSON del frontend identico.
- Test eseguiti **su copia estratta in ambiente isolato**, non sul Debian dell'utente: `python3 -m pytest -q` → **8/8 superati**; `node --test tests/test_frontend.mjs` → **9/9 superati**; `python3 -m compileall -q backend tests`, `node --check frontend/app.js`, `bash -n scripts/*.sh` → superati.
- Ambiente di prova: Python 3.13.5, Node 22.16.0. Docker non disponibile; nessuna build, installazione, prova Android o Tailscale eseguita.
- **Blocco prima del primo import:** `scripts/pubblica_github.sh` termina con `git push -u origin HEAD:main`, in conflitto con la regola di lavorare solo su branch dedicati. Non eseguire lo script senza adattamento.

## Importazione sorgenti V1 — 2026-11-10

- Branch: `feat/import-pwa-v1`, basato su `audit/verifica-pacchetto-pwa-v1` (PR dipendente dalle PR #1 e #2); nessuna modifica diretta a `main`.
- 32 file importati dal pacchetto V1, comprese le icone PNG da circa 3,3 e 9,5 KB. Conservati il README e `.gitignore` preesistenti, con aggiornamento mirato del solo README; nessuno ZIP o dato cliente caricato.
- `scripts/pubblica_github.sh` crea un branch di pubblicazione dedicato, blocca `main`/`master`, non sincronizza workflow GitHub Actions, ZIP, `README.md`, `.gitignore` o questo file; non esegue merge o deploy.
- Documentazione di installazione/pubbicazione adattata al repository e alla revisione tramite PR.
- Test **nell'ambiente isolato disponibile**, non su Debian 13: `python3 -m pytest -q` → 8/8 superati; `node --test tests/test_frontend.mjs` → 9/9 superati; compilazione Python, controllo sintassi JS e Bash superati. Verificato anche blocco preventivo di `main` e `refs/heads/main`.
- I 32 oggetti Git dei sorgenti sono verificati contro gli hash Git calcolati in locale. Nessun workflow, push diretto a `main`, merge o deploy.

## Problemi aperti

- Le PR di documentazione e importazione richiedono revisione e merge autorizzato; fino ad allora `main` non include la PWA.
- Compatibilità Docker/Debian 13, Tailscale Serve HTTPS, offline PWA e collaudo Android non verificati sull'hardware dell'utente.

## Registro sessioni

- **2026-11-10 — `docs/inizializza-stato-progetto`:** letto lo stato del repository, riscontrata l'assenza di `docs/STATO_PROGETTO.md`, consultati README, politica di sviluppo locale e `.gitignore`; creata la memoria iniziale. Nessun codice PWA modificato, nessun workflow creato, nessun test applicativo eseguito. Prossimo passo: ispezione locale del pacchetto V1.

- **2026-11-10 — `audit/verifica-pacchetto-pwa-v1`:** reperito lo ZIP in Libreria e controllata struttura, integrità, assenza dei file vietati e presenza dei sorgenti. Test isolati: 8 Python e 9 JS superati; sintassi Python/JS/Bash superata. Segnalato lo script che fa push a `main`; non importato né pubblicato alcun file dello ZIP. Prossimo passo: importazione sicura V1 in branch dedicato.

- **2026-11-10 — `feat/import-pwa-v1`:** importati 32 file applicativi e tecnici dalla V1 con controllo hash, mantenuta la documentazione iniziale, messo in sicurezza lo script di pubblicazione, aggiornati i riferimenti all'installazione; test isolati: 8 Python e 9 JS superati, sintassi e blocco `main` verificati. Nessun deploy o merge. Prossimo passo: collaudo locale Debian 13 dopo integrazione autorizzata.

- **2026-11-10 — Requisito futuro richiesto:** confermata la presenza delle API FastAPI di base; registrata nel Parcheggio la futura interoperabilità con altri software GE360. Nessun nuovo endpoint o protocollo di sincronizzazione implementato, nessuna modifica al prossimo passo di collaudo locale Debian.

- **2026-11-10 — Chiarimento requisiti API:** preferito riuso dell'API FastAPI già presente per i futuri collegamenti; esclusi sistemi complessi di credenziali o nuove API. Nessun codice modificato; prossimo passo invariato: collaudo Debian 13.

- **2026-11-10 — collaudo Debian, falso positivo `.env.example`:** clone `feat/import-pwa-v1` riuscito su JARVIS; ambiente verificato (Debian 13, Docker/Compose, Git, Tailscale, porta 8095 libera). `scripts/test_locale.sh` bloccava erroneamente `.env.example`, pur essendo esplicitamente consentito da `.gitignore`. Corretto il filtro mantenendo il blocco per `.env` reali e altri file sensibili. Prossimo passo: `git pull --ff-only` e rilancio test locali sul Debian.

- **2026-11-10 — correzione tecnica del fix test locale:** il primo aggiornamento remoto di `scripts/test_locale.sh` è stato rilevato come malformato durante la verifica post-commit e sostituito prima del pull sul Debian. Il file corretto consente solo `.env.example` e continua a bloccare `.env` reali e file sensibili. Nessun comando di installazione eseguito sul server in questa fase.

- **2026-11-10 — collaudo Debian, dipendenza Python mancante:** dopo il pull a `767ac59`, `scripts/test_locale.sh` supera il controllo file riservati ma `pytest` si ferma durante la raccolta con `ModuleNotFoundError: No module named 'PIL'`. `requirements.txt` dichiara già `Pillow>=10,<13`; il problema è l'ambiente Python utente incompleto, non il codice applicativo. Prossimo passo: ambiente virtuale locale e reinstallazione controllata delle dipendenze prima dei test.

- **2026-11-10 — collaudo Debian, test applicativi superati:** creato `.venv` locale sul server JARVIS e installate le dipendenze applicative/test; `python -m pytest -q` → **8 passed** (1 warning di deprecazione Starlette/httpx, non bloccante); test frontend Node → **9 passed, 0 fail**. Nessun GitHub Actions utilizzato. Prossimo passo: avvio Docker controllato su `127.0.0.1:8095`, senza ancora configurare Tailscale Serve.
