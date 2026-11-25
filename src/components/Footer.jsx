import { assetUrl } from '../lib/api.js';
import { safeHttpUrl } from '../lib/security.js';

export default function Footer({ source, sector = 'master' }) {
  const fallback = sector === 'agonisti'
    ? 'https://www.federnuoto.it/home/nuoto.html'
    : 'https://www.federnuoto.it/home/master.html';
  const safeSource = safeHttpUrl(source) || fallback;
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <img
          className="footer-logo"
          src={assetUrl('logo-nino-bixio.jpg')}
          alt="Canottieri Nino Bixio 1883"
          width="36"
          height="36"
        />
        <p>
          <strong>Canottieri Nino Bixio 1883 · Piacenza</strong> — Servizio riservato alla squadra{' '}
          {sector === 'agonisti' ? 'Nuoto Agonisti' : 'Nuoto Master'}.
          Dati tratti dal calendario pubblico della{' '}
          <a href={safeSource} target="_blank" rel="noopener noreferrer">
            {sector === 'agonisti'
              ? 'Federazione Italiana Nuoto (Attività Agonistica)'
              : 'Federazione Italiana Nuoto (Circuito Supermaster)'}
          </a>
          : verifica sempre date, regolamenti e scadenze iscrizioni sulla scheda ufficiale della gara.
        </p>
      </div>
    </footer>
  );
}
