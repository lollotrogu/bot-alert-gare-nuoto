import { useMemo } from 'react';
import { COMITATI } from '../lib/comitati.js';
import { todayIso } from '../lib/format.js';

export default function Filters({ filters, setFilters, events }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const tipi = useMemo(() => [...new Set(events.map((e) => e.tipo).filter(Boolean))].sort(), [events]);
  const counts = useMemo(() => {
    const c = {};
    const today = todayIso();
    for (const e of events) if ((e.dateEnd || e.dateStart) >= today) c[e.comitato] = (c[e.comitato] || 0) + 1;
    return c;
  }, [events]);
  const active = filters.comitato || filters.q || filters.tipo || filters.vasca || filters.showPast || filters.onlyNew;

  return (
    <div className="filters card">
      <div className="filters-row">
        <label className="field grow">
          <span>Cerca</span>
          <input
            type="search"
            placeholder="Nome gara, città, impianto, società…"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Comitato regionale</span>
          <select value={filters.comitato} onChange={(e) => set({ comitato: e.target.value })}>
            <option value="">Tutta Italia</option>
            {COMITATI.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} {counts[c.id] ? `(${counts[c.id]})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filters-row">
        <label className="field">
          <span>Vasca</span>
          <select value={filters.vasca} onChange={(e) => set({ vasca: e.target.value })}>
            <option value="">Tutte</option>
            <option value="25">25 m</option>
            <option value="50">50 m</option>
          </select>
        </label>
        <label className="field">
          <span>Tipologia</span>
          <select value={filters.tipo} onChange={(e) => set({ tipo: e.target.value })}>
            <option value="">Tutte</option>
            {tipi.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.onlyNew} onChange={(e) => set({ onlyNew: e.target.checked })} />
          Solo novità
        </label>
        <label className="check">
          <input type="checkbox" checked={filters.showPast} onChange={(e) => set({ showPast: e.target.checked })} />
          Mostra concluse
        </label>
        {active && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setFilters({ comitato: '', q: '', tipo: '', vasca: '', showPast: false, onlyNew: false })}
          >
            Azzera filtri
          </button>
        )}
      </div>
    </div>
  );
}
