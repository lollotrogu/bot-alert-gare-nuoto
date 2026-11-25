import { useEffect, useState } from 'react';
import {
  AGONISTI_AUTHORIZED,
  CLUB_INFO,
  COMITATI,
  formatComitati,
  isAuthorizedAgonisti,
  isValidCartellino,
  normalizeComitati,
} from '../lib/comitati.js';
import { assetUrl, isSubscribeConfigured, subscribe } from '../lib/api.js';

const INITIAL_COMITATI = [...CLUB_INFO.defaultComitati];
const EMPTY = {
  nome: '',
  cognome: '',
  email: '',
  cartellino: '',
  comitati: INITIAL_COMITATI,
  privacy: false,
  website: '',
};

export default function SubscribeForm({ defaultComitato, sector = 'master', onClose }) {
  const isAgonisti = sector === 'agonisti';
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    comitati: defaultComitato
      ? normalizeComitati([defaultComitato, ...INITIAL_COMITATI])
      : INITIAL_COMITATI,
  }));
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const configured = isSubscribeConfigured();

  useEffect(() => {
    if (defaultComitato) {
      setForm((f) =>
        f.comitati.includes(defaultComitato)
          ? f
          : { ...f, comitati: normalizeComitati([...f.comitati, defaultComitato]) }
      );
    }
  }, [defaultComitato]);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const toggleComitato = (id) => {
    setForm((f) => {
      const exists = f.comitati.includes(id);
      const next = exists ? f.comitati.filter((c) => c !== id) : [...f.comitati, id];
      return { ...f, comitati: next };
    });
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (status.state === 'loading') return;
    const nome = form.nome.trim();
    const cognome = form.cognome.trim();
    const email = form.email.trim();
    const cartellino = form.cartellino.trim();
    if (!nome || !cognome) {
      setStatus({ state: 'error', message: 'Inserisci nome e cognome.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setStatus({ state: 'error', message: 'Inserisci un indirizzo email valido.' });
      return;
    }
    if (!isValidCartellino(cartellino)) {
      setStatus({ state: 'error', message: 'Inserisci un numero di cartellino FIN valido (4–10 cifre).' });
      return;
    }
    if (isAgonisti && !isAuthorizedAgonisti({ nome, cognome, cartellino })) {
      setStatus({
        state: 'error',
        message: `Gli alert per la sezione Agonisti sono riservati esclusivamente ad ${AGONISTI_AUTHORIZED.nome} ${AGONISTI_AUTHORIZED.cognome} (${AGONISTI_AUTHORIZED.cartellino}).`,
      });
      return;
    }
    if (!form.comitati.length) {
      setStatus({ state: 'error', message: 'Seleziona almeno un comitato regionale.' });
      return;
    }
    if (!form.privacy) {
      setStatus({ state: 'error', message: "Accetta l'informativa privacy per proseguire." });
      return;
    }
    setStatus({ state: 'loading', message: '' });
    try {
      const res = await subscribe({
        settore: sector,
        nome,
        cognome,
        email,
        cartellino,
        comitati: form.comitati,
        privacy: form.privacy,
        website: form.website,
      });
      const labelComitati = formatComitati(form.comitati);
      setStatus({
        state: 'success',
        message:
          res.status === 'update_pending'
            ? `Email già iscritta: ti abbiamo inviato un link a ${email} per confermare l'aggiornamento (${labelComitati}).`
            : res.status === 'updated'
              ? `Preferenze aggiornate: riceverai gli alert per ${labelComitati}.`
              : `Quasi fatto! Ti abbiamo inviato un'email a ${email}: clicca sul link per confermare l'iscrizione per ${labelComitati} (controlla anche lo spam).`,
      });
      setForm({ ...EMPTY, comitati: form.comitati });
    } catch (err) {
      setStatus({ state: 'error', message: err.message });
    }
  }

  return (
    <div className="subscribe" id="iscriviti">
      <div className="subscribe-head">
        <img src={assetUrl('favicon.svg')} alt="" width="34" height="34" />
        <div>
          <h3 id="subscribe-modal-title">
            {isAgonisti ? 'Alert email Agonisti Nino Bixio' : 'Alert email atleti Nino Bixio'}
          </h3>
          <p className="muted small">
            {isAgonisti
              ? `Riservato esclusivamente ad ${AGONISTI_AUTHORIZED.nome} ${AGONISTI_AUTHORIZED.cognome} (cartellino ${AGONISTI_AUTHORIZED.cartellino})`
              : `Riservato ai tesserati ${CLUB_INFO.nome} (cod. FIN ${CLUB_INFO.codiceFin})`}
          </p>
        </div>
      </div>

      {!configured && (
        <div className="alert warn small">
          Iscrizioni non ancora attive: manca la configurazione <code>VITE_APPS_SCRIPT_URL</code> (vedi README).
        </div>
      )}

      {status.state === 'success' ? (
        <div className="alert success" role="status" aria-live="polite">
          ✅ {status.message}
          <div className="modal-success-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus({ state: 'idle', message: '' })}>
              {isAgonisti ? 'Aggiorna preferenze' : "Iscrivi un'altra persona"}
            </button>
            {onClose && (
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                Chiudi
              </button>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate={false}>
          <div className="two">
            <label className="field">
              <span>Nome</span>
              <input
                required
                maxLength={60}
                autoComplete="given-name"
                placeholder={isAgonisti ? AGONISTI_AUTHORIZED.nome : ''}
                value={form.nome}
                onChange={set('nome')}
              />
            </label>
            <label className="field">
              <span>Cognome</span>
              <input
                required
                maxLength={60}
                autoComplete="family-name"
                placeholder={isAgonisti ? AGONISTI_AUTHORIZED.cognome : ''}
                value={form.cognome}
                onChange={set('cognome')}
              />
            </label>
          </div>
          <div className="two two-email">
            <label className="field">
              <span>Email</span>
              <input required type="email" maxLength={120} autoComplete="email" value={form.email} onChange={set('email')} />
            </label>
            <label className="field">
              <span>Cartellino FIN</span>
              <input
                required
                type="text"
                inputMode="numeric"
                pattern="\d{4,10}"
                maxLength={10}
                placeholder={isAgonisti ? AGONISTI_AUTHORIZED.cartellino : 'es. 156321'}
                title={
                  isAgonisti
                    ? `Riservato al cartellino ${AGONISTI_AUTHORIZED.cartellino}`
                    : `Numero di cartellino verificato tra i tesserati ${CLUB_INFO.nome}`
                }
                value={form.cartellino}
                onChange={(e) => setForm((f) => ({ ...f, cartellino: e.target.value.replace(/\D+/g, '') }))}
              />
            </label>
          </div>

          <fieldset className="field comitati-fieldset">
            <div className="comitati-head">
              <legend>
                <span>Comitati ({form.comitati.length} sel.)</span>
              </legend>
              <div className="comitati-quick">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setForm((f) => ({ ...f, comitati: [...CLUB_INFO.defaultComitati] }))}
                >
                  LO + ER
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setForm((f) => ({ ...f, comitati: [] }))}
                >
                  Azzera
                </button>
              </div>
            </div>
            <div className="comitati-grid" role="group" aria-label="Comitati regionali">
              {COMITATI.map((c) => {
                const checked = form.comitati.includes(c.id);
                return (
                  <label key={c.id} className={`comitato-chip ${checked ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleComitato(c.id)}
                    />
                    <span>{c.nome}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* honeypot anti-spam: invisibile agli utenti */}
          <input className="hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} aria-hidden="true" />
          <label className="check xs">
            <input type="checkbox" required checked={form.privacy} onChange={set('privacy')} />
            <span>
              Acconsento al trattamento dei dati (nome, email, cartellino) per la verifica squadra e l'invio degli alert. Cancellazione in ogni email.
            </span>
          </label>
          {status.state === 'error' && <div className="alert error small" role="alert" aria-live="polite">⚠️ {status.message}</div>}
          <button className="btn btn-primary block" disabled={!configured || status.state === 'loading'}>
            {status.state === 'loading' ? 'Verifica e invio…' : 'Iscriviti agli alert'}
          </button>
        </form>
      )}
    </div>
  );
}
