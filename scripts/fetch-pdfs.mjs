// Scarica le locandine PDF delle gare in programma in public/pdf/<id>.pdf
// in modo che GitHub Pages le serva con Content-Type: application/pdf (apertura diretta nel visualizzatore PDF)
// anziché Content-Disposition: attachment come fa federnuoto.it.
// public/pdf/ è in .gitignore: non viene committato nel repository Git.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeHttpUrl } from '../src/lib/security.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF_DIR = path.join(ROOT, 'public', 'pdf');
const MANIFEST = path.join(PDF_DIR, 'manifest.json');
const DATA_FILES = [
  path.join(ROOT, 'public', 'data', 'gare.json'),
  path.join(ROOT, 'public', 'data', 'gare-agonisti.json'),
];
const UA = 'bot-alert-gare-nuoto (+https://github.com) - cache locandine pdf';
const MAX_PDF_BYTES = 12 * 1024 * 1024;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function mapLimit(items, limit, fn) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function downloadPdf(id, url) {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl || !/^\d+$/.test(id)) return false;
  const out = path.join(PDF_DIR, `${id}.pdf`);
  try {
    const st = await fs.stat(out);
    if (st.size > 100) return true;
  } catch {}

  try {
    const res = await fetch(safeUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return false;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_PDF_BYTES) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES || buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return false;
    }
    await fs.writeFile(out, buf);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const targets = new Map();
  for (const file of DATA_FILES) {
    const data = await readJson(file, { events: [] });
    for (const ev of data.events || []) {
      if (!ev?.id || !ev?.locandinaUrl) continue;
      if ((ev.dateEnd || ev.dateStart || '') < today) continue;
      if (!targets.has(ev.id)) targets.set(ev.id, ev.locandinaUrl);
    }
  }

  await fs.mkdir(PDF_DIR, { recursive: true });

  // Rimuove eventuali PDF di gare ormai concluse
  for (const name of await fs.readdir(PDF_DIR)) {
    if (!name.endsWith('.pdf')) continue;
    const id = name.slice(0, -4);
    if (!targets.has(id)) {
      await fs.unlink(path.join(PDF_DIR, name)).catch(() => {});
    }
  }

  const available = [];
  let downloaded = 0;
  await mapLimit([...targets.entries()], 4, async ([id, url]) => {
    const existed = await fs.stat(path.join(PDF_DIR, `${id}.pdf`)).then(() => true, () => false);
    const ok = await downloadPdf(id, url);
    if (ok) {
      available.push(id);
      if (!existed) downloaded++;
    }
  });

  available.sort();
  await fs.writeFile(MANIFEST, JSON.stringify(available) + '\n', 'utf8');
  console.log(`[pdf] disponibili: ${available.length}/${targets.size} locandine (nuove: ${downloaded})`);
}

main().catch((err) => {
  console.error('[pdf] ERRORE:', err);
  process.exit(1);
});
