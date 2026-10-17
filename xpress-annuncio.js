/* ===========================
   CSVXpressSmart — xpress-annuncio.js
   Presenta la nuova app Xpress (stesse funzioni + listino PDF con immagini)
   e permette di aprirla con un tocco.
   - Messaggio all'apertura, finché l'utente non sceglie "Non mostrare più".
   - Fascia fissa in alto con il collegamento a Xpress, sempre disponibile.
   Nessuna logica di CSVXpressSmart viene modificata.
   =========================== */

(function () {
  'use strict';

  const XPRESS_URL = 'https://www.alessandropezzali.it/xpress/';
  const HIDE_KEY = 'csvxpresssmart_xpress_annuncio_nascosto_v1';
  const SESSION_KEY = 'csvxpresssmart_xpress_annuncio_sessione_v1';

  const CSS = `
  .xa-banner{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;
    background:#0d47a1;color:#fff;padding:10px 14px;font:600 14px/1.3 Arial,Helvetica,sans-serif;text-align:center}
  .xa-banner a{color:#0d47a1;background:#fff;border-radius:999px;padding:6px 14px;text-decoration:none;font-weight:700;white-space:nowrap}
  .xa-overlay{position:fixed;inset:0;z-index:2000;background:rgba(15,23,42,.6);display:flex;align-items:center;
    justify-content:center;padding:16px}
  .xa-box{background:#fff;color:#333;border-radius:16px;max-width:460px;width:100%;max-height:90vh;overflow:auto;
    padding:22px 20px 18px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-family:Arial,Helvetica,sans-serif}
  .xa-box h2{margin:0 0 10px;font-size:22px;color:#2196f3}
  .xa-box p{margin:0 0 10px;line-height:1.45;font-size:15px}
  .xa-box ul{margin:0 0 10px;padding-left:20px;line-height:1.45;font-size:15px}
  .xa-small{font-size:13px!important;color:#6b7280}
  .xa-chk{display:flex;align-items:center;gap:8px;font-size:14px;margin:6px 0 2px;color:#444}
  .xa-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
  .xa-actions a,.xa-actions button{flex:1 1 160px;min-height:44px;margin:0;border-radius:10px;font:700 15px Arial,Helvetica,sans-serif;
    display:flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;max-width:none}
  .xa-go{background:#2196f3;color:#fff;border:0}
  .xa-later{background:#fff!important;color:#2196f3!important;border:1px solid #2196f3!important}
  body.xa-noscroll{overflow:hidden}
  `;

  function storageGet(store, k) { try { return store.getItem(k); } catch (_) { return null; } }
  function storageSet(store, k, v) { try { store.setItem(k, v); } catch (_) {} }

  function linkXpress(text, cls) {
    const a = document.createElement('a');
    a.href = XPRESS_URL;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;
    if (cls) a.className = cls;
    return a;
  }

  function addBanner() {
    const b = document.createElement('div');
    b.className = 'xa-banner';
    b.setAttribute('role', 'region');
    b.setAttribute('aria-label', 'Nuova app Xpress');
    const t = document.createElement('span');
    t.textContent = 'Novità: Xpress, con le foto degli articoli dal listino PDF';
    b.appendChild(t);
    b.appendChild(linkXpress('Apri Xpress →'));
    document.body.insertBefore(b, document.body.firstChild);
  }

  function showModal() {
    if (storageGet(localStorage, HIDE_KEY)) return;
    if (storageGet(sessionStorage, SESSION_KEY)) return;

    const ov = document.createElement('div');
    ov.className = 'xa-overlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'xaTitle');

    const box = document.createElement('div');
    box.className = 'xa-box';
    box.innerHTML = `
      <h2 id="xaTitle">Ti presentiamo Xpress</h2>
      <p>CSVXpressSmart si rinnova e diventa <strong>Xpress</strong>: trovi tutte le funzioni che già usi,
         cioè sconti, margini, trasporto e installazione, modalità Smart e report WhatsApp e TXT.</p>
      <p><strong>La novità:</strong> oltre al listino CSV o Excel puoi caricare anche il <strong>listino PDF</strong>.</p>
      <ul>
        <li>accanto a ogni codice vedi la foto dell’articolo;</li>
        <li>stampi o salvi in PDF il preventivo con le immagini.</li>
      </ul>
      <p>Il listino e le impostazioni che usi qui ti seguono: in Xpress li ritrovi già pronti.</p>
      <p class="xa-small">Come sempre, listini e preventivi restano solo sul tuo dispositivo.</p>
      <label class="xa-chk"><input type="checkbox" id="xaNoMore"> Non mostrare più questo messaggio</label>
    `;

    const actions = document.createElement('div');
    actions.className = 'xa-actions';
    const go = linkXpress('Apri Xpress', 'xa-go');
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'xa-later';
    later.textContent = 'Più tardi';

    const close = () => {
      const noMore = box.querySelector('#xaNoMore');
      if (noMore && noMore.checked) storageSet(localStorage, HIDE_KEY, String(Date.now()));
      storageSet(sessionStorage, SESSION_KEY, '1');
      ov.remove();
      document.body.classList.remove('xa-noscroll');
    };

    go.addEventListener('click', close);
    later.addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.isConnected) close(); });

    actions.appendChild(go);
    actions.appendChild(later);
    box.appendChild(actions);
    ov.appendChild(box);
    document.body.appendChild(ov);
    document.body.classList.add('xa-noscroll');
  }

  function start() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    addBanner();
    showModal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
