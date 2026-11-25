import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGONISTI_AUTHORIZED,
  COMITATI,
  comitatoById,
  comitatoFromProvincia,
  comitatoFromText,
  formatComitati,
  isAuthorizedAgonisti,
  isValidCartellino,
  normalizeComitati,
  parseLocalita,
} from '../src/lib/comitati.js';

test('COMITATI copre tutti i 19 comitati regionali FIN', () => {
  assert.equal(COMITATI.length, 19);
  const ids = new Set(COMITATI.map((c) => c.id));
  assert.equal(ids.size, 19);
  assert.equal(comitatoById('veneto')?.nome, 'Veneto');
  assert.equal(comitatoById('inesistente'), null);
});

test('comitatoFromProvincia mappa le sigle in maiuscolo e minuscolo', () => {
  assert.equal(comitatoFromProvincia('RM'), 'lazio');
  assert.equal(comitatoFromProvincia('tv'), 'veneto');
  assert.equal(comitatoFromProvincia('AO'), 'piemonte-valle-d-aosta');
  assert.equal(comitatoFromProvincia('BZ'), 'trentino-alto-adige');
  assert.equal(comitatoFromProvincia('XX'), null);
  assert.equal(comitatoFromProvincia(''), null);
});

test('parseLocalita estrae città e provincia dai formati FIN', () => {
  assert.deepEqual(parseLocalita('Monastier di Treviso (TV)'), { citta: 'Monastier di Treviso', provincia: 'TV' });
  assert.deepEqual(parseLocalita('Ostia - RM'), { citta: 'Ostia', provincia: 'RM' });
  assert.deepEqual(parseLocalita('  Verolanuova  ( bs ) '), { citta: 'Verolanuova', provincia: 'BS' });
  assert.deepEqual(parseLocalita('Bologna'), { citta: 'Bologna', provincia: 'BO' });
  assert.deepEqual(parseLocalita("L'Aquila"), { citta: "L'Aquila", provincia: 'AQ' });
  assert.deepEqual(parseLocalita('Località Sconosciuta'), { citta: 'Località Sconosciuta', provincia: null });
});

test('normalizeComitati, formatComitati e isValidCartellino validano multi-selezione e tessera FIN', () => {
  assert.deepEqual(
    normalizeComitati(['lombardia', 'emilia-romagna', 'lombardia', 'fake']),
    ['lombardia', 'emilia-romagna']
  );
  assert.deepEqual(normalizeComitati('veneto, lazio'), ['veneto', 'lazio']);
  assert.equal(formatComitati(['lombardia', 'emilia-romagna']), 'Lombardia, Emilia-Romagna');

  assert.equal(isValidCartellino('9650'), true);
  assert.equal(isValidCartellino('1058185'), true);
  assert.equal(isValidCartellino('123'), false);
  assert.equal(isValidCartellino('abc123'), false);

  assert.equal(comitatoFromText('COMITATO REGIONALE LIGURIA'), 'liguria');
  assert.equal(isAuthorizedAgonisti(AGONISTI_AUTHORIZED), true);
  assert.equal(isAuthorizedAgonisti({ nome: 'andrea', cognome: 'FROVI', cartellino: '00123819' }), true);
  assert.equal(isAuthorizedAgonisti({ nome: 'Mario', cognome: 'Rossi', cartellino: '123819' }), false);
  assert.equal(isAuthorizedAgonisti({ nome: 'Andrea', cognome: 'Frovi', cartellino: '999999' }), false);
});
