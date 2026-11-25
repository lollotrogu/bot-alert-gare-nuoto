// Invia gli alert email per le nuove gare agli iscritti del relativo comitato regionale.
//
// Variabili d'ambiente (GitHub Secrets):
//   APPS_SCRIPT_URL     URL HTTPS della Web App Google Apps Script (archivio iscritti)
//   APPS_SCRIPT_TOKEN   token amministrativo per leggere l'elenco iscritti (inviato nel body POST)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
//   SITE_URL            URL pubblico del sito (GitHub Pages), usato nei link delle email
//   DRY_RUN=1           non invia nulla, stampa soltanto
//
// Stato: data/notified.json contiene gli id gara già notificati.
// Al primo avvio (file assente) tutte le gare correnti vengono marcate come notificate
// senza inviare email, per non inondare gli iscritti con l'intero calendario.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nodemailer from 'nodemailer';
import { comitatoById, formatComitati, normalizeComitati } from '../src/lib/comitati.js';
import { safeHttpUrl, safeHttpsUrl, stripControlChars } from '../src/lib/security.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATA = path.join(ROOT, 'public', 'data', 'gare.json');
const DEFAULT_STATE = path.join(ROOT, 'data', 'notified.json');

const EMAIL_RE = /^[^\s@<>,;:"'\\\r\n]+@[^\s@<>,;:"'\\\r\n]+\.[^\s@<>,;:"'\\\r\n]{2,}$/;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function saveState(stateFile, state) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  state.ids = [...new Set(state.ids)].sort();
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 120 && EMAIL_RE.test(email.trim());
}

export function sanitizeAddressName(nome = '', cognome = '') {
  return stripControlChars(`${nome} ${cognome}`)
    .replace(/["<>\\;,]/g, '')
    .slice(0, 120)
    .trim();
}

export function buildUnsubscribeUrl(appsScriptUrl, subscriberId) {
  const base = safeHttpsUrl(appsScriptUrl);
  const id = String(subscriberId || '').trim();
  if (!base || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const u = new URL(base);
  u.searchParams.set('action', 'unsubscribe');
  u.searchParams.set('id', id);
  return u.href;
}

export async function fetchSubscribers({ appsScriptUrl, appsScriptToken, fetchImpl = fetch }) {
  const endpoint = safeHttpsUrl(appsScriptUrl);
  if (!endpoint) throw new Error('APPS_SCRIPT_URL deve essere un URL HTTPS valido.');
  if (!appsScriptToken || String(appsScriptToken).length < 16) {
    throw new Error('APPS_SCRIPT_TOKEN mancante o troppo corto.');
  }
  // Token inviato nel body POST (e non nella query string) per evitare esposizione nei log URL.
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'list', token: appsScriptToken }),
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Apps Script: ${json.error || 'errore sconosciuto'}`);
  return json.subscribers || [];
}

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmtDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtRange(e) {
  return e.dateEnd && e.dateEnd !== e.dateStart ? `${fmtDate(e.dateStart)} → ${fmtDate(e.dateEnd)}` : fmtDate(e.dateStart);
}

export function buildEmail(sub, events, { appsScriptUrl, siteUrl = '' } = {}) {
  const matchedComitati = normalizeComitati(events.map((e) => e.comitato));
  const comitatoLabel = formatComitati(matchedComitati.length ? matchedComitati : sub.comitati || sub.comitato) || 'Selezionati';
  const unsubscribe = buildUnsubscribeUrl(appsScriptUrl, sub.id);
  const safeSite = safeHttpUrl(siteUrl);
  const firstTitle = stripControlChars(events[0]?.title || '').slice(0, 120);
  const subject = events.length === 1
    ? `🏊 [Nino Bixio Master] Nuova gara in ${comitatoLabel}: ${firstTitle}`
    : `🏊 [Nino Bixio Master] ${events.length} nuove gare (${comitatoLabel})`;

  const rows = events.map((e) => {
    const finUrl = safeHttpUrl(e.url);
    const pdfUrl = safeHttpUrl(e.locandinaUrl);
    const evComitato = comitatoById(e.comitato)?.nome || e.comitato;
    return `
    <tr><td style="padding:14px 0;border-bottom:1px solid #dde3ee">
      <div style="font-size:12px;color:#566782;text-transform:uppercase;font-weight:700;letter-spacing:.4px">${esc(evComitato)}</div>
      <div style="font-size:13px;color:#23477c;font-weight:600">${esc(fmtRange(e))}</div>
      <div style="font-size:17px;font-weight:700;color:#192b49;margin:4px 0">${esc(e.title)}</div>
      <div style="font-size:14px;color:#566782">📍 ${esc([e.impianto, e.citta && `${e.citta}${e.provincia ? ` (${e.provincia})` : ''}`].filter(Boolean).join(' – '))}</div>
      ${e.vasca ? `<div style="font-size:14px;color:#566782">🏊 ${esc(e.vasca)}${e.tipo ? ` · ${esc(e.tipo)}` : ''}</div>` : ''}
      ${e.iscrizioni ? `<div style="font-size:14px;color:#566782">📝 Iscrizioni: ${esc(e.iscrizioni)}</div>` : ''}
      ${e.organizzazione ? `<div style="font-size:13px;color:#6b7c95">Organizza: ${esc(e.organizzazione)}</div>` : ''}
      <div style="margin-top:8px;font-size:14px">
        ${finUrl ? `<a href="${esc(finUrl)}" style="color:#23477c">Scheda FIN</a>` : ''}
        ${pdfUrl ? `${finUrl ? ' · ' : ''}<a href="${esc(pdfUrl)}" style="color:#23477c">Locandina (PDF)</a>` : ''}
      </div>
    </td></tr>`;
  }).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #dde3ee">
      <tr><td style="background:linear-gradient(135deg,#213961,#192b49);padding:24px;color:#fff">
        <div style="font-size:20px;font-weight:800;letter-spacing:.3px">CANOTTIERI NINO BIXIO 1883 · PIACENZA</div>
        <div style="opacity:.88;margin-top:4px">Alert Gare Nuoto Master · ${esc(comitatoLabel)}</div>
      </td></tr>
      <tr><td style="padding:20px 24px">
        <p style="color:#14223a">Ciao ${esc(sub.nome)},<br>sono state pubblicate sul sito FIN ${events.length === 1 ? 'una nuova gara' : `${events.length} nuove gare`} del circuito Supermaster nei comitati che segui:</p>
        <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        ${safeSite ? `<p style="margin-top:20px"><a href="${esc(safeSite)}" style="background:#192b49;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Vedi calendario squadra</a></p>` : ''}
      </td></tr>
      <tr><td style="padding:16px 24px;background:#f5f7fb;font-size:12px;color:#566782">
        Servizio riservato agli atleti Nuoto Master della Canottieri Nino Bixio 1883. Dati tratti da federnuoto.it: verifica sempre la scheda ufficiale.<br>
        ${unsubscribe ? `<a href="${esc(unsubscribe)}" style="color:#566782">Annulla l'iscrizione</a>` : ''}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  const text = [
    `Ciao ${stripControlChars(sub.nome)},`,
    `nuove gare master pubblicate (${comitatoLabel}):`,
    '',
    ...events.map((e) => `- [${comitatoById(e.comitato)?.nome || e.comitato}] ${fmtRange(e)} | ${e.title} | ${e.citta || ''} ${e.provincia ? `(${e.provincia})` : ''}\n  ${safeHttpUrl(e.url) || ''}`),
    '',
    safeSite ? `Calendario completo: ${safeSite}` : '',
    unsubscribe ? `Annulla iscrizione: ${unsubscribe}` : '',
  ].join('\n');

  return { subject, html, text, unsubscribe };
}

export async function runNotify({
  env = process.env,
  dataFile = DEFAULT_DATA,
  stateFile = DEFAULT_STATE,
  fetchImpl = fetch,
  createTransport = nodemailer.createTransport.bind(nodemailer),
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const DRY_RUN = env.DRY_RUN === '1';
  const SITE_URL = (env.SITE_URL || '').replace(/\/$/, '');

  const data = await readJson(dataFile, null);
  if (!data?.events) throw new Error('public/data/gare.json mancante: esegui prima lo scraper.');

  const configured = env.APPS_SCRIPT_URL && env.APPS_SCRIPT_TOKEN && (DRY_RUN || (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS));
  if (!configured) {
    console.log('[notify] configurazione email/iscritti assente: salto l\'invio (nessuna modifica allo stato).');
    return { status: 'unconfigured', sent: 0, failed: 0 };
  }

  const state = await readJson(stateFile, null);
  if (!state) {
    await saveState(stateFile, { initializedAt: new Date().toISOString(), ids: data.events.map((e) => e.id) });
    console.log(`[notify] primo avvio: marcate ${data.events.length} gare come già note, nessuna email inviata.`);
    return { status: 'initialized', sent: 0, failed: 0 };
  }

  const known = new Set(state.ids);
  const nuove = data.events.filter((e) => !known.has(e.id));
  const daNotificare = nuove.filter((e) => e.comitato && (e.dateEnd || e.dateStart) >= today);
  console.log(`[notify] gare nuove: ${nuove.length}, da notificare: ${daNotificare.length}`);

  let sent = 0;
  let failed = 0;

  if (daNotificare.length) {
    const subscribers = await fetchSubscribers({
      appsScriptUrl: env.APPS_SCRIPT_URL,
      appsScriptToken: env.APPS_SCRIPT_TOKEN,
      fetchImpl,
    });
    console.log(`[notify] iscritti attivi: ${subscribers.length}`);

    const port = Number(env.SMTP_PORT || 465);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT non valida.');
    }
    const transporter = DRY_RUN ? null : createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    for (const sub of subscribers) {
      if (!isValidEmail(sub?.email)) {
        failed++;
        console.warn('[notify] email iscritto non valida, salto.');
        continue;
      }
      const subComitati = new Set(normalizeComitati(sub.comitati?.length ? sub.comitati : sub.comitato));
      const events = daNotificare.filter((e) => subComitati.has(e.comitato));
      if (!events.length) continue;
      const mail = buildEmail(sub, events, { appsScriptUrl: env.APPS_SCRIPT_URL, siteUrl: SITE_URL });
      if (DRY_RUN) {
        console.log(`[notify][dry-run] -> ${sub.email}: ${mail.subject}`);
        sent++;
        continue;
      }
      try {
        const displayName = sanitizeAddressName(sub.nome, sub.cognome);
        await transporter.sendMail({
          from: env.MAIL_FROM || env.SMTP_USER,
          to: displayName ? { name: displayName, address: sub.email.trim() } : sub.email.trim(),
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          headers: mail.unsubscribe ? { 'List-Unsubscribe': `<${mail.unsubscribe}>` } : {},
        });
        sent++;
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        failed++;
        console.error(`[notify] invio fallito per iscritto ${sub.id || '?'}: ${err.message}`);
      }
    }
    console.log(`[notify] email inviate: ${sent}, fallite: ${failed}`);
  }

  if (DRY_RUN) {
    console.log('[notify][dry-run] stato non aggiornato.');
    return { status: 'dry-run', sent, failed };
  }

  // Tutte le gare nuove (anche passate o senza comitato) vengono marcate come note.
  state.ids.push(...nuove.map((e) => e.id));
  state.lastRun = new Date().toISOString();
  await saveState(stateFile, state);
  return { status: 'sent', sent, failed };
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  runNotify().catch((err) => {
    console.error('[notify] ERRORE:', err);
    process.exit(1);
  });
}
