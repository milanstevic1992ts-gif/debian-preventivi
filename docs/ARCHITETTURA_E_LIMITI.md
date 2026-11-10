# Specifica architetturale e limiti della prima versione

## Componenti

- `frontend/` — PWA vanilla JavaScript, CSS e IndexedDB. Nessun CDN e nessuna dipendenza runtime npm.
- `backend/app.py` — API FastAPI con login, dati, configurazione, fotografie, prompt e backup.
- `backend/logic.py` — misure, espansione questionari, regole condizionali, generazione testuale.
- `config/checklist_bagno_v1.json` — derivato dalla checklist del 10/11/2026, con aggiunta del selettore demolizione per singola parete.
- `data/` — montaggio persistente del container, mai nel repository e mai nello ZIP di rilascio.

## Dati salvati

Survey: UUID, risposte in JSON piatto, contatori muri/aperture, snapshot checklist e versione del record. Foto separate, ricodificate come JPEG (le informazioni EXIF non vengono copiate).

Le API di modifica richiedono la versione prevista del record. Un 409 non viene sovrascritto: il rilievo locale resta disponibile per la duplicazione.

Le impostazioni delle checklist sono editabili sul server con un backup automatico di ciascuna versione precedente in `data/config_versions/`.

## Misurazioni

- Locale rettangolare: lunghezza × larghezza.
- Locale irregolare: si usa una superficie misurata e confermata dall'utente, senza inferirla dalle due dimensioni.
- Per ogni muro: lunghezza × (quota fine − quota inizio).
- Detrazione aperture: larghezza × intersezione verticale fra apertura e fascia, con convalida dei limiti.
- Non si possono valutare sovrapposizioni orizzontali fra aperture dai soli dati previsti; attenzione al doppio conteggio.
- Zone escluse e facce interne nicchie: restano annotate, da valutare a parte.
- Superficie geometrica ≠ quantità da fatturare: il criterio di detrazione contrattuale è un campo separato.
- Prezzi di catalogo NON convertiti in importi approvati automaticamente.

## Sicurezza e responsabilità

- Tailscale Serve dà HTTPS privato alla rete autorizzata; FastAPI non deve essere esposto direttamente a Internet.
- Sessione firmata HMAC con scadenza 14 giorni, cookie HttpOnly / SameSite Strict / Secure (sul dominio HTTPS).
- Upload fino a 8 MiB per foto e ricodifica JPEG tramite Pillow.
- I file sensibili vengono salvati in volume Docker con UID dedicato.
- Export del prompt sempre BOZZA; i definitivi sono competenza del GPT addestrato e della revisione umana.

## Da sviluppare nelle release successive

- Prova operativa del collegamento Android/Tailscale e collaudo PWA in vari browser.
- Pannello visivo avanzato di editing delle condizioni e delle lavorazioni (attualmente editor base testo/opzioni e JSON).
- Scelta di più stanze e libreria lavorazioni completa (la V1 implementa **un bagno per sopralluogo**).
- Correzione autonoma di foto già sincronizzate ed eventuale gestione diritto cancellazione.
- Riduzione automatica delle foto **prima** della memorizzazione offline (attualmente il limite è 8 MiB).
- Monitoraggio persistente delle connessioni e sincronizzazione continua di tutte le bozze offline.
- Ruoli e credenziali multiutente se in futuro altri collaboratori accederanno al sistema.
