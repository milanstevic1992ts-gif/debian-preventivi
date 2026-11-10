# Guida installazione Debian 13 + Tailscale

## Prima di iniziare

- Debian 13 con Docker Engine e `docker compose` funzionanti.
- Tailscale già collegato alla tua rete privata sia sul server sia su Android.
- Una porta locale libera: **8095**. Il container non aprirà porte verso la LAN o Internet.
- Scegli una porta HTTPS Tailscale Serve non usata, proposta **8443** (prima verifica `tailscale serve status`).
- Primo avvio online necessario per scaricare l'immagine Python e i pacchetti Python. Il funzionamento normale non dipende da servizi esterni.

## 1. Ottieni i sorgenti sul Debian

**Solo dopo il merge approvato della PR e dopo avere verificato il contenuto del repository:**

```bash
git clone https://github.com/milanstevic1992ts-gif/debian-preventivi.git
cd debian-preventivi
```

Non eseguire l'installazione finché i sorgenti applicativi non sono presenti nel branch integrato.

## 2. Installa

```bash
sudo bash scripts/installa_debian.sh
```

Il comando crea `.env` con password casuale e chiave di sessione, prepara `data/` con UID 10001, costruisce l'immagine e avvia il servizio. Prendi nota della password mostrata sul terminale.

Controlla:

```bash
sudo docker compose ps
curl http://127.0.0.1:8095/api/health
```

La risposta attesa contiene `"ok": true`.

## 3. Tailscale Serve

**NON** modificare un Serve preesistente senza verificare come viene usato da altri applicativi:

```bash
tailscale serve status
```

Se non usi già HTTPS 8443, pubblica il servizio nella sola tailnet:

```bash
tailscale serve --https=8443 --bg 8095
tailscale serve status
```

Il comando mostra l'URL, ad esempio `https://jarvis.nome-tailnet.ts.net:8443`. Il nome è solamente indicativo; copia l'indirizzo reale. Per disattivare questa specifica porta usa la sintassi di `tailscale serve --help` della tua versione, verificando sempre prima lo stato; non usare un reset generale se altri servizi sono pubblicati.

## 4. Sul telefono

1. Connettiti alla tailnet da Tailscale Android.
2. Apri l'indirizzo HTTPS in Chrome.
3. Accedi con la password contenuta nel `.env` sul server.
4. Dal menu Chrome scegli **Installa app** oppure **Aggiungi a schermata Home**.
5. Apri il programma dall'icona e prova a creare un sopralluogo.

## 5. Test in cantiere

- Inserisci un sopralluogo fittizio e compila 2,40 × 1,80 m: atteso pavimento **4,32 m²**.
- Aggiungi pareti e un'apertura; verifica che la superficie netta sia corretta.
- Carica una foto, verifica che compaia nell'app e nel backup ZIP.
- Copia il prompt nel GPT Premium V3.1 e controlla che sia prodotto come **BOZZA**.
- Disattiva temporaneamente la rete mobile: verifica che il sopralluogo sia ancora modificabile. Ricollegati e verifica la sincronizzazione.
- Prova a modificare lo stesso sopralluogo su due dispositivi: l'app non deve sovrascrivere una versione concorrente.

## 6. Aggiornare

Per sola modifica delle domande usa Impostazioni → Editor checklist; non c'è bisogno di riavviare il container.

Per nuove funzioni aggiorna i file del progetto (da Git, oppure sostituisci i file di codice del nuovo ZIP **senza sovrascrivere** `.env` o `data/`):

```bash
bash scripts/prepara_aggiornamento_pwa.sh
sudo bash scripts/aggiorna.sh
```

L'app sul telefono proporrà l'aggiornamento quando sarà disponibile. Le checklist salvate per i vecchi sopralluoghi non vengono sostituite.

## 7. Backup, credenziali e sicurezza

Usa **Impostazioni → Backup ZIP Debian** e sposta periodicamente il file in una destinazione protetta. Lo ZIP contiene nomi dei clienti, indirizzi e foto: trattalo come un documento riservato.

Puoi anche eseguire il backup con la copia SQLite coerente tramite l'endpoint interno `GET /api/backup` dopo autenticazione. **Non** copiare il solo `ge360.sqlite3` mentre il servizio è attivo senza considerare WAL/SHM.

- Mai caricare `.env`, `data/`, foto o backup su GitHub.
- Proteggi la tailnet con controllo accessi e account Tailscale appropriati.
- Evita `tailscale funnel`: renderebbe il servizio pubblico.
- La password locale non sostituisce una corretta configurazione Tailscale.
- Se cambi password, aggiorna `.env` e riavvia il container; per invalidare tutte le sessioni cambia anche `GE360_SESSION_SECRET`.

## Risoluzione problemi

- **Pagina non raggiungibile:** `sudo docker compose logs --tail=100`, poi `tailscale serve status`.
- **Errore permessi su /data:** `sudo chown -R 10001:10001 data && sudo chmod 700 data`.
- **PWA non installabile:** controlla HTTPS con un certificato attendibile, Chrome e manifest.
- **Non salva offline:** controlla impostazioni di archiviazione siti del browser; non usare schede in incognito.
- **Password persa:** leggi `.env` localmente come amministratore o cambiala e riavvia; non condividerla in chat.
- **Porta 8095 occupata:** prima di modificarla verifica gli altri servizi; cambiare anche la configurazione Serve se necessario.
