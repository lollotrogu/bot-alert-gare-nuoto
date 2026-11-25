import { useState } from 'react';
import { assetUrl } from '../lib/api.js';
import { comitatoById } from '../lib/comitati.js';
import { dayMonth, rangeLabel, relativeLabel } from '../lib/format.js';
import { downloadIcs } from '../lib/ics.js';
import { safeHttpUrl } from '../lib/security.js';

const titleCase = (s = '') =>
  s.toLowerCase().replace(/(^|[\s'(.-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());

function pdfViewerHref(url) {
  return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}`;
}

export default function GaraCard({ ev, isNew, hasLocalPdf }) {
  const [open, setOpen] = useState(false);
  const start = dayMonth(ev.dateStart);
  const end = ev.dateEnd && ev.dateEnd !== ev.dateStart ? dayMonth(ev.dateEnd) : null;
  const comitato = comitatoById(ev.comitato);
  const rel = relativeLabel(ev);
  const past = rel === 'Conclusa';
  const mapsQuery = encodeURIComponent([ev.impianto, ev.indirizzo || `${ev.citta} ${ev.provincia || ''}`].filter(Boolean).join(', '));
  const finUrl = safeHttpUrl(ev.url);
  const locandinaUrl = safeHttpUrl(ev.locandinaUrl);
  const locandinaViewerUrl = hasLocalPdf
    ? assetUrl(`pdf/${encodeURIComponent(ev.id)}.pdf`)
    : locandinaUrl
      ? pdfViewerHref(locandinaUrl)
      : null;
  const risultatiUrl = safeHttpUrl(ev.risultatiUrl);
  const risultatiViewerUrl = risultatiUrl ? pdfViewerHref(risultatiUrl) : null;
  const iscrizioniUrl = safeHttpUrl(ev.iscrizioniUrl);

  return (
    <article className={`gara card ${past ? 'past' : ''}`}>
      <div className="gara-date" aria-label={rangeLabel(ev)}>
        <span className="d">{start.day}</span>
        <span className="m">{start.month}</span>
        {end && <span className="end">→ {end.day} {end.month}</span>}
      </div>
      <div className="gara-body">
        <div className="badges">
          {isNew && !past && <span className="badge new">Nuova</span>}
          <span className={`badge rel ${past ? 'muted' : ''}`}>{rel}</span>
          {comitato && <span className="badge region">{comitato.nome}</span>}
          {ev.tipo && <span className={`badge tipo ${ev.tipo === 'Federale' ? 'fed' : ''}`}>{ev.tipo}</span>}
          {ev.missingSince && <span className="badge warn" title="Scheda non più presente sul sito FIN">Da verificare</span>}
        </div>
        <h4 className="gara-title">{ev.title}</h4>
        <p className="gara-meta">
          <span>📍 {ev.citta}{ev.provincia ? ` (${ev.provincia})` : ''}</span>
          {ev.vasca && <span>🏊 {ev.vasca}</span>}
          {ev.iscrizioni && <span>📝 Iscrizioni {ev.iscrizioni}</span>}
        </p>

        {open && (
          <dl className="gara-details">
            {ev.categorie && (<><dt>Categorie</dt><dd>{ev.categorie}</dd></>)}
            {ev.impianto && (<><dt>Impianto</dt><dd>{titleCase(ev.impianto)}</dd></>)}
            {ev.indirizzo && (<><dt>Indirizzo</dt><dd>{ev.indirizzo}</dd></>)}
            {ev.organizzazione && (<><dt>Organizzazione</dt><dd>{titleCase(ev.organizzazione)}</dd></>)}
            {ev.tempiLimite && (<><dt>Tempi limite</dt><dd>{ev.tempiLimite}</dd></>)}
            <dt>Date</dt><dd>{rangeLabel(ev)}</dd>
            {locandinaUrl && (
              <>
                <dt>Download FIN</dt>
                <dd><a href={locandinaUrl} target="_blank" rel="noopener noreferrer">Scarica PDF originale</a></dd>
              </>
            )}
          </dl>
        )}

        <div className="gara-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Meno dettagli' : 'Dettagli'}
          </button>
          {finUrl && (
            <a className="btn btn-ghost btn-sm" href={finUrl} target="_blank" rel="noopener noreferrer">Scheda FIN ↗</a>
          )}
          {locandinaViewerUrl && (
            <a className="btn btn-ghost btn-sm" href={locandinaViewerUrl} target="_blank" rel="noopener noreferrer">Locandina PDF</a>
          )}
          {risultatiViewerUrl && (
            <a className="btn btn-ghost btn-sm" href={risultatiViewerUrl} target="_blank" rel="noopener noreferrer">Risultati</a>
          )}
          {iscrizioniUrl && !past && (
            <a className="btn btn-ghost btn-sm" href={iscrizioniUrl} target="_blank" rel="noopener noreferrer">Iscrizioni online</a>
          )}
          {!past && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadIcs(ev)}>📅 Calendario</button>
          )}
          <a className="btn btn-ghost btn-sm" href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`} target="_blank" rel="noopener noreferrer">Mappa</a>
        </div>
      </div>
    </article>
  );
}
