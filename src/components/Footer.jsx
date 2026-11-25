import { safeHttpUrl } from '../lib/security.js';

export default function Footer({ source }) {
  const safeSource = safeHttpUrl(source) || 'https://www.federnuoto.it/home/master.html';
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <img
          className="footer-logo"
          src={`${import.meta.env.BASE_URL}logo-nino-bixio.jpg`}
          alt="Canottieri Nino Bixio 1883"
          width="36"
          height="36"
        />
        <p>
          <strong>Canottieri Nino Bixio 1883 · Piacenza</strong> — Servizio riservato agli atleti della squadra Nuoto Master.
          Dati tratti dal calendario pubblico del{' '}
          <a href={safeSource} target="_blank" rel="noopener noreferrer">
            Circuito Supermaster della Federazione Italiana Nuoto
          </a>
          : verifica sempre date, regolamenti e scadenze iscrizioni sulla scheda ufficiale della gara.
        </p>
      </div>
    </footer>
  );
}
