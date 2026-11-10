# GE360 Smart V1 — Rapporto prove del 10/11/2026

## Verifiche eseguite

- **8 test Python/FastAPI superati:** salute del servizio, login/logout e accesso, checklist, creazione/modifica e controllo versioni, conflitti, prompt ed esportazione, fotografie, backup ZIP SQLite coerente, gestione versioni delle checklist, input errati e formule geometriche.
- **9 test JavaScript superati:** 91 campi e 30 regole, condizioni `eq/all/any/not`, campi dinamici, ripetizioni muri/aperture, formula di detrazione verticale, conflitti, prompt bozza, pareti escluse e numeri non validi.
- `python -m compileall` superato.
- `node --check frontend/app.js` superato.
- `bash -n scripts/*.sh` superato.
- Test degli endpoint statici superati tramite TestClient.

## Limiti del collaudo in questa sessione

- Non è stato possibile eseguire una build Docker: il motore Docker non è presente nell'ambiente di test. Dockerfile/Compose preparati ma da collaudare su Debian reale.
- L'apertura locale con Chromium/Playwright è stata bloccata dalla policy dell'ambiente di esecuzione (`ERR_BLOCKED_BY_ADMINISTRATOR`), quindi **non si dichiara completato il test visivo/interattivo su Android**.
- Non è stata testata la configurazione specifica Tailscale del Debian dell'utente, né l'eventuale occupazione della porta HTTPS 8443.

## Prima dell'uso con clienti

1. Installare su area test isolata (vedi guida).
2. Verificare login HTTPS, installazione PWA, fotografie e funzionamento con rete assente.
3. Verificare prompt dal GPT personalizzato V3.1 e il PDF di bozza.
4. Scaricare e aprire un backup ZIP prima di registrare dati reali.
5. Controllare ruoli, accessi e dispositivo Android autorizzato sulla tailnet.
