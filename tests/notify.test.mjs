import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildEmail,
  fetchSubscribers,
  isEligibleSubscriberForSector,
  isValidEmail,
  runNotifySector,
  sanitizeAddressName,
} from '../scripts/notify.mjs';

test('isValidEmail e sanitizeAddressName bloccano injection negli header SMTP', () => {
  assert.equal(isValidEmail('nuotatore@example.com'), true);
  assert.equal(isValidEmail('evil@example.com\r\nBcc: victim@example.com'), false);
  assert.equal(isValidEmail('Mario <mario@example.com>'), false);

  assert.equal(sanitizeAddressName('Mario\r\nBcc: x', 'Rossi" <evil>'), 'Mario Bcc: x Rossi evil');
});

test('buildEmail esegue escaping HTML, rimuove URL non sicuri e gestisce più comitati', () => {
  const mail = buildEmail(
    { id: 'u1', nome: '<script>alert(1)</script>', comitati: ['veneto', 'emilia-romagna'] },
    [
      {
        id: '150120',
        title: 'Trofeo <b>Rovigo</b>',
        dateStart: '2027-01-10',
        dateEnd: '2027-01-10',
        citta: 'Rovigo',
        provincia: 'RO',
        comitato: 'veneto',
        url: 'javascript:alert(1)',
        locandinaUrl: 'https://www.federnuoto.it/rovigo.pdf',
      },
      {
        id: '150130',
        title: 'Trofeo Bologna',
        dateStart: '2027-01-17',
        dateEnd: '2027-01-17',
        citta: 'Bologna',
        provincia: 'BO',
        comitato: 'emilia-romagna',
        url: 'https://www.federnuoto.it/bologna',
      },
    ],
    { appsScriptUrl: 'https://script.google.com/macros/s/test/exec', siteUrl: 'https://user.github.io/bot' }
  );

  assert.doesNotMatch(mail.html, /<script>alert\(1\)<\/script>/);
  assert.match(mail.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(mail.html, /javascript:alert/);
  assert.match(mail.html, /https:\/\/www\.federnuoto\.it\/rovigo\.pdf/);
  assert.match(mail.html, /Veneto/);
  assert.match(mail.html, /Emilia-Romagna/);
  assert.equal(mail.unsubscribe, 'https://script.google.com/macros/s/test/exec?action=unsubscribe&id=u1');
});

test('fetchSubscribers invia il token nel body POST e rifiuta HTTP o token corti', async () => {
  await assert.rejects(
    fetchSubscribers({ appsScriptUrl: 'http://insecure.example.com/exec', appsScriptToken: 'a'.repeat(24) }),
    /HTTPS/
  );
  await assert.rejects(
    fetchSubscribers({ appsScriptUrl: 'https://script.google.com/macros/s/x/exec', appsScriptToken: 'short' }),
    /corto/
  );

  let captured = null;
  const subs = await fetchSubscribers({
    appsScriptUrl: 'https://script.google.com/macros/s/x/exec',
    appsScriptToken: 'super-secret-token-0123456789',
    fetchImpl: async (url, opts) => {
      captured = { url, opts };
      return new Response(JSON.stringify({ ok: true, subscribers: [{ id: '1', email: 'a@b.it', comitato: 'veneto' }] }));
    },
  });
  assert.equal(captured.opts.method, 'POST');
  assert.ok(!captured.url.includes('super-secret-token'));
  assert.equal(JSON.parse(captured.opts.body).action, 'list');
  assert.equal(subs.length, 1);
});

test('runNotify inizializza notified.json al primo avvio e poi invia solo per comitato corrispondente', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'agnm-notify-'));
  try {
    const dataFile = path.join(tmp, 'gare.json');
    const stateFile = path.join(tmp, 'notified.json');
    await fs.writeFile(
      dataFile,
      JSON.stringify({
        events: [
          { id: '100', title: 'Gara Vecchia', dateStart: '2026-12-01', dateEnd: '2026-12-01', comitato: 'veneto', url: 'https://www.federnuoto.it/100' },
        ],
      })
    );

    const env = {
      APPS_SCRIPT_URL: 'https://script.google.com/macros/s/test/exec',
      APPS_SCRIPT_TOKEN: 'super-secret-token-0123456789',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'bot@example.com',
      SMTP_PASS: 'app-password',
      MAIL_FROM: 'bot@example.com',
      SITE_URL: 'https://example.github.io/gare',
    };

    // Primo avvio: inizializza senza inviare email
    const first = await runNotifySector({ sector: 'master', env, dataFile, stateFile, today: '2026-11-25' });
    assert.equal(first.status, 'initialized');
    assert.equal(first.sent, 0);

    // Aggiunge 2 nuove gare: una futura in Veneto e una futura in Lazio
    await fs.writeFile(
      dataFile,
      JSON.stringify({
        events: [
          { id: '100', title: 'Gara Vecchia', dateStart: '2026-12-01', dateEnd: '2026-12-01', comitato: 'veneto', url: 'https://www.federnuoto.it/100' },
          { id: '101', title: 'Nuova Veneto', dateStart: '2027-01-10', dateEnd: '2027-01-10', comitato: 'veneto', url: 'https://www.federnuoto.it/101' },
          { id: '102', title: 'Nuova Lazio', dateStart: '2027-01-12', dateEnd: '2027-01-12', comitato: 'lazio', url: 'https://www.federnuoto.it/102' },
        ],
      })
    );

    const sentMails = [];
    const second = await runNotifySector({
      sector: 'master',
      env,
      dataFile,
      stateFile,
      today: '2026-11-25',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            subscribers: [
              { id: 's1', settore: 'master', nome: 'Luca', cognome: 'Bianchi', email: 'luca@example.com', comitati: ['veneto', 'lombardia'] },
              { id: 's2', settore: 'master', nome: 'Anna', cognome: 'Verdi', email: 'anna@example.com', comitati: ['lombardia'] },
              { id: 's3', settore: 'agonisti', nome: 'Andrea', cognome: 'Frovi', cartellino: '123819', email: 'frovi@example.com', comitati: ['veneto'] },
            ],
          })
        ),
      createTransport: () => ({
        sendMail: async (msg) => {
          sentMails.push(msg);
        },
      }),
    });

    assert.equal(second.status, 'sent');
    assert.equal(second.sent, 1);
    assert.equal(sentMails.length, 1);
    assert.deepEqual(sentMails[0].to, { name: 'Luca Bianchi', address: 'luca@example.com' });
    assert.match(sentMails[0].subject, /Nuova Veneto/);

    // Settore agonisti: invia ESCLUSIVAMENTE ad Andrea Frovi (123819) anche se nel JSON arrivano altri utenti
    assert.equal(
      isEligibleSubscriberForSector({ settore: 'agonisti', nome: 'Andrea', cognome: 'Frovi', cartellino: '123819' }, 'agonisti'),
      true
    );
    assert.equal(
      isEligibleSubscriberForSector({ settore: 'agonisti', nome: 'Altro', cognome: 'Atleta', cartellino: '999999' }, 'agonisti'),
      false
    );

    const agoData = path.join(tmp, 'gare-agonisti.json');
    const agoState = path.join(tmp, 'notified-agonisti.json');
    await fs.writeFile(agoState, JSON.stringify({ ids: [] }));
    await fs.writeFile(
      agoData,
      JSON.stringify({
        events: [
          { id: '201', title: 'Trofeo Agonisti Lodi', dateStart: '2027-01-15', dateEnd: '2027-01-15', comitato: 'lombardia', url: 'https://www.federnuoto.it/201' },
        ],
      })
    );
    const agoMails = [];
    const agoRes = await runNotifySector({
      sector: 'agonisti',
      env,
      dataFile: agoData,
      stateFile: agoState,
      today: '2026-11-25',
      subscribers: [
        { id: 'a1', settore: 'agonisti', nome: 'Andrea', cognome: 'Frovi', cartellino: '123819', email: 'frovi@example.com', comitati: ['lombardia'] },
        { id: 'a2', settore: 'agonisti', nome: 'Intruso', cognome: 'Test', cartellino: '555555', email: 'intruso@example.com', comitati: ['lombardia'] },
      ],
      createTransport: () => ({
        sendMail: async (msg) => {
          agoMails.push(msg);
        },
      }),
    });
    assert.equal(agoRes.sent, 1);
    assert.equal(agoMails.length, 1);
    assert.deepEqual(agoMails[0].to, { name: 'Andrea Frovi', address: 'frovi@example.com' });
    assert.match(agoMails[0].subject, /\[Nino Bixio Agonisti\]/);

    const savedState = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    assert.deepEqual(savedState.ids, ['100', '101', '102']);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
