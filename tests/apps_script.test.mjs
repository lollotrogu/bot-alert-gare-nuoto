import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function loadAppsScript({ rosterRows = null } = {}) {
  const code = fs.readFileSync(path.resolve('apps-script/Code.gs'), 'utf8');
  const sheets = {
    Iscritti: [],
    Tesserati: rosterRows || [
      ['cartellino', 'cognome', 'nome'],
      ['123456', 'Rossi', 'Mario'],
      ['987654', '+Rossi', '=HYPERLINK("http://evil","Click")'],
    ],
  };
  const cacheStore = new Map();
  const sentEmails = [];
  const props = {
    ADMIN_TOKEN: 'admin-token-super-segreto-123456',
    SITE_URL: 'https://example.github.io/bot-alert-gare-nuoto/',
    WEBAPP_URL: 'https://script.google.com/macros/s/test/exec',
  };

  function makeSheetMock(name) {
    const arr = sheets[name];
    return {
      appendRow(row) { arr.push([...row]); },
      setFrozenRows() {},
      getDataRange() { return { getValues: () => arr.map((r) => [...r]) }; },
      getRange(rowIdx) {
        return {
          setValues(vals) {
            arr[rowIdx - 1] = [...vals[0]];
          },
        };
      },
    };
  }

  let uuidSeq = 0;
  const sandbox = {
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k) => props[k] || null }),
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => props.WEBAPP_URL }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (name) => (sheets[name] && sheets[name].length ? makeSheetMock(name) : null),
        insertSheet: (name) => {
          sheets[name] = sheets[name] || [];
          return makeSheetMock(name);
        },
      }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cacheStore.get(k) || null,
        put: (k, v) => cacheStore.set(k, String(v)),
        remove: (k) => cacheStore.delete(k),
      }),
    },
    MailApp: {
      sendEmail: (opts) => sentEmails.push(opts),
    },
    Utilities: {
      getUuid: () => `uuid-${++uuidSeq}`,
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_alg, str) => [...crypto.createHash('sha256').update(str, 'utf8').digest()],
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt) => ({
        setMimeType: () => ({ raw: txt, json: () => JSON.parse(txt) }),
      }),
    },
    HtmlService: {
      createHtmlOutput: (html) => ({
        setTitle: () => ({ html }),
      }),
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const post = (payload) =>
    sandbox.doPost({ postData: { contents: JSON.stringify(payload) } }).json();
  const get = (parameter) => sandbox.doGet({ parameter });

  return { post, get, sheets, sentEmails, cacheStore, props };
}

test('Code.gs verifica cartellino Nino Bixio, supporta più comitati, previene formula injection e protegge profili attivi', () => {
  const gs = loadAppsScript();

  // Validazione privacy, email e cartellino
  assert.equal(gs.post({ action: 'subscribe', nome: 'Mario', cognome: 'Rossi', email: 'mario@example.com', cartellino: '123456', comitati: ['lombardia'], privacy: false }).ok, false);
  assert.equal(gs.post({ action: 'subscribe', nome: 'Mario', cognome: 'Rossi', email: 'bad-email', cartellino: '123456', comitati: ['lombardia'], privacy: true }).ok, false);

  // Cartellino inesistente tra i tesserati -> rifiutato
  const nonBixio = gs.post({
    action: 'subscribe',
    nome: 'Mario',
    cognome: 'Rossi',
    email: 'mario@example.com',
    cartellino: '555555',
    comitati: ['lombardia', 'emilia-romagna'],
    privacy: true,
  });
  assert.equal(nonBixio.ok, false);
  assert.match(nonBixio.error, /Nino Bixio/);

  // Cartellino valido ma cognome errato -> rifiutato
  const wrongSurname = gs.post({
    action: 'subscribe',
    nome: 'Luigi',
    cognome: 'Bianchi',
    email: 'luigi@example.com',
    cartellino: '123456',
    comitati: ['lombardia'],
    privacy: true,
  });
  assert.equal(wrongSurname.ok, false);
  assert.match(wrongSurname.error, /cognome/i);

  // Iscrizione valida con tentativo di Formula Injection su nome/cognome
  const sub = gs.post({
    action: 'subscribe',
    nome: '=HYPERLINK("http://evil","Click")',
    cognome: '+Rossi',
    email: 'Mario.Rossi@Example.com',
    cartellino: '00987654',
    comitati: ['lombardia', 'emilia-romagna'],
    privacy: true,
  });
  assert.deepEqual(sub, { ok: true, status: 'pending' });
  assert.equal(gs.sentEmails.length, 1);
  // Intestazione + 1 riga; le celle con '=' o '+' devono iniziare con "'"
  assert.equal(gs.sheets.Iscritti[1][1].startsWith("'="), true);
  assert.equal(gs.sheets.Iscritti[1][2].startsWith("'+"), true);
  assert.equal(gs.sheets.Iscritti[1][5], 'verificato');
  assert.equal(gs.sheets.Iscritti[1][6], 'lombardia,emilia-romagna');
  assert.equal(gs.sheets.Iscritti[1][7], 'pending');

  // Conferma link email e verifica unescape di safeCell_ su list
  const id = gs.sheets.Iscritti[1][0];
  const confirmPage = gs.get({ action: 'confirm', id });
  assert.match(confirmPage.html, /Iscrizione confermata/);
  assert.match(confirmPage.html, /Lombardia, Emilia-Romagna/);
  assert.equal(gs.sheets.Iscritti[1][7], 'active');

  const initialList = gs.post({ action: 'list', token: gs.props.ADMIN_TOKEN });
  assert.equal(initialList.subscribers[0].cognome, '+Rossi');
  assert.deepEqual(initialList.subscribers[0].comitati, ['lombardia', 'emilia-romagna']);

  // Tentativo di modifica su email attiva NON sovrascrive senza conferma
  const hijackAttempt = gs.post({
    action: 'subscribe',
    nome: 'Mario',
    cognome: 'Rossi',
    email: 'mario.rossi@example.com',
    cartellino: '123456',
    comitati: ['lazio'],
    privacy: true,
  });
  assert.deepEqual(hijackAttempt, { ok: true, status: 'update_pending' });
  assert.equal(gs.sheets.Iscritti[1][6], 'lombardia,emilia-romagna');

  // Richiesta aggiornamento reale con conferma via token
  gs.cacheStore.clear();
  const updReq = gs.post({
    action: 'subscribe',
    nome: 'Mario',
    cognome: 'Rossi',
    email: 'mario.rossi@example.com',
    cartellino: '123456',
    comitati: ['lombardia', 'veneto'],
    privacy: true,
  });
  assert.deepEqual(updReq, { ok: true, status: 'update_pending' });
  assert.equal(gs.sentEmails.length, 2);
  const tokenMatch = gs.sentEmails[1].body.match(/token=([^&\s]+)/);
  assert.ok(tokenMatch);

  const updConfirm = gs.get({ action: 'confirm_update', token: decodeURIComponent(tokenMatch[1]) });
  assert.match(updConfirm.html, /Preferenze aggiornate/);
  assert.equal(gs.sheets.Iscritti[1][6], 'lombardia,veneto');

  // List richiede ADMIN_TOKEN valido nel body POST
  assert.equal(gs.post({ action: 'list', token: 'wrong-token' }).ok, false);
  const listRes = gs.post({ action: 'list', token: gs.props.ADMIN_TOKEN });
  assert.equal(listRes.ok, true);
  assert.equal(listRes.subscribers.length, 1);
  assert.deepEqual(listRes.subscribers[0].comitati, ['lombardia', 'veneto']);
  assert.equal(listRes.subscribers[0].cognome, 'Rossi');

  // Disiscrizione
  const unsubPage = gs.get({ action: 'unsubscribe', id });
  assert.match(unsubPage.html, /Iscrizione annullata/);
  assert.equal(gs.sheets.Iscritti[1][7], 'unsubscribed');
  assert.equal(gs.post({ action: 'list', token: gs.props.ADMIN_TOKEN }).subscribers.length, 0);
});

test('Code.gs supporta export portale.federnuoto.it con colonna foto nel foglio Tesserati', () => {
  const gs = loadAppsScript({
    rosterRows: [
      ['Codice fiscale', 'Cognome', 'Nome', 'Sesso', 'Data nascita', 'Luogo di nascita', 'Codice Tessera'],
      ['foto', 'CF00000000000000', 'VERDI', 'LUCA', 'M', '01/01/1990', 'PIACENZA (PC)', '223344'],
      ['CF11111111111111', 'BIANCHI', 'SARA', 'F', '02/02/1992', 'PIACENZA (PC)', '334455'],
    ],
  });

  const okWithFoto = gs.post({
    action: 'subscribe',
    nome: 'Luca',
    cognome: 'Verdi',
    email: 'luca@example.com',
    cartellino: '223344',
    comitati: ['lombardia'],
    privacy: true,
  });
  assert.deepEqual(okWithFoto, { ok: true, status: 'pending' });

  const okWithoutFoto = gs.post({
    action: 'subscribe',
    nome: 'Sara',
    cognome: 'Bianchi',
    email: 'sara@example.com',
    cartellino: '334455',
    comitati: ['emilia-romagna'],
    privacy: true,
  });
  assert.deepEqual(okWithoutFoto, { ok: true, status: 'pending' });
});

test('Code.gs blocca payload oversize, ID malformati e tentativi brute-force sul cartellino', () => {
  const gs = loadAppsScript();

  // Payload troppo grande
  const huge = { action: 'subscribe', nome: 'A'.repeat(9000) };
  assert.equal(gs.post(huge).ok, false);

  // Token/id con caratteri non validi in doGet
  assert.match(gs.get({ action: 'confirm', id: '../etc/passwd' }).html, /Link non valido/);
  assert.match(gs.get({ action: 'confirm_update', token: '<script>' }).html, /Link non valido/);

  // Brute-force sul cartellino bloccato dopo 15 tentativi falliti
  for (let i = 0; i < 15; i++) {
    const r = gs.post({
      action: 'subscribe',
      nome: 'Test',
      cognome: 'Attacker',
      email: `a${i}@example.com`,
      cartellino: String(900000 + i),
      comitati: ['lombardia'],
      privacy: true,
    });
    assert.equal(r.ok, false);
  }
  const blocked = gs.post({
    action: 'subscribe',
    nome: 'Mario',
    cognome: 'Rossi',
    email: 'mario@example.com',
    cartellino: '123456',
    comitati: ['lombardia'],
    privacy: true,
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Troppi tentativi/);
});
