const dayFmt = new Intl.DateTimeFormat('it-IT', { day: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('it-IT', { month: 'short' });
const fullFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const toDate = (iso) => new Date(`${iso}T12:00:00`);

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function dayMonth(iso) {
  const d = toDate(iso);
  return { day: dayFmt.format(d), month: monthFmt.format(d).replace('.', '') };
}

export function fullDate(iso) {
  return fullFmt.format(toDate(iso));
}

export function rangeLabel(ev) {
  if (!ev.dateEnd || ev.dateEnd === ev.dateStart) return fullDate(ev.dateStart);
  return `${fullDate(ev.dateStart)} – ${fullDate(ev.dateEnd)}`;
}

export function dateTime(iso) {
  return dateTimeFmt.format(new Date(iso));
}

export function daysFrom(iso) {
  return Math.round((toDate(iso) - toDate(todayIso())) / 86400000);
}

export function relativeLabel(ev) {
  const start = daysFrom(ev.dateStart);
  const end = daysFrom(ev.dateEnd || ev.dateStart);
  if (end < 0) return 'Conclusa';
  if (start <= 0) return 'In corso';
  if (start === 1) return 'Domani';
  if (start < 7) return `Tra ${start} giorni`;
  if (start < 60) return `Tra ${Math.round(start / 7)} settimane`;
  return `Tra ${Math.round(start / 30)} mesi`;
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function monthTitle(key) {
  const d = toDate(`${key}-01`);
  const s = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
