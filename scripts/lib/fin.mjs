// Client per il sito federnuoto.it (Circuito Supermaster).
// Usa lo stesso endpoint JSON pubblico chiamato dalla pagina
// https://www.federnuoto.it/home/master/circuito-supermaster/eventi-circuito-supermaster.html
import { parse } from 'node-html-parser';
import { comitatoFromProvincia, parseLocalita } from '../../src/lib/comitati.js';
import { safeHttpUrl, stripControlChars } from '../../src/lib/security.js';

export const FIN_BASE = 'https://www.federnuoto.it';
const EVENTI_PAGE = `${FIN_BASE}/home/master/circuito-supermaster/eventi-circuito-supermaster.html`;
const RIEPILOGO_PAGE = `${FIN_BASE}/home/master/circuito-supermaster/riepilogo-eventi.html`;
const API = `${FIN_BASE}/index.php?option=com_solrconnect&format=json`;

const UA = 'bot-alert-gare-nuoto (+https://github.com) - aggiornamento calendario master';
const DELAY_MS = 300;

const MESI = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s = '') =>
  stripControlChars(s.replace(/&nbsp;/g, ' ').replace(/&#96;/g, '`'));
const pad = (n) => String(n).padStart(2, '0');

function safeFinHref(href) {
  if (!href || typeof href !== 'string') return null;
  try {
    return safeHttpUrl(new URL(href.trim(), FIN_BASE).href);
  } catch {
    return null;
  }
}

function safeAlias(raw, id) {
  if (!raw || typeof raw !== 'string') return `risultati/${id}:evento.html`;
  const trimmed = raw.trim();
  if (/^risultati\/\d+:[^<>"{}|\\^`\x00-\x1f]+$/i.test(trimmed)) return trimmed;
  return `risultati/${id}:evento.html`;
}

async function fetchText(url, options = {}, retries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { 'User-Agent': UA, ...(options.headers || {}) },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} su ${url}`);
      return await res.text();
    } catch (err) {
      if (i >= retries) throw err;
      await sleep(1500 * i);
    }
  }
}

async function apiCall(view, params, page = 1) {
  const body = new URLSearchParams(params);
  const txt = await fetchText(`${API}&view=${view}&currentpage=${page}`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
  });
  const json = JSON.parse(txt);
  if (json.status !== 'OK') throw new Error(`Risposta FIN non OK (${view}): ${clean(json.content || '').slice(0, 200)}`);
  return json.content || '';
}

/** Legge dalla pagina FIN i filtri nascosti (settore, tipologia, stagione corrente). */
export async function getBaseParams() {
  const now = new Date();
  const fallbackSeason = String(now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1);
  const params = {
    'solr[id_settore]': '1',
    'solr[id_tipologia_1]': '2',
    'solr[stagione]': fallbackSeason,
  };
  try {
    const html = await fetchText(EVENTI_PAGE);
    for (const m of html.matchAll(/type="hidden"\s+data-filter="solr"\s+name="(solr\[[a-z_0-9]+\])"\s+value="([^"]*)"/g)) {
      params[m[1]] = clean(m[2]);
    }
  } catch (err) {
    console.warn('[fin] impossibile leggere i filtri dalla pagina, uso i default:', err.message);
  }
  return params;
}

function parseDates(root) {
  return root.querySelectorAll('.nat_eve_date').map((d) => {
    const day = Number(clean(d.querySelector('.nat_eve_d')?.text));
    const month = MESI[clean(d.querySelector('.nat_eve_m')?.text).toLowerCase()];
    const year = Number(clean(d.querySelector('.nat_eve_y')?.text));
    return day >= 1 && day <= 31 && month && year >= 2000 && year <= 2100
      ? `${year}-${pad(month)}-${pad(day)}`
      : null;
  }).filter(Boolean);
}

/** Elenco eventi della stagione dal calendario Supermaster. */
export async function fetchCalendario(baseParams) {
  const events = new Map();
  for (let page = 1; page <= 10; page++) {
    const html = await apiCall('calendario', baseParams, page);
    const root = parse(html);
    const containers = root.querySelectorAll('.nat_eve_container');
    if (!containers.length) break;
    let added = 0;
    for (const c of containers) {
      const id = c.querySelector('[data-id]')?.getAttribute('data-id');
      if (!id || !/^\d+$/.test(id) || events.has(id)) continue;
      const tipo = clean((c.getAttribute('class') || '').replace('nat_eve_container', ''));
      events.set(id, {
        id,
        title: clean(c.querySelector('.nat_eve_title span')?.text || c.querySelector('.nat_eve_title')?.text),
        dates: parseDates(c),
        localita: clean(c.querySelector('.nat_eve_loc')?.text),
        vasca: clean(c.querySelector('.nat_eve_pool')?.text),
        tipo,
        alias: c.querySelector('[data-alias]')?.getAttribute('data-alias') || null,
      });
      added++;
    }
    if (!added) break; // la paginazione restituisce sempre la stessa lista
    await sleep(DELAY_MS);
  }
  return [...events.values()];
}

/** Id evento presenti nella tabella "Riepilogo eventi" (pagina redazionale), per completezza. */
export async function fetchRiepilogo() {
  const html = await fetchText(RIEPILOGO_PAGE);
  const root = parse(html);
  const out = [];
  for (const table of root.querySelectorAll('table.records')) {
    const year = Number(clean(table.querySelector('caption')?.text)) || null;
    for (const tr of table.querySelectorAll('tbody tr')) {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 3) continue;
      const href = tds[3]?.querySelector('a')?.getAttribute('href') || '';
      const m = href.match(/risultati\/(\d+):([^"]+)/);
      if (!m) continue; // senza scheda non c'è un id stabile
      const dm = clean(tds[0].text).match(/(\d{1,2})(?:[-_]\d{1,2})?\/(\d{1,2})/);
      out.push({
        id: m[1],
        alias: `risultati/${m[1]}:${m[2]}`,
        title: clean(tds[1].text),
        localita: clean(tds[2].text),
        dates: dm && year ? [`${year}-${pad(dm[2])}-${pad(dm[1])}`] : [],
      });
    }
  }
  return out;
}

/** Scheda dettaglio di un evento. */
export async function fetchDettaglio(id, baseParams) {
  const html = await apiCall('risultati', { ...baseParams, 'solr[id_evento]': id });
  const root = parse(html);
  const info = {};
  let locandinaUrl = null;
  let iscrizioniUrl = null;
  let risultatiUrl = null;
  for (const p of root.querySelectorAll('.nat_eve_infos p')) {
    const label = clean(p.querySelector('.lbl')?.text);
    if (!label) continue;
    const a = p.querySelector('a');
    if (/locandina|regolamento|bando/i.test(label) && a) {
      locandinaUrl = safeFinHref(a.getAttribute('href'));
      continue;
    }
    if (/iscrizioni on-line/i.test(label) && a) {
      iscrizioniUrl = safeFinHref(a.getAttribute('href'));
      continue;
    }
    if (/risultati/i.test(label)) {
      if (a) risultatiUrl = safeFinHref(a.getAttribute('href'));
      continue;
    }
    info[label] = clean(p.querySelector('.vle')?.text);
  }
  return {
    title: clean(root.querySelector('.infos h3')?.text),
    dates: parseDates(root.querySelector('.nat_eve_dates') || root),
    info,
    locandinaUrl,
    iscrizioniUrl,
    risultatiUrl,
  };
}

/** Normalizza un evento nel formato pubblicato in public/data/gare.json */
export function normalizeEvent(base, det) {
  const id = String(base.id || '').replace(/\D+/g, '');
  const dates = (det?.dates?.length ? det.dates : base.dates || []).slice().sort();
  const info = det?.info || {};
  const sede = clean(info['Sede'] || '');
  let { citta, provincia } = parseLocalita(base.localita || '');
  if (!provincia && sede) {
    const fromSede = parseLocalita(sede.split(' - ').pop());
    provincia = fromSede.provincia;
    citta = citta || fromSede.citta;
  }
  const alias = safeAlias(base.alias, id);
  return {
    id,
    title: clean(det?.title || base.title),
    dateStart: dates[0] || null,
    dateEnd: dates[dates.length - 1] || null,
    citta: clean(citta),
    provincia,
    comitato: comitatoFromProvincia(provincia),
    vasca: clean(base.vasca || (info['Base Vasca'] ? `Vasca da ${info['Base Vasca']}m` : '')),
    tipo: clean(base.tipo || ''),
    organizzazione: clean(info['Organizzazione'] || ''),
    impianto: clean(info['Impianto'] || ''),
    indirizzo: sede,
    iscrizioni: clean(info['Inizio/Chiusura iscrizioni'] || ''),
    tempiLimite: clean(info['Tempi Limite'] || ''),
    info,
    locandinaUrl: safeHttpUrl(det?.locandinaUrl) || null,
    iscrizioniUrl: safeHttpUrl(det?.iscrizioniUrl) || null,
    risultatiUrl: safeHttpUrl(det?.risultatiUrl) || null,
    url: `${EVENTI_PAGE}#/${alias}`,
  };
}

export { sleep, DELAY_MS };
