import { dateTime } from '../lib/format.js';

export default function Header({ stats, updatedAt, onOpenSubscribe }) {
  return (
    <header className="hero">
      <div className="waves" aria-hidden="true" />
      <div className="container hero-inner">
        <div className="brand-bar">
          <div className="brand">
            <img
              className="brand-logo"
              src={`${import.meta.env.BASE_URL}logo-nino-bixio.jpg`}
              alt="Logo Canottieri Nino Bixio 1883 Piacenza"
              width="68"
              height="68"
            />
            <div className="brand-text">
              <span className="brand-club">Canottieri Nino Bixio 1883</span>
              <span className="brand-sub">Piacenza · Squadra Nuoto Master</span>
            </div>
          </div>
          <span className="club-pill">Riservato agli atleti Nino Bixio</span>
        </div>

        <div className="hero-grid">
          <div className="hero-copy">
            <h1>Alert Gare Nuoto Master<br />Circuito Supermaster FIN</h1>
            <p className="lead">
              Il calendario ufficiale delle gare master sempre aggiornato per la squadra Canottieri Nino Bixio, con notifica email appena viene pubblicata una nuova manifestazione nel comitato selezionato.
            </p>
            <div className="stats">
              <div className="stat"><b>{stats.upcoming}</b><span>gare in programma</span></div>
              <div className="stat"><b>{stats.nuove}</b><span>novità ultimi 7 giorni</span></div>
              <div className="stat"><b>{stats.comitati}</b><span>comitati coinvolti</span></div>
            </div>
            <div className="hero-cta">
              <button type="button" className="btn btn-light" onClick={onOpenSubscribe}>
                Attiva alert atleti
              </button>
              {updatedAt && <span className="hero-updated">Ultimo controllo FIN: {dateTime(updatedAt)}</span>}
            </div>
          </div>
          <div className="hero-emblem" aria-hidden="true">
            <img
              src={`${import.meta.env.BASE_URL}logo-nino-bixio.jpg`}
              alt=""
              width="160"
              height="160"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
