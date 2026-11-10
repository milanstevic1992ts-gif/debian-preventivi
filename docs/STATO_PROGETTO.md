# STATO PROGETTO — GE360 Smart Sopralluoghi

Aggiornato: 2026-11-10. Memoria di progetto basata sul repository GitHub e sull'ispezione dell'archivio PWA V1 reperito nella Libreria. L'esecuzione sul Debian 13 dell'utente rimane da verificare.

## Obiettivo

Realizzare GE360 Smart Sopralluoghi: PWA mobile-first self-hosted su Debian 13, Docker, FastAPI e SQLite, accessibile privatamente via Tailscale Serve HTTPS (servizio locale su `127.0.0.1:8095`). Raccoglie dati strutturati di sopralluogo ed esporta un report/prompt per GPT Preventivi; la generazione del PDF finale resta separata.

## Roadmap

Roadmap iniziale, da dettagliare solo dopo l'ispezione dei sorgenti V1:

1. **Preparazione repository e memoria** — documentazione, regole di sicurezza, file di stato. **Completata per la parte documentale.**
2. **Importazione PWA V1** — archivio e test di base verificati in ambiente isolato; importazione dei soli file applicativi necessari **ancora da fare**, previa correzione dello script di pubblicazione che fa push diretto a `main`.
3. **Esecuzione locale su Debian 13** — verifica di dipendenze e configurazione Docker/FastAPI/SQLite, binding locale e avvio. **Da fare.**
4. **Accesso privato e verifica da smartphone** — Tailscale Serve HTTPS, PWA mobile-first, persistenza dei dati e gestione dei refresh. **Da fare.**
5. **Validazione funzionale e sicurezza** — checklist condizionali, misure senza doppi conteggi, esportazione report/prompt, test, backup e ripristino. **Da fare.**

## Fase attuale

**Fase 2 — sorgenti V1 verificati, importazione non ancora eseguita.** Il pacchetto `GE360_SMART_PWA_V1_GITHUB_READY_AGGIORNATO.zip` è stato reperito e ispezionato, ma i sorgenti non sono stati caricati nel repository. L'applicazione non è ancora stata avviata sul Debian dell'utente.

## Task in corso

**Ispezione pacchetto V1 conclusa.** Nessun task di implementazione aperto; l'importazione dei sorgenti rimane da eseguire in un task dedicato.

## Prossimo passo

**Importare i sorgenti V1 selezionati in un branch dedicato**, preservando i file di stato già presenti, senza committare lo ZIP né file riservati, ed eliminando il push diretto a `main` da `scripts/pubblica_github.sh` (o escludendo completamente lo script dal primo import). Verificare il diff e i test prima di aprire una PR; niente deploy o GitHub Actions.

## Decisioni

- **2026-11-10 — Perimetro:** repository esclusivo `milanstevic1992ts-gif/debian-preventivi`; non mescolare altri prodotti GE360.
- **2026-11-10 — Stack:** Debian 13, Docker, FastAPI, SQLite, PWA mobile-first, porta locale 8095, accesso tramite Tailscale Serve HTTPS; niente APK.
- **2026-11-10 — Dati e sicurezza:** repository pubblico; non committare `.env`, token, database, backup, fotografie o dati dei clienti. Nessun deploy o operazione distruttiva senza autorizzazione.
- **2026-11-10 — Costi:** nessun workflow GitHub Actions, Codespaces, registri di container o risorse a pagamento senza richiesta esplicita; test e build su Debian.
- **2026-11-10 — Flusso prodotto:** la PWA esporta report/prompt; il PDF definitivo rimane responsabilità del flusso GPT Preventivi.
- **2026-11-10 — Gestione modifiche:** un task per volta, branch dedicato e PR; niente modifiche dirette a `main`, merge o deploy non richiesti.

## Parcheggio

Nessuna proposta fuori task registrata in questa sessione.

## Verifica pacchetto V1 — 2026-11-10

- Archivio: `GE360_SMART_PWA_V1_GITHUB_READY_AGGIORNATO.zip`, reperito nella Libreria del progetto; SHA-256 `aa82627bfa0dead02b419d6fac7597fddecd0a1c8a6593d02d66f93b28425bd3`. **Non committare lo ZIP.**
- Inventario: 34 file, dimensione estratta circa 267 KB. Presenze verificate: `backend/`, `frontend/`, `config/`, `tests/`, `scripts/`, `Dockerfile`, `docker-compose.yml`, `requirements.txt`, `.env.example`.
- Sicurezza archivio: test integrità ZIP superato; nessun path traversal o link simbolico; non presenti `.env`, database, backup, dati clienti in directory riservate o workflow GitHub Actions. Scansione euristica di token/chiavi senza corrispondenze riconoscibili; non equivale a una garanzia assoluta di assenza di segreti. Gli indirizzi nell'esempio prompt sono dimostrativi.
- Checklist `config/checklist_bagno_v1.json`: versione 1.1.0, 91 domande, 30 regole; JSON del frontend identico.
- Test eseguiti **su copia estratta in ambiente isolato**, non sul Debian dell'utente: `python3 -m pytest -q` → **8/8 superati**; `node --test tests/test_frontend.mjs` → **9/9 superati**; `python3 -m compileall -q backend tests`, `node --check frontend/app.js`, `bash -n scripts/*.sh` → superati.
- Ambiente di prova: Python 3.13.5, Node 22.16.0. Docker non disponibile; nessuna build, installazione, prova Android o Tailscale eseguita.
- **Blocco prima del primo import:** `scripts/pubblica_github.sh` termina con `git push -u origin HEAD:main`, in conflitto con la regola di lavorare solo su branch dedicati. Non eseguire lo script senza adattamento.

## Problemi aperti

- Importazione dei sorgenti V1 non ancora effettuata; il repository rimane senza PWA.
- Script di pubblicazione V1 con push diretto a `main`, da correggere o escludere prima dell'importazione.
- Compatibilità Docker/Debian 13, Tailscale Serve HTTPS, offline PWA e collaudo Android non verificati sull'hardware dell'utente.

## Registro sessioni

- **2026-11-10 — `docs/inizializza-stato-progetto`:** letto lo stato del repository, riscontrata l'assenza di `docs/STATO_PROGETTO.md`, consultati README, politica di sviluppo locale e `.gitignore`; creata la memoria iniziale. Nessun codice PWA modificato, nessun workflow creato, nessun test applicativo eseguito. Prossimo passo: ispezione locale del pacchetto V1.

- **2026-11-10 — `audit/verifica-pacchetto-pwa-v1`:** reperito lo ZIP in Libreria e controllata struttura, integrità, assenza dei file vietati e presenza dei sorgenti. Test isolati: 8 Python e 9 JS superati; sintassi Python/JS/Bash superata. Segnalato lo script che fa push a `main`; non importato né pubblicato alcun file dello ZIP. Prossimo passo: importazione sicura V1 in branch dedicato.
