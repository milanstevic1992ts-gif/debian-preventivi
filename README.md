# GE360 Smart Sopralluoghi — Debian

Software self-hosted per raccogliere dati di sopralluogo da smartphone tramite PWA e Tailscale, generando un **prompt strutturato** da inviare al GPT Preventivi Premium V3.1. Il GPT rimane responsabile del PDF, la PWA non genera preventivi definitivi.

## Politica di sviluppo: nessun consumo di GitHub Actions

- **GitHub:** solo codice sorgente, versioni, branch e commit.
- **Debian 13:** test, build Docker, avvio e aggiornamenti.
- **Android:** accesso all'app tramite Tailscale Serve HTTPS.
- **Nessun workflow in `.github/workflows/`:** non vengono avviati runner GitHub Actions.
- Non utilizzare Codespaces, runner hosted, servizi CI/CD cloud o API IA a pagamento per questa app.
- Database SQLite, foto, credenziali e backup restano **solo su Debian**, fuori da GitHub.

Vedi [sviluppo locale senza crediti](docs/SVILUPPO_SENZA_CREDITI.md).

## Stato del repository

**Sorgenti PWA V1 importati in questa revisione** da `GE360_SMART_PWA_V1_GITHUB_READY_AGGIORNATO.zip`: presenti `backend/`, `frontend/`, `config/`, `tests/`, `scripts/`, `Dockerfile` e `docker-compose.yml`.

**La presenza dei sorgenti non equivale a un'installazione eseguita sul Debian 13.** I test di base sono stati eseguiti in ambiente isolato; prima di usare dati reali seguire `docs/INSTALLAZIONE_DEBIAN.md`, verificare il servizio locale e collaudare Android/Tailscale. Lo stato aggiornato è in `docs/STATO_PROGETTO.md`.

> Il repository è **pubblico**: non aggiungere `.env`, token, password, foto dei clienti, backup e database. Il file `.gitignore` protegge alcuni casi comuni, ma ogni commit va controllato prima del push.
