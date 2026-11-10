# Pubblicazione GitHub — debian-preventivi

Repository pubblico: <https://github.com/milanstevic1992ts-gif/debian-preventivi>.
Non inserire mai `.env`, token, password, database SQLite, foto, backup o dati di clienti.

## Flusso di lavoro

1. Lavora su un branch dedicato, mai direttamente su `main`.
2. Controlla i file con `git status` e `git diff --cached`; non includere `.github/workflows/` o archivi ZIP.
3. Esegui `python3 -m pytest -q` e, se Node è disponibile, `node --test tests/test_frontend.mjs` **in locale su Debian**.
4. Pubblica il branch, apri una PR verso `main` e verificane il diff prima di approvare il merge.
5. Dopo il merge approvato, aggiorna il server Debian con backup e test locali. Niente GitHub Actions e niente deploy automatico.

## Script per la prima pubblicazione da un pacchetto sorgente

`bash scripts/pubblica_github.sh` è un'opzione per copiare i sorgenti in un **nuovo** checkout locale (richiede `git`, `rsync` e autenticazione GitHub). Per impostazione predefinita usa il branch `feat/import-pwa-v1`; si può scegliere un altro branch dedicato con `GE360_PUBLISH_BRANCH`.
Lo script **blocca `main` e `master`**, preserva il README, `.gitignore` e `docs/STATO_PROGETTO.md` già presenti e non copia `.github/`, ZIP o directory dati. Richiede la conferma testuale `PUBBLICA` e pubblica solo un branch: **non apre né unisce automaticamente la PR**.

Prima di eseguire lo script, verifica che il branch remoto non esista già e ispeziona i file del pacchetto. Per una PR già in corso, non è necessario eseguire questo script.

## Sul Debian

Dopo la revisione e il merge autorizzato, segui `docs/INSTALLAZIONE_DEBIAN.md`. Gli aggiornamenti e i backup si effettuano solo sul server. Database, foto, `.env` e credenziali devono restare fuori da GitHub.
