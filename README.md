# GE360 Smart Sopralluoghi

Repository di sviluppo per la PWA privata di raccolta dati di sopralluogo, da usare su Debian 13 tramite Tailscale.

**Stato:** repository inizializzato. I file applicativi completi verranno pubblicati con il pacchetto sorgente `GE360_SMART_PWA_V1_GITHUB_READY.zip` e lo script `scripts/pubblica_github.sh` forniti nella conversazione di sviluppo.

- Frontend mobile-first: checklist bagno, misure, foto, prompt per il GPT Preventivi V3.1.
- Server: FastAPI + SQLite, Docker su porta locale 8095.
- Accesso: Tailscale Serve HTTPS, senza esposizione pubblica del servizio.

> **Attenzione: questo repository è pubblico.** Non caricare mai `.env`, password, archivi `data/`, fotografie di clienti, database o backup personali. Le credenziali vengono generate solo sul server Debian.

Dopo il caricamento dei sorgenti, consulta `docs/INSTALLAZIONE_DEBIAN.md`.
