# Alert Gare Nuoto Master (FIN)

Web app statica in **React (JSX)** pensata per essere pubblicata gratis su **GitHub Pages** (senza server dedicato):

- **Calendario sempre aggiornato (Master + Agonisti)**: uno script Node eseguito periodicamente da **GitHub Actions** interroga gli endpoint ufficiali FIN (`federnuoto.it`) sia per il **Circuito Supermaster** (`public/data/gare.json`, su `/`) sia per l'**Attività Agonistica** (`public/data/gare-agonisti.json`, su `/agonisti/`).
- **Accesso riservato**:
  - **Master (`/`)**: verifica cartellino + cognome sul foglio privato `Tesserati` (Canottieri Nino Bixio 1883).
  - **Agonisti (`/agonisti/`)**: ricezione alert email riservata esclusivamente ad **Andrea Frovi** (`123819`).
- **Filtri e calendario personale**: filtro per comitato regionale, vasca (25m / 50m), tipologia (Federale / Extrafederale), ricerca testuale, scheda FIN, locandina PDF, mappa e download file `.ics` per il proprio calendario.
- **Iscrizione alert via email (serverless)**: gli utenti si iscrivono con *Nome, Cognome, Email* e *Comitato regionale* tramite **Google Apps Script + Google Sheets** con conferma double opt-in e link di disiscrizione automatica.
- **Invio email automatico**: ad ogni aggiornamento, se compaiono nuove gare nel calendario FIN, GitHub Actions invia una email agli iscritti attivi del comitato regionale interessato.

---

## Architettura 100% senza server

1. **Frontend (`src/` – React + Vite)** → ospitato gratuitamente su **GitHub Pages**. Legge `public/data/gare.json` statico.
2. **Scraper & Notifier (`scripts/scrape.mjs`, `scripts/notify.mjs`)** → eseguiti da **GitHub Actions** ogni 6 ore (e su avvio manuale).
3. **Database iscritti (`apps-script/Code.gs`)** → una Web App gratuita su **Google Apps Script** collegata a un **Foglio Google** (salva gli iscritti, gestisce la conferma via email e la disiscrizione).

---

## Guida all'installazione (passo passo)

### 1. Pubblica il repository su GitHub e attiva GitHub Pages

1. Crea un repository su GitHub (es. `bot-alert-gare-nuoto`) e fai push di questo progetto sul branch `main`.
2. Vai su **Settings → Pages** e imposta **Source** su **GitHub Actions**.
3. Vai su **Settings → Actions → General → Workflow permissions**, seleziona **Read and write permissions** e salva (serve al workflow per committare gli aggiornamenti di `public/data/gare.json` e `data/notified.json`).

### 2. Configura Google Sheets + Google Apps Script (archivio iscritti e verifica tesserati)

1. Crea un nuovo **Foglio Google** su Google Drive (es. `Iscritti Alert Gare Master Nino Bixio`).
2. Dal menu del foglio apri **Estensioni → Apps Script**.
3. Sostituisci il codice nell'editor con il contenuto di [`apps-script/Code.gs`](apps-script/Code.gs) e salva.
4. Vai in **Impostazioni progetto** (icona ingranaggio) → **Proprietà script** → **Aggiungi proprietà script**:
   - `ADMIN_TOKEN`: una stringa casuale lunga e segreta (`>= 24` caratteri, es. generata con un password manager).
   - `SITE_URL`: l'URL del tuo sito GitHub Pages (es. `https://<tuo-utente>.github.io/bot-alert-gare-nuoto/`).
5. Clicca **Esegui il deployment → Nuovo deployment**:
   - Tipo: **Applicazione web**
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque**
6. Autorizza lo script quando richiesto da Google e copia l'URL della Web App (`https://script.google.com/macros/s/.../exec`).
7. **Popola il foglio `Tesserati`** nello stesso Foglio Google (privato, **non** committarlo su GitHub):
   - Al primo utilizzo lo script crea automaticamente il foglio `Tesserati` con colonne `cartellino | cognome | nome` (in alternativa puoi incollare direttamente l'export da `portale.federnuoto.it` con `Codice Tessera` e `Cognome`).
   - Le iscrizioni vengono accettate **solo** se il numero di cartellino e il cognome corrispondono a un atleta presente in `Tesserati` (Canottieri Nino Bixio 1883, cod. FIN `153625`).

### 3. Configura Variables e Secrets su GitHub

Nel repository GitHub vai su **Settings → Secrets and variables → Actions**:

**Variables (scheda *Variables*):**
- `APPS_SCRIPT_URL`: l'URL `/exec` copiato al punto precedente.
- `SITE_URL` *(opzionale)*: necessario solo se usi un dominio personalizzato o un repository `<utente>.github.io`.

**Secrets (scheda *Secrets*):**
- `APPS_SCRIPT_TOKEN`: lo stesso valore di `ADMIN_TOKEN` inserito nelle Proprietà script di Apps Script.
- `SMTP_HOST`: es. `smtp.gmail.com` (oppure un servizio gratuito come Brevo `smtp-relay.brevo.com`).
- `SMTP_PORT`: `465` (SSL) o `587` (STARTTLS).
- `SMTP_USER`: l'utente SMTP (es. la tua email Gmail).
- `SMTP_PASS`: la password SMTP (per Gmail serve una **Password per le app** generata dalle impostazioni di sicurezza dell'account Google).
- `MAIL_FROM`: mittente visibile, es. `"Alert Gare Master <tua-email@gmail.com>"`.

### 4. Primo avvio

1. Vai nella scheda **Actions** del repository, seleziona il workflow **Aggiorna gare FIN, invia alert e pubblica su GitHub Pages** e clicca **Run workflow**.
2. Al primo avvio con i secret configurati, `notify.mjs` crea `data/notified.json` segnando tutte le gare già presenti sul sito FIN come già note (senza inviare email massive). Da quel momento in poi, ogni nuova gara aggiunta sul sito FIN genererà automaticamente l'alert agli iscritti del comitato regionale corrispondente.

---

## Sviluppo locale

Puoi avviare tutto con lo script PowerShell dedicato:

```powershell
.\start-local.ps1            # avvia Vite su http://127.0.0.1:5173 (aggiorna gare.json se assente o >6h)
.\start-local.ps1 -Scrape    # forza il download aggiornato dal sito FIN prima dell'avvio
.\start-local.ps1 -Test      # esegue gli unit test prima di avviare
.\start-local.ps1 -Preview   # build di produzione (con CSP) + preview locale
```

Oppure manualmente:

```bash
npm install
npm test                  # esegue gli unit test (node --test)
node scripts/scrape.mjs   # scarica le gare reali dal sito FIN in public/data/gare.json
npm run dev               # avvia l'app React su http://localhost:5173
```

Per testare il form di iscrizione in locale, copia `.env.example` in `.env` e inserisci `VITE_APPS_SCRIPT_URL` (`https://...`).

Per verificare lo script di notifica senza inviare email reali:

```bash
DRY_RUN=1 APPS_SCRIPT_URL=... APPS_SCRIPT_TOKEN=... node scripts/notify.mjs
```

Per generare la build statica di produzione (in `dist/`):

```bash
npm run build
```

---

## Sicurezza

- **Content Security Policy (CSP)** iniettata automaticamente nella build di produzione (`dist/index.html`) e `Referrer-Policy: strict-origin-when-cross-origin`.
- **Sanitizzazione URL & iCalendar**: tutti i link provenienti dal sito FIN e usati in UI, email e file `.ics` sono filtrati con `safeHttpUrl` (`http:`/`https:`), prevenendo XSS e ICS property injection.
- **Protezione iscritti (Google Apps Script)**:
  - Double opt-in obbligatorio e conferma via email prima di modificare i dati di un iscritto già attivo (`confirm_update` con token monouso a scadenza).
  - Rate-limiting per indirizzo email (hash SHA-256 su `CacheService`) per bloccare spam verso terzi.
  - Prevenzione **Google Sheets Formula Injection** (`safeCell_`) sui campi testuali.
  - Confronto a tempo costante (`safeEqual_`) per `ADMIN_TOKEN` (minimo 24 caratteri), inviato esclusivamente nel body `POST` (mai in query string).
- **Email SMTP**: escaping HTML completo, validazione rigorosa degli indirizzi email, rimozione caratteri di controllo anti header-injection e `disableFileAccess`/`disableUrlAccess` su Nodemailer.
- **GitHub Actions**: permessi minimi separati per job (`permissions: {}` a livello di workflow).
