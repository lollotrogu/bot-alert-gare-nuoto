import { useEffect, useMemo, useState } from 'react';
import { detectSector, assetUrl, loadGare } from './lib/api.js';
import { AGONISTI_AUTHORIZED, CLUB_INFO, comitatoById } from './lib/comitati.js';
import { dateTime, todayIso } from './lib/format.js';
import Header from './components/Header.jsx';
import Filters from './components/Filters.jsx';
import GareList from './components/GareList.jsx';
import SubscribeModal from './components/SubscribeModal.jsx';
import Footer from './components/Footer.jsx';

function usePersistentFilters(sector) {
  const key = `agnm:filters:${sector}`;
  const [filters, setFilters] = useState(() => {
    const defaults = { comitato: '', q: '', tipo: '', vasca: '', showPast: false, onlyNew: false };
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}'), q: '' };
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    const { q, ...persist } = filters;
    localStorage.setItem(key, JSON.stringify(persist));
  }, [filters, key]);
  return [filters, setFilters];
}

const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function App() {
  const sector = useMemo(() => detectSector(), []);
  const isAgonisti = sector === 'agonisti';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = usePersistentFilters(sector);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    loadGare(sector).then(setData).catch((err) => setError(err.message));
  }, [sector]);

  const events = data?.events || [];
  const today = todayIso();
  const newSince = useMemo(() => new Date(Date.now() - 7 * 86400000).toISOString(), []);

  const filtered = useMemo(() => {
    const q = norm(filters.q.trim());
    return events.filter((e) => {
      if (!filters.showPast && (e.dateEnd || e.dateStart) < today) return false;
      if (filters.comitato && e.comitato !== filters.comitato) return false;
      if (filters.tipo && e.tipo !== filters.tipo) return false;
      if (filters.vasca && !e.vasca.includes(filters.vasca)) return false;
      if (filters.onlyNew && !(e.firstSeen >= newSince)) return false;
      if (q) {
        const hay = norm(
          [e.title, e.citta, e.provincia, e.impianto, e.organizzazione, e.categorie, comitatoById(e.comitato)?.nome].join(' ')
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, filters, today, newSince]);

  const upcoming = events.filter((e) => (e.dateEnd || e.dateStart) >= today);
  const stats = {
    upcoming: upcoming.length,
    nuove: upcoming.filter((e) => e.firstSeen >= newSince).length,
    comitati: new Set(upcoming.map((e) => e.comitato).filter(Boolean)).size,
  };

  return (
    <>
      <Header
        sector={sector}
        stats={stats}
        updatedAt={data?.updatedAt}
        onOpenSubscribe={() => setModalOpen(true)}
      />
      <main className="container main-content">
        <div className="card alert-banner">
          <div className="alert-banner-info">
            <img src={assetUrl('favicon.svg')} alt="" width="36" height="36" />
            <div>
              <strong>
                {isAgonisti
                  ? `Alert email Agonisti ${CLUB_INFO.nome}`
                  : `Alert email per atleti ${CLUB_INFO.nome}`}
              </strong>
              <p className="muted small">
                {isAgonisti
                  ? `Sezione dedicata alle gare Agonisti FIN. L'invio alert via email è riservato esclusivamente a ${AGONISTI_AUTHORIZED.nome} ${AGONISTI_AUTHORIZED.cognome} (${AGONISTI_AUTHORIZED.cartellino}).`
                  : 'Registrati con il tuo numero di cartellino FIN per ricevere un\'email appena esce una nuova gara nei comitati che preferisci.'}
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
            {isAgonisti ? 'Attiva alert Agonisti' : 'Attiva alert via email'}
          </button>
        </div>

        <section aria-labelledby="gare-title">
          <div className="section-head">
            <h2 id="gare-title">{isAgonisti ? 'Gare Agonisti in programma' : 'Gare Master in programma'}</h2>
            {data && (
              <span className="muted small">
                Aggiornato il {dateTime(data.updatedAt)} · stagione {data.season}/{Number(data.season) + 1}
              </span>
            )}
          </div>
          <Filters filters={filters} setFilters={setFilters} events={events} />
          {error && <div className="alert error">⚠️ {error}</div>}
          {!data && !error && <div className="loading"><span className="spinner" /> Caricamento calendario…</div>}
          {data && <GareList events={filtered} newSince={newSince} />}
        </section>

        <section className="card info-card info-strip" aria-label="Come funziona">
          <h3>Come funziona per la squadra</h3>
          <ol className="info-steps">
            <li>
              Ogni 6 ore il sistema legge in automatico il calendario FIN (
              <b>{isAgonisti ? 'Attività Agonistica Nuoto' : 'Circuito Supermaster'}</b>).
            </li>
            <li>
              {isAgonisti
                ? `Quando compare una nuova gara agonistica nei comitati selezionati, l'email viene inviata esclusivamente ad ${AGONISTI_AUTHORIZED.nome} ${AGONISTI_AUTHORIZED.cognome} (${AGONISTI_AUTHORIZED.cartellino}).`
                : 'Quando compare una nuova gara, gli atleti Nino Bixio iscritti ricevono un\'email per i comitati scelti.'}
            </li>
            <li>Ogni email include locandina, scheda FIN e link per modificare o annullare l'iscrizione.</li>
          </ol>
        </section>
      </main>
      <SubscribeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultComitato={filters.comitato}
        sector={sector}
      />
      <Footer source={data?.source} sector={sector} />
    </>
  );
}
