# STATO PROGETTO — GE360 Smart Sopralluoghi

Aggiornato: 2026-11-10. Questa è la prima versione della memoria di progetto, ricostruita da `README.md`, `docs/SVILUPPO_SENZA_CREDITI.md` e dalle istruzioni del progetto. Non sostituisce la verifica del codice applicativo.

## Obiettivo

Realizzare GE360 Smart Sopralluoghi: PWA mobile-first self-hosted su Debian 13, Docker, FastAPI e SQLite, accessibile privatamente via Tailscale Serve HTTPS (servizio locale su `127.0.0.1:8095`). Raccoglie dati strutturati di sopralluogo ed esporta un report/prompt per GPT Preventivi; la generazione del PDF finale resta separata.

## Roadmap

Roadmap iniziale, da dettagliare solo dopo l'ispezione dei sorgenti V1:

1. **Preparazione repository e memoria** — documentazione, regole di sicurezza, file di stato. **Completata per la parte documentale.**
2. **Importazione PWA V1** — verifica del pacchetto sorgente, controllo dei segreti e importazione dei soli file applicativi necessari. **Da fare.**
3. **Esecuzione locale su Debian 13** — verifica di dipendenze e configurazione Docker/FastAPI/SQLite, binding locale e avvio. **Da fare.**
4. **Accesso privato e verifica da smartphone** — Tailscale Serve HTTPS, PWA mobile-first, persistenza dei dati e gestione dei refresh. **Da fare.**
5. **Validazione funzionale e sicurezza** — checklist condizionali, misure senza doppi conteggi, esportazione report/prompt, test, backup e ripristino. **Da fare.**

## Fase attuale

**Fase 1 — preparazione all'importazione della PWA V1.** Il `README.md` dichiara che la configurazione iniziale è presente e che il caricamento integrale del pacchetto `GE360_SMART_PWA_V1_GITHUB_READY_AGGIORNATO.zip` non è ancora completato. Non si presume che l'applicazione sia avviabile.

## Task in corso

**Nessun task di implementazione attivo.** Il task di creazione di questo documento è concluso nel branch indicato nel registro sessioni; l'importazione della PWA non è stata iniziata.

## Prossimo passo

**Reperire e ispezionare localmente `GE360_SMART_PWA_V1_GITHUB_READY_AGGIORNATO.zip`**, verificando struttura dei sorgenti, file da pubblicare e assenza di credenziali o dati reali, senza committare lo ZIP. Solo dopo questa verifica si pianifica l'importazione sul branch dedicato.

## Decisioni

- **2026-11-10 — Perimetro:** repository esclusivo `milanstevic1992ts-gif/debian-preventivi`; non mescolare altri prodotti GE360.
- **2026-11-10 — Stack:** Debian 13, Docker, FastAPI, SQLite, PWA mobile-first, porta locale 8095, accesso tramite Tailscale Serve HTTPS; niente APK.
- **2026-11-10 — Dati e sicurezza:** repository pubblico; non committare `.env`, token, database, backup, fotografie o dati dei clienti. Nessun deploy o operazione distruttiva senza autorizzazione.
- **2026-11-10 — Costi:** nessun workflow GitHub Actions, Codespaces, registri di container o risorse a pagamento senza richiesta esplicita; test e build su Debian.
- **2026-11-10 — Flusso prodotto:** la PWA esporta report/prompt; il PDF definitivo rimane responsabilità del flusso GPT Preventivi.
- **2026-11-10 — Gestione modifiche:** un task per volta, branch dedicato e PR; niente modifiche dirette a `main`, merge o deploy non richiesti.

## Parcheggio

Nessuna proposta fuori task registrata in questa sessione.

## Problemi aperti

- Pacchetto sorgente V1 non disponibile in questa sessione: non è stato possibile verificarlo o importarlo.
- Applicazione e relativi test non verificati su Debian: la documentazione esistente indica che il caricamento V1 è incompleto.

## Registro sessioni

- **2026-11-10 — `docs/inizializza-stato-progetto`:** letto lo stato del repository, riscontrata l'assenza di `docs/STATO_PROGETTO.md`, consultati README, politica di sviluppo locale e `.gitignore`; creata la memoria iniziale. Nessun codice PWA modificato, nessun workflow creato, nessun test applicativo eseguito. Prossimo passo: ispezione locale del pacchetto V1.
