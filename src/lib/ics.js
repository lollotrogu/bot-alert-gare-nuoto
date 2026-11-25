import { safeHttpUrl, stripControlChars } from './security.js';

// Genera un file .ics (iCalendar) per aggiungere una gara al proprio calendario.
const esc = (s = '') =>
  stripControlChars(String(s), { singleLine: false })
    .replace(/\r/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');

const compact = (iso) => iso.replace(/-/g, '');

function nextDay(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildIcsContent(ev, stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')) {
  const safeId = String(ev.id || 'evento').replace(/[^a-zA-Z0-9_-]/g, '');
  const location = [ev.impianto, ev.indirizzo || [ev.citta, ev.provincia && `(${ev.provincia})`].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const safeUrl = safeHttpUrl(ev.url);
  const description = [
    ev.vasca,
    ev.tipo,
    ev.iscrizioni && `Iscrizioni: ${ev.iscrizioni}`,
    ev.organizzazione && `Organizza: ${ev.organizzazione}`,
    safeUrl,
  ].filter(Boolean).join('\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Alert Gare Nuoto Master//IT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:fin-master-${safeId}@alert-gare-nuoto`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(ev.dateStart)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(ev.dateEnd || ev.dateStart))}`,
    `SUMMARY:${esc(`🏊 ${ev.title}`)}`,
    `LOCATION:${esc(location)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(safeUrl ? [`URL:${safeUrl}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export function downloadIcs(ev) {
  const content = buildIcsContent(ev);
  const safeId = String(ev.id || 'evento').replace(/[^a-zA-Z0-9_-]/g, '');
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gara-${safeId}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
