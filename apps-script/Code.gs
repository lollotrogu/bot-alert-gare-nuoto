/**
 * Alert Gare Nuoto Master & Agonisti - Canottieri Nino Bixio 1883 (Piacenza, cod. FIN 153625)
 * Archivio iscritti e verifica tesserati su Google Sheets.
 *
 * Web App Google Apps Script gratuita collegata a un Foglio Google. Gestisce:
 *   POST  {action:'subscribe', settore, nome, cognome, email, cartellino, comitati, privacy} -> verifica + double opt-in
 *   POST  {action:'list', token}                                                              -> elenco iscritti attivi (GitHub Actions)
 *   GET   ?action=confirm&id=...                                                              -> conferma iscrizione
 *   GET   ?action=confirm_update&token=...                                                    -> conferma modifica dati/comitati
 *   GET   ?action=unsubscribe&id=...                                                          -> disiscrizione
 *
 * Fogli creati automaticamente nello Spreadsheet:
 *   - "Iscritti": elenco atleti iscritti agli alert
 *   - "Tesserati": elenco cartellini Master della Canottieri Nino Bixio 1883
 *
 * Regola settore "agonisti" (/agonisti):
 *   L'UNICO autorizzato a iscriversi e ricevere email per Agonisti è Andrea Frovi (cartellino 123819).
 *
 * Proprietà dello script (Impostazioni progetto -> Proprietà script):
 *   ADMIN_TOKEN     stringa casuale >= 24 caratteri, uguale al secret APPS_SCRIPT_TOKEN su GitHub (obbligatoria)
 *   SITE_URL        URL https:// del sito su GitHub Pages (facoltativa)
 *   WEBAPP_URL      URL /exec della Web App (facoltativa)
 *   REQUIRE_ROSTER  imposta "false" per disabilitare temporaneamente il controllo su "Tesserati" (facoltativa)
 */

var SHEET_NAME = 'Iscritti';
var ROSTER_SHEET_NAME = 'Tesserati';
var HEADERS = ['id', 'settore', 'nome', 'cognome', 'email', 'cartellino', 'cartellino_stato', 'comitati', 'stato', 'creato', 'confermato', 'aggiornato'];
var ROSTER_HEADERS = ['cartellino', 'cognome', 'nome'];
var AGONISTI_ALLOWED = { nome: 'andrea', cognome: 'frovi', cartellino: '123819' };
var COMITATI = {
  'abruzzo': 'Abruzzo', 'basilicata': 'Basilicata', 'calabria': 'Calabria', 'campania': 'Campania',
  'emilia-romagna': 'Emilia-Romagna', 'friuli-venezia-giulia': 'Friuli-Venezia Giulia', 'lazio': 'Lazio',
  'liguria': 'Liguria', 'lombardia': 'Lombardia', 'marche': 'Marche', 'molise': 'Molise',
  'piemonte-valle-d-aosta': "Piemonte e Valle d'Aosta", 'puglia': 'Puglia', 'sardegna': 'Sardegna',
  'sicilia': 'Sicilia', 'toscana': 'Toscana', 'trentino-alto-adige': 'Trentino-Alto Adige',
  'umbria': 'Umbria', 'veneto': 'Veneto'
};
var RATE_LIMIT_SECONDS = 120;
var UPDATE_TTL_SECONDS = 3600;
var MAX_POST_BYTES = 8192;
var FAIL_WINDOW_SECONDS = 300;
var MAX_CARD_FAILS = 15;
var SAFE_TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/;

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function webAppUrl_() {
  return prop_('WEBAPP_URL') || ScriptApp.getService().getUrl();
}

/** Confronto a tempo costante per evitare timing attack su ADMIN_TOKEN. */
function safeEqual_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  var len = Math.max(a.length, b.length);
  var diff = a.length ^ b.length;
  for (var i = 0; i < len; i++) {
    var ca = i < a.length ? a.charCodeAt(i) : 0;
    var cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/** Rimuove caratteri di controllo (previene CRLF / header injection). */
function cleanText_(s, maxLen) {
  return String(s || '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen || 120);
}

/** Normalizza per confronti di nome/cognome (minuscolo, senza accenti, spazi singoli). */
function normCompare_(s) {
  return cleanText_(s, 80)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Previene Formula Injection (CSV/Google Sheets injection) su celle scritte da utenti. */
function safeCell_(val) {
  if (val instanceof Date) return val;
  var s = String(val === undefined || val === null ? '' : val).replace(/[\x00-\x1f\x7f]/g, '');
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

function rawCell_(val) {
  var s = String(val || '');
  return s.charAt(0) === "'" && /^[=+\-@]/.test(s.slice(1)) ? s.slice(1) : s;
}

function safeHttpUrl_(raw) {
  var s = String(raw || '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

function emailKey_(email, settore) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, (settore || 'master') + ':' + email, Utilities.Charset.UTF_8);
  return 'rl_' + bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 32);
}

function canSendMail_(email, settore) {
  var cache = CacheService.getScriptCache();
  var key = emailKey_(email, settore);
  if (cache.get(key)) return false;
  cache.put(key, '1', RATE_LIMIT_SECONDS);
  return true;
}

function isCardBruteBlocked_() {
  var count = Number(CacheService.getScriptCache().get('card_fail_count') || 0);
  return count >= MAX_CARD_FAILS;
}

function recordCardFail_() {
  var cache = CacheService.getScriptCache();
  var count = Number(cache.get('card_fail_count') || 0) + 1;
  cache.put('card_fail_count', String(count), FAIL_WINDOW_SECONDS);
}

function normalizeComitati_(input) {
  var arr = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];
  var seen = {};
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var id = String(arr[i] || '').trim();
    if (id && COMITATI[id] && !seen[id]) {
      seen[id] = true;
      out.push(id);
    }
  }
  return out;
}

function formatComitati_(input) {
  return normalizeComitati_(input).map(function (id) { return COMITATI[id] || id; }).join(', ');
}

function normCard_(val) {
  var digits = String(val || '').replace(/\D+/g, '');
  if (!digits) return '';
  return digits.replace(/^0+/, '') || '0';
}

function isAuthorizedAgonisti_(nome, cognome, cartellino) {
  return (
    normCompare_(nome) === AGONISTI_ALLOWED.nome &&
    normCompare_(cognome) === AGONISTI_ALLOWED.cognome &&
    normCard_(cartellino) === AGONISTI_ALLOWED.cartellino
  );
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  rosterSheet_();
  return sh;
}

function rosterSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ROSTER_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ROSTER_SHEET_NAME);
    sh.appendRow(ROSTER_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Restituisce le intestazioni reali del foglio Iscritti e aggiunge eventuali colonne mancanti (es. settore). */
function getSheetHeaders_(sh) {
  var lastCol = sh.getLastColumn ? sh.getLastColumn() : 0;
  var firstRow = sh.getDataRange().getValues()[0] || [];
  var headers = firstRow.slice();
  if (!headers.length) {
    sh.appendRow(HEADERS);
    return HEADERS.slice();
  }
  for (var i = 0; i < HEADERS.length; i++) {
    if (headers.indexOf(HEADERS[i]) < 0) {
      headers.push(HEADERS[i]);
      if (sh.getRange && lastCol >= 0) {
        sh.getRange(1, headers.length, 1, 1).setValues([[HEADERS[i]]]);
      }
    }
  }
  return headers;
}

/**
 * Verifica che il numero di cartellino appartenga ai tesserati della Canottieri Nino Bixio 1883.
 * Per settore 'agonisti': l'UNICO autorizzato è Andrea Frovi (123819).
 * Per settore 'master': verifica contro il foglio privato "Tesserati".
 */
function verifyCartellino_(settore, cartellino, cognome, nome) {
  if (settore === 'agonisti') {
    if (!isAuthorizedAgonisti_(nome, cognome, cartellino)) {
      return {
        ok: false,
        error: 'Gli alert per la sezione Agonisti sono riservati esclusivamente ad Andrea Frovi (cartellino 123819).'
      };
    }
    return { ok: true, stato: 'verificato_agonisti' };
  }

  var sh = rosterSheet_();
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return normCompare_(h); });
  var cardIdx = headers.indexOf('cartellino');
  if (cardIdx < 0) cardIdx = headers.indexOf('codice tessera');
  if (cardIdx < 0) cardIdx = 0;
  var cognomeIdx = headers.indexOf('cognome');
  if (cognomeIdx < 0 && headers.length >= 2 && headers[0] === 'cartellino') cognomeIdx = 1;
  var hasCfPrefix = headers[0] === 'codice fiscale';

  var roster = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var offset = (hasCfPrefix && String(row[0] || '').trim().toLowerCase() === 'foto') ? 1 : 0;
    var card = normCard_(row[cardIdx + offset]);
    if (!card) continue;
    roster.push({
      card: card,
      cognome: cognomeIdx >= 0 ? normCompare_(row[cognomeIdx + offset] || '') : '',
    });
  }

  var requireRoster = String(prop_('REQUIRE_ROSTER')).toLowerCase() !== 'false';
  if (!roster.length && !requireRoster) {
    return { ok: true, stato: 'da_verificare' };
  }
  if (!roster.length) {
    return {
      ok: false,
      error: 'Elenco tesserati Nino Bixio non ancora caricato nel foglio Tesserati: impossibile verificare il cartellino.'
    };
  }

  var target = normCard_(cartellino);
  var userCognome = normCompare_(cognome);
  var matches = roster.filter(function (entry) { return entry.card === target; });
  if (!matches.length) {
    return {
      ok: false,
      error: 'Numero di cartellino non trovato tra i tesserati della Canottieri Nino Bixio 1883 (cod. FIN 153625).'
    };
  }

  var hasSurnameConstraint = matches.some(function (m) { return Boolean(m.cognome); });
  if (hasSurnameConstraint) {
    var surnameOk = matches.some(function (m) { return !m.cognome || m.cognome === userCognome; });
    if (!surnameOk) {
      return {
        ok: false,
        error: 'Il cognome inserito non corrisponde al numero di cartellino indicato.'
      };
    }
  }
  return { ok: true, stato: 'verificato' };
}

function rows_() {
  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  var headers = getSheetHeaders_(sh);
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = {};
    for (var j = 0; j < headers.length; j++) {
      r[headers[j]] = values[i][j];
    }
    if (!r.comitati && r.comitato) r.comitati = r.comitato;
    if (!r.settore) r.settore = 'master';
    r._row = i + 1;
    out.push(r);
  }
  return out;
}

function writeRow_(r) {
  var sh = sheet_();
  var headers = getSheetHeaders_(sh);
  var line = headers.map(function (h) { return safeCell_(r[h]); });
  if (r._row) sh.getRange(r._row, 1, 1, headers.length).setValues([line]);
  else sh.appendRow(line);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(s) {
  return String(s || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function page_(title, safeHtmlMessage, settore) {
  var site = safeHttpUrl_(prop_('SITE_URL'));
  if (site && settore === 'agonisti') {
    site = site.replace(/\/+$/, '') + '/agonisti/';
  }
  var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeHtml_(title) + '</title></head><body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;background:#f3f5f9;' +
    'display:flex;min-height:90vh;align-items:center;justify-content:center;margin:0">' +
    '<div style="background:#fff;padding:32px;border-radius:14px;border-top:4px solid #192b49;max-width:440px;text-align:center;box-shadow:0 8px 30px rgba(25,43,73,.12)">' +
    '<div style="font-size:13px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#23477c">Canottieri Nino Bixio 1883 · Piacenza</div>' +
    '<h2 style="color:#192b49;margin-top:10px">' + escapeHtml_(title) + '</h2><p style="color:#566782">' + safeHtmlMessage + '</p>' +
    (site ? '<p><a href="' + escapeHtml_(site) + '" target="_top" style="color:#192b49;font-weight:600">Torna al calendario gare</a></p>' : '') +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title);
}

function sendConfirmation_(r) {
  var link = webAppUrl_() + '?action=confirm&id=' + encodeURIComponent(r.id);
  var comitatiLabel = formatComitati_(r.comitati);
  var nome = rawCell_(r.nome);
  var settoreLabel = r.settore === 'agonisti' ? 'Agonisti' : 'Master';
  var html = '<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#14223a">' +
    '<h2 style="color:#192b49">Ciao ' + escapeHtml_(nome) + ',</h2>' +
    '<p>conferma la tua iscrizione agli alert <b>' + settoreLabel + '</b> (<b>Canottieri Nino Bixio 1883</b>) per: <b>' + escapeHtml_(comitatiLabel) + '</b>.</p>' +
    '<p><a href="' + escapeHtml_(link) + '" style="background:#192b49;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Conferma iscrizione</a></p>' +
    '<p style="font-size:12px;color:#566782">Se non hai richiesto tu l\'iscrizione, ignora questa email.</p></div>';
  MailApp.sendEmail({
    to: r.email,
    subject: 'Conferma iscrizione (' + settoreLabel + ') - Nino Bixio 1883 Alert Gare',
    htmlBody: html,
    body: 'Conferma la tua iscrizione: ' + link,
    name: 'Nino Bixio 1883 - Alert Gare'
  });
}

function sendUpdateConfirmation_(email, pending) {
  var link = webAppUrl_() + '?action=confirm_update&token=' + encodeURIComponent(pending.token);
  var comitatiLabel = formatComitati_(pending.comitati);
  var settoreLabel = pending.settore === 'agonisti' ? 'Agonisti' : 'Master';
  var html = '<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#14223a">' +
    '<h2 style="color:#192b49">Ciao ' + escapeHtml_(pending.nome) + ',</h2>' +
    '<p>abbiamo ricevuto una richiesta di aggiornamento del tuo profilo alert <b>' + settoreLabel + '</b> (<b>Canottieri Nino Bixio 1883</b>) per: <b>' + escapeHtml_(comitatiLabel) + '</b>.</p>' +
    '<p><a href="' + escapeHtml_(link) + '" style="background:#192b49;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Conferma aggiornamento</a></p>' +
    '<p style="font-size:12px;color:#566782">Se non hai richiesto tu questa modifica, ignora questa email: le tue preferenze attuali resteranno invariate.</p></div>';
  MailApp.sendEmail({
    to: email,
    subject: 'Conferma aggiornamento (' + settoreLabel + ') - Nino Bixio 1883 Alert Gare',
    htmlBody: html,
    body: 'Conferma aggiornamento preferenze: ' + link,
    name: 'Nino Bixio 1883 - Alert Gare'
  });
}

function isAuthorizedList_(token) {
  var expected = prop_('ADMIN_TOKEN');
  return Boolean(expected && expected.length >= 24 && safeEqual_(String(token || ''), expected));
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var rawBody = (e && e.postData && e.postData.contents) || '';
    if (String(rawBody).length > MAX_POST_BYTES) {
      return json_({ ok: false, error: 'Richiesta troppo grande' });
    }
    var body = {};
    try {
      body = JSON.parse(rawBody || '{}');
    } catch (err) {
      return json_({ ok: false, error: 'Richiesta non valida' });
    }

    if (body.action === 'list') {
      if (!isAuthorizedList_(body.token)) return json_({ ok: false, error: 'Non autorizzato' });
      var subs = rows_().filter(function (r) { return r.stato === 'active'; }).map(function (r) {
        var comitati = normalizeComitati_(rawCell_(r.comitati));
        var sett = rawCell_(r.settore) === 'agonisti' ? 'agonisti' : 'master';
        return {
          id: rawCell_(r.id),
          settore: sett,
          nome: rawCell_(r.nome),
          cognome: rawCell_(r.cognome),
          email: rawCell_(r.email),
          cartellino: rawCell_(r.cartellino),
          cartellino_stato: rawCell_(r.cartellino_stato),
          comitati: comitati,
          comitato: comitati[0] || ''
        };
      });
      return json_({ ok: true, subscribers: subs });
    }

    if (body.action !== 'subscribe') return json_({ ok: false, error: 'Azione non supportata' });
    if (body.website) return json_({ ok: true, status: 'pending' }); // honeypot anti-bot

    var settore = body.settore === 'agonisti' ? 'agonisti' : 'master';
    var nome = cleanText_(body.nome, 60);
    var cognome = cleanText_(body.cognome, 60);
    var email = cleanText_(body.email, 120).toLowerCase();
    var cartellino = cleanText_(body.cartellino, 16).replace(/\s+/g, '');
    var comitati = normalizeComitati_(body.comitati !== undefined ? body.comitati : body.comitato);

    if (!nome || !cognome) return json_({ ok: false, error: 'Nome e cognome sono obbligatori' });
    if (!/^[^\s@<>,;:"'\\]+@[^\s@<>,;:"'\\]+\.[^\s@<>,;:"'\\]{2,}$/.test(email)) {
      return json_({ ok: false, error: 'Email non valida' });
    }
    if (!/^\d{4,10}$/.test(cartellino)) {
      return json_({ ok: false, error: 'Numero di cartellino FIN non valido (richieste 4–10 cifre).' });
    }
    if (!comitati.length) return json_({ ok: false, error: 'Seleziona almeno un comitato regionale valido' });
    if (body.privacy !== true) return json_({ ok: false, error: 'È necessario accettare l\'informativa privacy' });

    if (isCardBruteBlocked_()) {
      return json_({ ok: false, error: 'Troppi tentativi di verifica cartellino. Riprova tra qualche minuto.' });
    }
    var check = verifyCartellino_(settore, cartellino, cognome, nome);
    if (!check.ok) {
      recordCardFail_();
      return json_({ ok: false, error: check.error });
    }

    var comitatiCsv = comitati.join(',');
    var now = new Date();
    var existing = rows_().filter(function (r) {
      return rawCell_(r.email).toLowerCase() === email && (rawCell_(r.settore) || 'master') === settore;
    })[0];

    if (existing) {
      if (existing.stato === 'active') {
        if (canSendMail_(email, settore)) {
          var token = Utilities.getUuid();
          var pending = {
            token: token,
            id: rawCell_(existing.id),
            settore: settore,
            nome: nome,
            cognome: cognome,
            cartellino: cartellino,
            cartellino_stato: check.stato,
            comitati: comitatiCsv
          };
          CacheService.getScriptCache().put('upd_' + token, JSON.stringify(pending), UPDATE_TTL_SECONDS);
          sendUpdateConfirmation_(email, pending);
        }
        return json_({ ok: true, status: 'update_pending' });
      }
      existing.settore = settore;
      existing.nome = nome;
      existing.cognome = cognome;
      existing.cartellino = cartellino;
      existing.cartellino_stato = check.stato;
      existing.comitati = comitatiCsv;
      existing.stato = 'pending';
      existing.aggiornato = now;
      writeRow_(existing);
      if (canSendMail_(email, settore)) sendConfirmation_(existing);
      return json_({ ok: true, status: 'pending' });
    }

    var r = {
      id: Utilities.getUuid(),
      settore: settore,
      nome: nome,
      cognome: cognome,
      email: email,
      cartellino: cartellino,
      cartellino_stato: check.stato,
      comitati: comitatiCsv,
      stato: 'pending',
      creato: now,
      confermato: '',
      aggiornato: now
    };
    writeRow_(r);
    if (canSendMail_(email, settore)) sendConfirmation_(r);
    return json_({ ok: true, status: 'pending' });
  } catch (err) {
    return json_({ ok: false, error: 'Errore interno, riprova più tardi.' });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = String(p.action || '');

  if (action === 'confirm_update') {
    var tok = String(p.token || '');
    if (!SAFE_TOKEN_RE.test(tok)) return page_('Link non valido', 'Token mancante o non valido.');
    var lockUpd = LockService.getScriptLock();
    lockUpd.waitLock(10000);
    try {
      var cache = CacheService.getScriptCache();
      var raw = cache.get('upd_' + tok);
      if (!raw) return page_('Link scaduto', 'La richiesta di aggiornamento è scaduta o già stata confermata.');
      var pending = JSON.parse(raw);
      var cleanComitati = normalizeComitati_(pending.comitati);
      if (!cleanComitati.length) return page_('Link non valido', 'Comitati non validi.');
      var row = rows_().filter(function (x) { return rawCell_(x.id) === pending.id; })[0];
      if (!row || row.stato !== 'active') return page_('Link non valido', 'Iscrizione non attiva o non trovata.');
      var sett = row.settore === 'agonisti' ? 'agonisti' : 'master';
      if (sett === 'agonisti' && !isAuthorizedAgonisti_(pending.nome, pending.cognome, pending.cartellino || row.cartellino)) {
        return page_('Non autorizzato', 'Sezione Agonisti riservata esclusivamente ad Andrea Frovi (123819).', sett);
      }
      row.nome = cleanText_(pending.nome, 60);
      row.cognome = cleanText_(pending.cognome, 60);
      row.cartellino = cleanText_(pending.cartellino || row.cartellino, 16);
      row.cartellino_stato = cleanText_(pending.cartellino_stato || row.cartellino_stato, 32);
      row.comitati = cleanComitati.join(',');
      row.aggiornato = new Date();
      writeRow_(row);
      cache.remove('upd_' + tok);
      return page_(
        'Preferenze aggiornate!',
        'Da ora riceverai gli alert delle gare per: <b>' +
          escapeHtml_(formatComitati_(row.comitati)) + '</b>.',
        sett
      );
    } finally {
      try { lockUpd.releaseLock(); } catch (ignore) {}
    }
  }

  if (action === 'confirm' || action === 'unsubscribe') {
    var id = String(p.id || '');
    if (!SAFE_TOKEN_RE.test(id)) return page_('Link non valido', 'Iscrizione non trovata o già rimossa.');
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var r = rows_().filter(function (x) { return rawCell_(x.id) === id; })[0];
      if (!r) return page_('Link non valido', 'Iscrizione non trovata o già rimossa.');
      var rSett = r.settore === 'agonisti' ? 'agonisti' : 'master';
      if (action === 'confirm') {
        r.stato = 'active';
        r.confermato = r.confermato || new Date();
        r.aggiornato = new Date();
        writeRow_(r);
        return page_(
          'Iscrizione confermata!',
          'Riceverai un\'email appena viene pubblicata una nuova gara per: <b>' +
            escapeHtml_(formatComitati_(r.comitati)) + '</b>.',
          rSett
        );
      }
      r.stato = 'unsubscribed';
      r.aggiornato = new Date();
      writeRow_(r);
      return page_('Iscrizione annullata', 'Non riceverai più email di alert. Puoi iscriverti di nuovo in qualsiasi momento.', rSett);
    } finally {
      try { lock.releaseLock(); } catch (ignore) {}
    }
  }

  return json_({ ok: true, service: 'alert-gare-nuoto-nino-bixio' });
}
