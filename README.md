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

**Configurazione iniziale presente.** Il caricamento integrale della PWA V1 da `GE360_SMART_PWA_V1_GITHUB_READY_AGGIORNATO.zip` è ancora da completare. Non presumere che il solo clone di questo repository sia già avviabile.

Una volta pubblicati i sorgenti, saranno presenti `backend/`, `frontend/`, `config/`, `tests/`, `scripts/`, `Dockerfile` e `docker-compose.yml`.

> Il repository è **pubblico**: non aggiungere `.env`, token, password, foto dei clienti, backup e database. Il file `.gitignore` protegge alcuni casi comuni, ma ogni commit va controllato prima del push.
