import test from 'node:test';
import assert from 'node:assert/strict';
import { safeHttpUrl, safeHttpsUrl, stripControlChars } from '../src/lib/security.js';
import { buildIcsContent } from '../src/lib/ics.js';

test('safeHttpUrl accetta solo http/https e blocca schemi pericolosi', () => {
  assert.equal(safeHttpUrl('https://www.federnuoto.it/gara'), 'https://www.federnuoto.it/gara');
  assert.equal(safeHttpUrl('http://portale.federnuoto.it'), 'http://portale.federnuoto.it/');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeHttpUrl('vbscript:msgbox(1)'), null);
  assert.equal(safeHttpUrl('not-a-url'), null);
  assert.equal(safeHttpUrl(''), null);
});

test('safeHttpsUrl richiede esplicitamente HTTPS', () => {
  assert.equal(safeHttpsUrl('https://script.google.com/macros/s/abc/exec'), 'https://script.google.com/macros/s/abc/exec');
  assert.equal(safeHttpsUrl('http://script.google.com/macros/s/abc/exec'), null);
});

test('stripControlChars rimuove CRLF e caratteri di controllo', () => {
  assert.equal(stripControlChars('Mario\r\nBcc: evil@example.com'), 'Mario Bcc: evil@example.com');
  assert.equal(stripControlChars('Test\x00\x1fValue'), 'Test Value');
});

test('buildIcsContent genera un iCalendar valido e previene ICS injection', () => {
  const ics = buildIcsContent(
    {
      id: '150148',
      title: 'Trofeo\r\nATTENDEE:mailto:evil@example.com',
      dateStart: '2027-01-09',
      dateEnd: '2027-01-10',
      impianto: 'Rosa Blu; Village',
      citta: 'Monastier',
      provincia: 'TV',
      vasca: 'Vasca da 50m',
      url: 'javascript:alert(1)',
    },
    '20261125T120000Z'
  );

  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270109\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20270111\r\n/);
  // Nessuna nuova proprietà ATTENDEE iniettata su riga separata
  assert.doesNotMatch(ics, /\r\nATTENDEE:/);
  assert.match(ics, /LOCATION:Rosa Blu\\; Village/);
  // URL javascript non incluso
  assert.doesNotMatch(ics, /URL:javascript:/);
});
