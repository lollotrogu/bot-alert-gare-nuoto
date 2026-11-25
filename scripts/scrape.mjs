// Scarica i calendari gare (Master e Agonisti) dal sito FIN e aggiorna public/data/gare*.json
// Uso: node scripts/scrape.mjs [master|agonisti]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getBaseParams, getSectorConfig, fetchCalendario, fetchRiepilogo, fetchDettaglio, normalizeEvent, sleep, DELAY_MS,
} from './lib/fin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = {
  master: path.join(ROOT, 'public', 'data', 'gare.json'),
  agonisti: path.join(ROOT, 'public', 'data', 'gare-agonisti.json'),
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function scrapeSector(sector) {
  const out = TARGETS[sector];
  if (!out) throw new Error(`Settore non valido: ${sector}`);

  const previous = await readJson(out, { events: [] });
  const prevById = new Map((previous.events || []).map((e) => [e.id, e]));
  const nowIso = new Date().toISOString();

  const cfg = getSectorConfig(sector);
  const baseParams = await getBaseParams(sector);
  console.log(`[scrape:${sector}] stagione ${baseParams['solr[stagione]']}`);

  const calendario = await fetchCalendario(baseParams);
  console.log(`[scrape:${sector}] calendario: ${calendario.length} eventi`);

  const bases = new Map(calendario.map((e) => [e.id, e]));
  if (sector === 'master') {
    try {
      const riepilogo = await fetchRiepilogo();
      console.log(`[scrape:master] riepilogo: ${riepilogo.length} eventi con scheda`);
      for (const r of riepilogo) if (!bases.has(r.id)) bases.set(r.id, r);
    } catch (err) {
      console.warn('[scrape:master] riepilogo non disponibile:', err.message);
    }
  }

  let detailErrors = 0;
  const rawEvents = await mapLimit([...bases.values()], 3, async (base) => {
    let det = null;
    try {
      det = await fetchDettaglio(base.id, baseParams);
    } catch (err) {
      detailErrors++;
      console.warn(`[scrape:${sector}] dettaglio ${base.id} non disponibile: ${err.message}`);
    }
    await sleep(DELAY_MS);
    const ev = normalizeEvent(base, det, { pageUrl: cfg.pageUrl });
    if (!/^\d+$/.test(ev.id) || !ev.dateStart || !/^\d{4}-\d{2}-\d{2}$/.test(ev.dateStart)) return null;
    const prev = prevById.get(ev.id);
    if (!det && prev) {
      ev.organizzazione = ev.organizzazione || prev.organizzazione;
      ev.impianto = ev.impianto || prev.impianto;
      ev.indirizzo = ev.indirizzo || prev.indirizzo;
      ev.iscrizioni = ev.iscrizioni || prev.iscrizioni;
      ev.categorie = ev.categorie || prev.categorie;
      ev.locandinaUrl = ev.locandinaUrl || prev.locandinaUrl;
      ev.iscrizioniUrl = ev.iscrizioniUrl || prev.iscrizioniUrl;
      ev.risultatiUrl = ev.risultatiUrl || prev.risultatiUrl;
      ev.comitato = ev.comitato || prev.comitato;
      ev.provincia = ev.provincia || prev.provincia;
    }
    ev.firstSeen = prev?.firstSeen || nowIso;
    return ev;
  });

  const events = rawEvents.filter(Boolean);
  const today = nowIso.slice(0, 10);
  for (const prev of prevById.values()) {
    if (!events.some((e) => e.id === prev.id) && (prev.dateEnd || prev.dateStart) >= today) {
      events.push({ ...prev, missingSince: prev.missingSince || nowIso });
    }
  }

  events.sort((a, b) => a.dateStart.localeCompare(b.dateStart) || a.title.localeCompare(b.title));

  if (!events.length && prevById.size) {
    throw new Error(`[scrape:${sector}] Nessun evento trovato: non sovrascrivo i dati esistenti.`);
  }

  const unknown = events.filter((e) => !e.comitato);
  if (unknown.length) {
    console.warn(`[scrape:${sector}] comitato non determinato per ${unknown.length} eventi (es. esteri o senza provincia)`);
  }

  const data = {
    updatedAt: nowIso,
    sector,
    season: baseParams['solr[stagione]'],
    source: cfg.pageUrl,
    count: events.length,
    detailErrors,
    events,
  };
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const nuovi = events.filter((e) => e.firstSeen === nowIso).length;
  console.log(`[scrape:${sector}] salvati ${events.length} eventi (${nuovi} nuovi) in ${path.relative(ROOT, out)}`);
}

async function main() {
  const arg = process.argv[2];
  const sectors = arg ? [arg] : ['master', 'agonisti'];
  for (const s of sectors) {
    await scrapeSector(s);
  }
}

main().catch((err) => {
  console.error('[scrape] ERRORE:', err);
  process.exit(1);
});
