import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCalendario, fetchDettaglio, fetchRiepilogo, normalizeEvent } from '../scripts/lib/fin.mjs';

test('normalizeEvent ricava il comitato dalla sede se manca nella località breve', () => {
  const ev = normalizeEvent(
    {
      id: '150148',
      title: '10° Trofeo Casa di Caccia',
      dates: ['2027-01-09'],
      localita: 'Monastier di Treviso',
      vasca: 'Vasca da 50m',
      tipo: 'Extrafederale',
      alias: 'risultati/150148:casa-di-caccia.html',
    },
    {
      title: '10° Trofeo Casa di Caccia',
      dates: ['2027-01-10', '2027-01-09'],
      info: {
        Organizzazione: 'NORD EST H2O',
        Impianto: 'ROSA BLU',
        Sede: 'VIA PISANI, 12 - Monastier di Treviso (TV)',
        'Base Vasca': '50',
      },
      locandinaUrl: 'javascript:alert(1)',
      iscrizioniUrl: 'http://portale.federnuoto.it',
      risultatiUrl: null,
    }
  );

  assert.equal(ev.id, '150148');
  assert.equal(ev.dateStart, '2027-01-09');
  assert.equal(ev.dateEnd, '2027-01-10');
  assert.equal(ev.provincia, 'TV');
  assert.equal(ev.comitato, 'veneto');
  assert.equal(ev.locandinaUrl, null);
  assert.equal(ev.iscrizioniUrl, 'http://portale.federnuoto.it/');
  assert.match(ev.url, /^https:\/\/www\.federnuoto\.it\/.*#\/risultati\/150148:/);
});

test('fetchCalendario, fetchDettaglio e fetchRiepilogo parsano correttamente HTML FIN mockato', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('view=calendario')) {
      return new Response(
        JSON.stringify({
          status: 'OK',
          content: `
            <div class="nat_eve_container Extrafederale">
              <div class="nat_eve_date"><span class="nat_eve_d">13</span><span class="nat_eve_m">Dicembre</span><span class="nat_eve_y">2026</span></div>
              <h4 class="nat_eve_title"><span>2° Trofeo Città di Rovigo</span></h4>
              <p class="nat_eve_pool">Vasca da 25m</p>
              <p class="nat_eve_loc">Rovigo (RO)</p>
              <span data-id="150120" data-alias="risultati/150120:rovigo.html">Dettaglio</span>
            </div>`,
        }),
        { status: 200 }
      );
    }
    if (String(url).includes('view=risultati')) {
      return new Response(
        JSON.stringify({
          status: 'OK',
          content: `
            <div class="details_nat_eve_list">
              <div class="infos"><h3>2° Trofeo Città di Rovigo</h3></div>
              <div class="nat_eve_dates"><div class="nat_eve_date"><span class="nat_eve_d">13</span><span class="nat_eve_m">Dicembre</span><span class="nat_eve_y">2026</span></div></div>
              <div class="nat_eve_infos">
                <p><span class="lbl">Locandina</span><a href="/files/rovigo.pdf">scarica</a></p>
                <p><span class="lbl">Sede</span><span class="vle">Viale della Costituzione - Rovigo (RO)</span></p>
              </div>
            </div>`,
        }),
        { status: 200 }
      );
    }
    if (String(url).includes('riepilogo-eventi.html')) {
      return new Response(
        `<table class="records"><caption><h3>2026</h3></caption><tbody>
          <tr><td>13/12</td><td>Trofeo Rovigo</td><td>Rovigo</td><td><a href="/home/master/circuito-supermaster/eventi-circuito-supermaster.html#/risultati/150120:rovigo.html">x</a></td></tr>
        </tbody></table>`,
        { status: 200 }
      );
    }
    return new Response('not found', { status: 404 });
  };

  try {
    const base = { 'solr[id_settore]': '1', 'solr[id_tipologia_1]': '2', 'solr[stagione]': '2026' };
    const cal = await fetchCalendario(base);
    assert.equal(cal.length, 1);
    assert.equal(cal[0].id, '150120');

    const det = await fetchDettaglio('150120', base);
    assert.equal(det.locandinaUrl, 'https://www.federnuoto.it/files/rovigo.pdf');
    assert.equal(det.info.Sede, 'Viale della Costituzione - Rovigo (RO)');

    const riep = await fetchRiepilogo();
    assert.equal(riep.length, 1);
    assert.deepEqual(riep[0].dates, ['2026-12-13']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
