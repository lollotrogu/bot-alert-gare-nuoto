import { safeHttpsUrl } from './security.js';

// Comunicazione con la Web App Google Apps Script (archivio iscritti).
// L'URL viene iniettato in build da VITE_APPS_SCRIPT_URL (variabile del repository GitHub).
export const APPS_SCRIPT_URL = safeHttpsUrl(import.meta.env.VITE_APPS_SCRIPT_URL || '') || '';

export const isSubscribeConfigured = () => Boolean(APPS_SCRIPT_URL);

export function detectSector() {
  if (typeof window === 'undefined') return 'master';
  return /\/agonisti\/?$/.test(window.location.pathname) ? 'agonisti' : 'master';
}

export function assetUrl(relPath) {
  const clean = String(relPath || '').replace(/^\/+/, '');
  const prefix = detectSector() === 'agonisti' ? '../' : './';
  return `${prefix}${clean}`;
}

export async function subscribe(payload) {
  if (!APPS_SCRIPT_URL) throw new Error('Il servizio di iscrizione non è ancora configurato.');
  // text/plain evita la richiesta preflight CORS, non supportata da Apps Script.
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'subscribe', ...payload }),
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error('Risposta non valida dal servizio di iscrizione.');
  }
  if (!json || json.ok !== true) throw new Error(json?.error || 'Iscrizione non riuscita.');
  return json;
}

export async function loadGare(sector = 'master') {
  const file = sector === 'agonisti' ? 'data/gare-agonisti.json' : 'data/gare.json';
  const res = await fetch(assetUrl(file), {
    cache: 'no-cache',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Impossibile caricare il calendario (HTTP ${res.status}).`);
  const data = await res.json();
  if (!data || !Array.isArray(data.events)) {
    throw new Error('Formato dati calendario non valido.');
  }
  return data;
}
