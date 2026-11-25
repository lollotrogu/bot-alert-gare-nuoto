import { monthKey, monthTitle } from '../lib/format.js';
import GaraCard from './GaraCard.jsx';

export default function GareList({ events, newSince }) {
  if (!events.length) {
    return (
      <div className="empty card">
        <div className="empty-icon">🏊‍♀️</div>
        <p>Nessuna gara trovata con i filtri selezionati.</p>
        <p className="muted small">Iscriviti agli alert: ti scriveremo appena ne viene pubblicata una.</p>
      </div>
    );
  }

  const groups = [];
  for (const ev of events) {
    const key = monthKey(ev.dateStart);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
    groups[groups.length - 1].items.push(ev);
  }

  return (
    <div className="gare">
      <p className="muted small">{events.length} {events.length === 1 ? 'gara' : 'gare'}</p>
      {groups.map((g) => (
        <section key={g.key} className="month">
          <h3 className="month-title">{monthTitle(g.key)}</h3>
          <div className="month-items">
            {g.items.map((ev) => (
              <GaraCard key={ev.id} ev={ev} isNew={ev.firstSeen >= newSince} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
