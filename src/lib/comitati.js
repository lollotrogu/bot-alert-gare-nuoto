// Comitati regionali FIN e mappatura sigla provincia -> comitato.
// Condiviso tra frontend (React) e script Node (scraper / notifier).

export const COMITATI = [
  { id: 'abruzzo', nome: 'Abruzzo', province: ['AQ', 'TE', 'PE', 'CH'] },
  { id: 'basilicata', nome: 'Basilicata', province: ['PZ', 'MT'] },
  { id: 'calabria', nome: 'Calabria', province: ['CS', 'CZ', 'RC', 'KR', 'VV'] },
  { id: 'campania', nome: 'Campania', province: ['CE', 'BN', 'NA', 'AV', 'SA'] },
  { id: 'emilia-romagna', nome: 'Emilia-Romagna', province: ['PC', 'PR', 'RE', 'MO', 'BO', 'FE', 'RA', 'FC', 'RN', 'FO'] },
  { id: 'friuli-venezia-giulia', nome: 'Friuli-Venezia Giulia', province: ['UD', 'GO', 'TS', 'PN'] },
  { id: 'lazio', nome: 'Lazio', province: ['VT', 'RI', 'RM', 'LT', 'FR'] },
  { id: 'liguria', nome: 'Liguria', province: ['IM', 'SV', 'GE', 'SP'] },
  { id: 'lombardia', nome: 'Lombardia', province: ['VA', 'CO', 'SO', 'MI', 'BG', 'BS', 'PV', 'CR', 'MN', 'LC', 'LO', 'MB'] },
  { id: 'marche', nome: 'Marche', province: ['PU', 'PS', 'AN', 'MC', 'AP', 'FM'] },
  { id: 'molise', nome: 'Molise', province: ['CB', 'IS'] },
  { id: 'piemonte-valle-d-aosta', nome: "Piemonte e Valle d'Aosta", province: ['TO', 'VC', 'NO', 'CN', 'AT', 'AL', 'BI', 'VB', 'AO'] },
  { id: 'puglia', nome: 'Puglia', province: ['FG', 'BA', 'TA', 'BR', 'LE', 'BT'] },
  { id: 'sardegna', nome: 'Sardegna', province: ['SS', 'NU', 'CA', 'OR', 'SU', 'CI', 'VS', 'OG', 'OT', 'GS'] },
  { id: 'sicilia', nome: 'Sicilia', province: ['TP', 'PA', 'ME', 'AG', 'CL', 'EN', 'CT', 'RG', 'SR'] },
  { id: 'toscana', nome: 'Toscana', province: ['MS', 'LU', 'PT', 'FI', 'LI', 'PI', 'AR', 'SI', 'GR', 'PO'] },
  { id: 'trentino-alto-adige', nome: 'Trentino-Alto Adige', province: ['TN', 'BZ'] },
  { id: 'umbria', nome: 'Umbria', province: ['PG', 'TR'] },
  { id: 'veneto', nome: 'Veneto', province: ['VR', 'VI', 'BL', 'TV', 'VE', 'PD', 'RO'] },
];

const PROV_TO_COMITATO = Object.fromEntries(
  COMITATI.flatMap((c) => c.province.map((p) => [p, c.id]))
);

// Fallback per località senza sigla (capoluoghi più comuni).
const CITY_TO_PROV = {
  roma: 'RM', milano: 'MI', napoli: 'NA', torino: 'TO', palermo: 'PA', genova: 'GE',
  bologna: 'BO', firenze: 'FI', bari: 'BA', catania: 'CT', venezia: 'VE', verona: 'VR',
  messina: 'ME', padova: 'PD', trieste: 'TS', brescia: 'BS', taranto: 'TA', prato: 'PO',
  parma: 'PR', modena: 'MO', 'reggio calabria': 'RC', 'reggio emilia': 'RE', perugia: 'PG',
  livorno: 'LI', ravenna: 'RA', cagliari: 'CA', foggia: 'FG', rimini: 'RN', salerno: 'SA',
  ferrara: 'FE', sassari: 'SS', latina: 'LT', pescara: 'PE', bergamo: 'BG', trento: 'TN',
  bolzano: 'BZ', vicenza: 'VI', ancona: 'AN', lecce: 'LE', udine: 'UD', "l'aquila": 'AQ',
  potenza: 'PZ', matera: 'MT', campobasso: 'CB', aosta: 'AO', belluno: 'BL', rovigo: 'RO',
  treviso: 'TV', crotone: 'KR', cosenza: 'CS', catanzaro: 'CZ', mantova: 'MN', lodi: 'LO',
  pisa: 'PI', lucca: 'LU', siena: 'SI', arezzo: 'AR', terni: 'TR', ostia: 'RM',
};

export const CLUB_INFO = {
  nome: 'Canottieri Nino Bixio 1883',
  citta: 'Piacenza',
  codiceFin: '153625',
  idSocietaFin: '31',
  defaultComitati: ['lombardia', 'emilia-romagna'],
};

export const AGONISTI_AUTHORIZED = {
  nome: 'Andrea',
  cognome: 'Frovi',
  cartellino: '123819',
};

function normName(s = '') {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normCard(s = '') {
  const d = String(s || '').replace(/\D+/g, '');
  return d ? d.replace(/^0+/, '') || '0' : '';
}

export function isAuthorizedAgonisti({ nome, cognome, cartellino } = {}) {
  return (
    normName(nome) === normName(AGONISTI_AUTHORIZED.nome) &&
    normName(cognome) === normName(AGONISTI_AUTHORIZED.cognome) &&
    normCard(cartellino) === AGONISTI_AUTHORIZED.cartellino
  );
}

export function comitatoById(id) {
  return COMITATI.find((c) => c.id === id) || null;
}

export function comitatoFromText(raw = '') {
  const s = normName(raw);
  if (!s) return null;
  for (const c of COMITATI) {
    if (s.includes(normName(c.nome))) return c.id;
  }
  if (s.includes('piemonte') || s.includes('valle d\'aosta') || s.includes('aosta')) return 'piemonte-valle-d-aosta';
  if (s.includes('trentin') || s.includes('bolzano') || s.includes('alto adige') || s.includes('trento')) return 'trentino-alto-adige';
  if (s.includes('friuli')) return 'friuli-venezia-giulia';
  if (s.includes('emilia')) return 'emilia-romagna';
  return null;
}

export function normalizeComitati(input) {
  const list = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const id = String(raw || '').trim();
    if (id && !seen.has(id) && comitatoById(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function formatComitati(input) {
  return normalizeComitati(input)
    .map((id) => comitatoById(id)?.nome || id)
    .join(', ');
}

export function isValidCartellino(raw) {
  const s = String(raw || '').trim();
  return /^\d{4,10}$/.test(s);
}

export function comitatoFromProvincia(sigla) {
  if (!sigla) return null;
  return PROV_TO_COMITATO[sigla.toUpperCase()] || null;
}

/** Estrae { citta, provincia } da stringhe tipo "Napoli (NA)", "Ostia - RM", "Bologna". */
export function parseLocalita(raw = '') {
  const s = raw.replace(/\s+/g, ' ').trim();
  let m = s.match(/^(.*?)\s*\(\s*([A-Za-z]{2})\s*\)\s*$/);
  if (m) return { citta: m[1].trim(), provincia: m[2].toUpperCase() };
  m = s.match(/^(.*?)\s*-\s*([A-Z]{2})\s*$/);
  if (m) return { citta: m[1].trim(), provincia: m[2] };
  const prov = CITY_TO_PROV[s.toLowerCase()] || null;
  return { citta: s, provincia: prov };
}
