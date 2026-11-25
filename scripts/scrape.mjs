// Scarica il calendario gare master dal sito FIN e aggiorna public/data/gare.json
// Uso: node scripts/scrape.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getBaseParams, fetchCalendario, fetchRiepilogo, fetchDettaglio, normalizeEvent, sleep, DELAY_MS,
} from './lib/fin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data', 'gare.json');

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const previous = await readJson(OUT, { events: [] });
  const prevById = new Map((previous.events || []).map((e) => [e.id, e]));
  const nowIso = new Date().toISOString();

  const baseParams = await getBaseParams();
  console.log('[scrape] stagione', baseParams['solr[stagione]']);

  const calendario = await fetchCalendario(baseParams);
  console.log(`[scrape] calendario: ${calendario.length} eventi`);

  let riepilogo = [];
  try {
    riepilogo = await fetchRiepilogo();
    console.log(`[scrape] riepilogo: ${riepilogo.length} eventi con scheda`);
  } catch (err) {
    console.warn('[scrape] riepilogo non disponibile:', err.message);
  }

  const bases = new Map(calendario.map((e) => [e.id, e]));
  for (const r of riepilogo) if (!bases.has(r.id)) bases.set(r.id, r);

  const events = [];
  let detailErrors = 0;
  for (const base of bases.values()) {
    let det = null;
    try {
      det = await fetchDettaglio(base.id, baseParams);
    } catch (err) {
      detailErrors++;
      console.warn(`[scrape] dettaglio ${base.id} non disponibile: ${err.message}`);
    }
    await sleep(DELAY_MS);
    const ev = normalizeEvent(base, det);
    if (!/^\d+$/.test(ev.id) || !ev.dateStart || !/^\d{4}-\d{2}-\d{2}$/.test(ev.dateStart)) continue;
    const prev = prevById.get(ev.id);
    // Se il dettaglio fallisce momentaneamente, conserva i metadati precedenti anziché svuotarli.
    if (!det && prev) {
      ev.organizzazione = ev.organizzazione || prev.organizzazione;
      ev.impianto = ev.impianto || prev.impianto;
      ev.indirizzo = ev.indirizzo || prev.indirizzo;
      ev.iscrizioni = ev.iscrizioni || prev.iscrizioni;
      ev.locandinaUrl = ev.locandinaUrl || prev.locandinaUrl;
      ev.iscrizioniUrl = ev.iscrizioniUrl || prev.iscrizioniUrl;
      ev.risultatiUrl = ev.risultatiUrl || prev.risultatiUrl;
      ev.comitato = ev.comitato || prev.comitato;
      ev.provincia = ev.provincia || prev.provincia;
    }
    ev.firstSeen = prev?.firstSeen || nowIso;
    events.push(ev);
  }

  // Mantieni eventi visti in precedenza e spariti dal calendario solo se non ancora passati
  // (evita "buchi" se FIN rimuove temporaneamente una scheda).
  const today = nowIso.slice(0, 10);
  for (const prev of prevById.values()) {
    if (!events.some((e) => e.id === prev.id) && (prev.dateEnd || prev.dateStart) >= today) {
      events.push({ ...prev, missingSince: prev.missingSince || nowIso });
    }
  }

  events.sort((a, b) => a.dateStart.localeCompare(b.dateStart) || a.title.localeCompare(b.title));

  if (!events.length && prevById.size) {
    throw new Error('Nessun evento trovato: probabile cambio del sito FIN, non sovrascrivo i dati esistenti.');
  }

  const unknown = events.filter((e) => !e.comitato);
  if (unknown.length) {
    console.warn('[scrape] comitato non determinato per:', unknown.map((e) => `${e.id} ${e.title} (${e.citta} ${e.provincia || '?'})`).join('; '));
  }

  const data = {
    updatedAt: nowIso,
    season: baseParams['solr[stagione]'],
    source: 'https://www.federnuoto.it/home/master/circuito-supermaster/eventi-circuito-supermaster.html',
    count: events.length,
    detailErrors,
    events,
  };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const nuovi = events.filter((e) => e.firstSeen === nowIso).length;
  console.log(`[scrape] salvati ${events.length} eventi (${nuovi} nuovi) in ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error('[scrape] ERRORE:', err);
  process.exit(1);
});
