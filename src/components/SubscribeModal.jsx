import { useEffect, useRef } from 'react';
import SubscribeForm from './SubscribeForm.jsx';

export default function SubscribeModal({ open, onClose, defaultComitato, sector = 'master' }) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="subscribe-modal-title">
        <button
          ref={closeBtnRef}
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Chiudi finestra iscrizione"
        >
          ✕
        </button>
        <SubscribeForm defaultComitato={defaultComitato} sector={sector} onClose={onClose} />
      </div>
    </div>
  );
}
