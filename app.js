/* ===========================
   CSVXpressSmart — app.js
   Fix: decimali con virgola + report smart formattato + tabella stabile
   =========================== */

// Registra il Service Worker (PWA)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .then(reg => console.log("Service Worker registrato", reg))
    .catch(err => console.error("Service Worker non registrato", err));
}

// Variabili globali
let listino = [];
let articoliAggiunti = [];
let autoPopolaCosti = true;
let mostraDettagliServizi = true;

// -------------------- HELPERS NUMERICI (virgola/decimali) --------------------
function parseDec(val) {
  // accetta: "60,43" / "60.43" / "  60,43  " / "" -> 0
  const s = String(val ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtDec(num, decimals = 2, trim = true) {
  if (!Number.isFinite(num)) return '';
  let s = Number(num).toFixed(decimals);
  if (trim) s = s.replace(/\.?0+$/, '');
  return s.replace('.', ',');
}

function roundTwo(num) { return Math.round(num * 100) / 100; }
function clamp(num, min, max) { return Math.max(min, Math.min(max, num)); }

// Mantiene il valore "in digitazione" senza forzare formati mentre scrivi (evita che la virgola venga “mangiata”)
function sanitizeDecimalTyping(str) {
  let s = String(str ?? '');
  // consenti solo numeri, - (inizio), virgola/punto
  s = s.replace(/[^\d,.\-]/g, '');
  // solo un eventuale '-' all’inizio
  s = s.replace(/(?!^)-/g, '');
  // se ci sono più separatori, tieni il primo e rimuovi gli altri
  const firstSep = s.search(/[.,]/);
  if (firstSep !== -1) {
    const head = s.slice(0, firstSep + 1);
    const tail = s.slice(firstSep + 1).replace(/[.,]/g, '');
    s = head + tail;
  }
  return s;
}

// -------------------- CSV MEMORY (IndexedDB) --------------------
const CSV_DB_NAME = 'csvxpresssmart_db_v1';
const CSV_STORE = 'kv';
const CSV_KEY = 'last_csv_payload';

function openCsvDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CSV_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CSV_STORE)) db.createObjectStore(CSV_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openCsvDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CSV_STORE, 'readwrite');
    tx.objectStore(CSV_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openCsvDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CSV_STORE, 'readonly');
    const req = tx.objectStore(CSV_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(key) {
  const db = await openCsvDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CSV_STORE, 'readwrite');
    tx.objectStore(CSV_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function csvFingerprintFromFile(file) {
  if (!file) return null;
  return `${file.name}|${file.size}|${file.lastModified}`;
}

function formatDateTime(ts) {
  try { return new Date(ts).toLocaleString('it-IT'); } catch (_) { return ''; }
}

function updateSavedCsvInfoUI(payload) {
  const info = document.getElementById('savedCsvInfo');
  if (!info) return;

  if (!payload || !payload.listino?.length) {
    info.textContent = 'Nessun CSV salvato.';
    return;
  }

  const name = payload.meta?.name ? `“${payload.meta.name}”` : 'CSV';
  const when = payload.savedAt ? formatDateTime(payload.savedAt) : '';
  const rows = payload.listino?.length || 0;

  info.textContent = `Salvato: ${name} • Righe: ${rows}${when ? ' • ' + when : ''}`;
}

async function saveLastCsvPayload({ listinoRows, meta }) {
  const remember = document.getElementById('toggleRememberCSV');
  if (remember && !remember.checked) return;

  const payload = { savedAt: Date.now(), meta: meta || {}, listino: listinoRows || [] };

  try {
    await idbSet(CSV_KEY, payload);
    updateSavedCsvInfoUI(payload);
  } catch (e) {
    console.warn('Impossibile salvare CSV in IndexedDB:', e);
  }
}

async function loadLastCsvPayload() {
  try { return await idbGet(CSV_KEY); }
  catch (e) { console.warn('Impossibile leggere CSV da IndexedDB:', e); return null; }
}

async function clearLastCsvPayload() {
  try { await idbDel(CSV_KEY); }
  catch (e) { console.warn('Impossibile cancellare CSV da IndexedDB:', e); }
  updateSavedCsvInfoUI(null);
}

async function tryAutoLoadSavedCsvOnStart() {
  const payload = await loadLastCsvPayload();
  updateSavedCsvInfoUI(payload);

  if (payload && Array.isArray(payload.listino) && payload.listino.length) {
    listino = payload.listino;
    const err = document.getElementById("csvError");
    if (err) err.style.display = "none";
    aggiornaListinoSelect();
  }
}

function bindCsvMemoryUI() {
  const btnLoad = document.getElementById('btnLoadSavedCSV');
  const btnClear = document.getElementById('btnClearSavedCSV');

  if (btnLoad) {
    btnLoad.addEventListener('click', async () => {
      const payload = await loadLastCsvPayload();
      if (!payload || !payload.listino?.length) {
        alert('Nessun CSV salvato trovato.');
        return;
      }
      listino = payload.listino;
      const err = document.getElementById("csvError");
      if (err) err.style.display = "none";
      aggiornaListinoSelect();
      updateSavedCsvInfoUI(payload);
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      await clearLastCsvPayload();
      alert('CSV salvato cancellato.');
    });
  }

  loadLastCsvPayload().then(updateSavedCsvInfoUI).catch(() => {});
}

function normalizeListino(rows) {
  return rows.map(row => ({
    codice: (row["Codice"] || "").trim(),
    descrizione: (row["Descrizione"] || "").trim(),
    prezzoLordo: parseDec(row["PrezzoLordo"] || "0"),
    sconto: 0,
    sconto2: 0,
    margine: 0,
    costoTrasporto: parseDec(row["CostoTrasporto"] || "0"),
    costoInstallazione: parseDec(row["CostoInstallazione"] || "0"),
    quantita: 1,
    venduto: 0
  }));
}

// --- SMART SETTINGS
const SMART_KEY = 'csvxpresssmart_settings_v1';
let smartSettings = {
  smartMode: false,
  showVAT: false,
  vatRate: 22,
  hideVenduto: true,
  hideDiff: true,
  hideDiscounts: true,
  // (index.html ha il checkbox, qui lo gestiamo senza rompere nulla anche se non lo usi)
  showClientDiscount: false
};

function loadSmartSettings() {
  try {
    const raw = localStorage.getItem(SMART_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    smartSettings = { ...smartSettings, ...obj };
  } catch (_) {}
}

function saveSmartSettings() {
  try { localStorage.setItem(SMART_KEY, JSON.stringify(smartSettings)); } catch (_) {}
}

// -------------------- SCONTO EQUIVALENTE CLIENTE (UI) --------------------
function updateEquivalentDiscountDisplay() {
  const el = document.getElementById('smartEquivalentDiscount');
  if (!el) return;

  let base = 0;
  let final = 0;

  articoliAggiunti.forEach(a => {
    const qta = a.quantita || 1;
    const prezzoLordo = a.prezzoLordo || 0;
    const r = computeRow(a);
    base += (prezzoLordo * qta);
    final += (r.conMargineUnit * qta);
  });

  base = roundTwo(base);
  final = roundTwo(final);

  if (!base || base <= 0) {
    el.textContent = '—';
    return;
  }

  let eq = (1 - (final / base)) * 100;
  eq = clamp(eq, -9999, 9999);

  el.textContent = `${eq.toFixed(2)}%`;
}

// -------------------- INIT --------------------
document.addEventListener("DOMContentLoaded", function () {
  loadSmartSettings();

  // Micro-fix layout tabella (stabilizza allineamento colonne anche senza toccare style.css)
  const table = document.getElementById('articoli-table');
  if (table) {
    table.style.width = '100%';
    table.style.tableLayout = 'fixed';
    table.style.borderCollapse = 'collapse';
  }

  bindCsvMemoryUI();
  tryAutoLoadSavedCsvOnStart();

  document.getElementById("csvFileInput").addEventListener("change", handleCSVUpload);
  document.getElementById("searchListino").addEventListener("input", aggiornaListinoSelect);

  // Checkboxes (già presenti)
  const checkbox1 = document.createElement("label");
  checkbox1.innerHTML = `
    <input type="checkbox" id="toggleCosti" checked onchange="togglePopolaCosti()"> Popola automaticamente Trasporto e Installazione
  `;
  document.getElementById("upload-section").appendChild(checkbox1);

  const checkbox2 = document.createElement("label");
  checkbox2.innerHTML = `
    <br><input type="checkbox" id="toggleMostraServizi" checked> Mostra dettagli Trasporto/Installazione nel report
  `;
  document.getElementById("upload-section").appendChild(checkbox2);

  // Bottone manuale
  const manualButton = document.createElement("button");
  manualButton.textContent = "Aggiungi Articolo Manualmente";
  manualButton.onclick = mostraFormArticoloManuale;
  document.getElementById("listino-section").appendChild(manualButton);

  bindSmartControls();

  // Prima render
  renderTabellaArticoli();          // crea righe e input una sola volta
  aggiornaTotaliGenerali();
  applyColumnVisibility();
  updateEquivalentDiscountDisplay();
});

// -------------------- SMART CONTROLS --------------------
function bindSmartControls() {
  const elSmart = document.getElementById('toggleSmartMode');
  const elVat = document.getElementById('toggleShowVAT');
  const elVatRate = document.getElementById('vatRate');
  const elHideVenduto = document.getElementById('toggleHideVenduto');
  const elHideDiff = document.getElementById('toggleHideDiff');
  const elHideDiscounts = document.getElementById('toggleHideDiscounts');
  const elShowClientDiscount = document.getElementById('toggleShowClientDiscount');

  if (elSmart) elSmart.checked = !!smartSettings.smartMode;
  if (elVat) elVat.checked = !!smartSettings.showVAT;
  if (elVatRate) elVatRate.value = smartSettings.vatRate ?? 22;
  if (elHideVenduto) elHideVenduto.checked = !!smartSettings.hideVenduto;
  if (elHideDiff) elHideDiff.checked = !!smartSettings.hideDiff;
  if (elHideDiscounts) elHideDiscounts.checked = !!smartSettings.hideDiscounts;
  if (elShowClientDiscount) elShowClientDiscount.checked = !!smartSettings.showClientDiscount;

  const onChange = () => {
    smartSettings.smartMode = !!elSmart?.checked;
    smartSettings.showVAT = !!elVat?.checked;

    const rate = parseDec(elVatRate?.value || '22');
    smartSettings.vatRate = clamp(rate, 0, 100);

    smartSettings.hideVenduto = !!elHideVenduto?.checked;
    smartSettings.hideDiff = !!elHideDiff?.checked;
    smartSettings.hideDiscounts = !!elHideDiscounts?.checked;
    smartSettings.showClientDiscount = !!elShowClientDiscount?.checked;

    // Se smart attivo: forza alcune scelte
    if (smartSettings.smartMode) {
      smartSettings.hideVenduto = true;
      smartSettings.hideDiff = true;
      smartSettings.hideDiscounts = true;
    }

    saveSmartSettings();
    window.track?.smart_toggle?.({ key: 'settings', val: JSON.stringify(smartSettings) });

    applyColumnVisibility();
    aggiornaCalcoliRighe();   // aggiorna SOLO celle numeriche, senza ricreare input
    aggiornaTotaliGenerali();
    updateEquivalentDiscountDisplay();
  };

  [elSmart, elVat, elVatRate, elHideVenduto, elHideDiff, elHideDiscounts, elShowClientDiscount]
    .filter(Boolean)
    .forEach(el => el.addEventListener('change', onChange));
}

function applyColumnVisibility() {
  const hideVenduto = smartSettings.smartMode ? true : smartSettings.hideVenduto;
  const hideDiff = smartSettings.smartMode ? true : smartSettings.hideDiff;

  setColHidden('venduto', hideVenduto);
  setColHidden('diff', hideDiff);

  // smart: nascondo margine e prezzo lordo (interno)
  setColHidden('margine', smartSettings.smartMode);
  setColHidden('prezzoLordo', smartSettings.smartMode);
}

function setColHidden(colKey, hidden) {
  document.querySelectorAll(`th[data-col="${colKey}"]`).forEach(th => th.classList.toggle('col-hidden', !!hidden));
  document.querySelectorAll(`td[data-col="${colKey}"]`).forEach(td => td.classList.toggle('col-hidden', !!hidden));
}

// -------------------- POPOLA COSTI --------------------
function togglePopolaCosti() {
  autoPopolaCosti = document.getElementById("toggleCosti").checked;
  const secondCheckbox = document.getElementById("toggleMostraServizi");
  secondCheckbox.disabled = !autoPopolaCosti;
  mostraDettagliServizi = secondCheckbox.checked;

  articoliAggiunti = articoliAggiunti.map(articolo => {
    const listinoOriginale = listino.find(item => item.codice === articolo.codice);
    return {
      ...articolo,
      costoTrasporto: autoPopolaCosti && listinoOriginale ? listinoOriginale.costoTrasporto : 0,
      costoInstallazione: autoPopolaCosti && listinoOriginale ? listinoOriginale.costoInstallazione : 0
    };
  });

  renderTabellaArticoli();
  aggiornaTotaliGenerali();
  updateEquivalentDiscountDisplay();
}

// -------------------- CSV UPLOAD --------------------
function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  window.track?.csv_upload_start?.({ method: 'file_input' });
  window.track?.csv_upload_ok?.({ method: 'file_input', file });

  const t0 = performance.now();

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      const ms = Math.round(performance.now() - t0);

      if (!results.data.length) {
        document.getElementById("csvError").style.display = "block";
        window.track?.csv_parse_error?.({ code: 'empty_or_no_rows', ms });
        return;
      }

      listino = normalizeListino(results.data);

      saveLastCsvPayload({
        listinoRows: listino,
        meta: { name: file.name, size: file.size, lastModified: file.lastModified, fp: csvFingerprintFromFile(file) }
      });

      const rows = listino.length;
      const cols = Array.isArray(results.meta?.fields) ? results.meta.fields.length : undefined;
      window.track?.csv_parse_ok?.({ rows, cols, ms });

      document.getElementById("csvError").style.display = "none";
      aggiornaListinoSelect();
    },
    error: function(err) {
      const ms = Math.round(performance.now() - t0);
      console.error("Errore CSV:", err);
      document.getElementById("csvError").style.display = "block";
      window.track?.csv_parse_error?.({ code: 'papaparse_error', ms });
    }
  });
}

function aggiornaListinoSelect() {
  const select = document.getElementById("listinoSelect");
  const searchTerm = document.getElementById("searchListino").value.toLowerCase();
  select.innerHTML = "";

  listino.forEach((item) => {
    if (item.codice.toLowerCase().includes(searchTerm) || item.descrizione.toLowerCase().includes(searchTerm)) {
      const option = document.createElement("option");
      option.value = item.codice;
      option.textContent = `${item.codice} - ${item.descrizione} - €${roundTwo(item.prezzoLordo).toFixed(2)}`;
      select.appendChild(option);
    }
  });
}

function aggiungiArticoloDaListino() {
  window.track?.add_item_listino?.();

  const select = document.getElementById("listinoSelect");
  if (!select.value) return;

  const articolo = listino.find(item => item.codice === select.value);
  if (!articolo) {
    alert("Errore: articolo non trovato nel listino.");
    return;
  }

  const nuovoArticolo = { ...articolo };
  if (!autoPopolaCosti) {
    nuovoArticolo.costoTrasporto = 0;
    nuovoArticolo.costoInstallazione = 0;
  }

  articoliAggiunti.push(nuovoArticolo);
  renderTabellaArticoli();
  aggiornaTotaliGenerali();
  updateEquivalentDiscountDisplay();
}

// -------------------- CALCOLI RIGA --------------------
function computeRow(articolo) {
  const sconto1 = clamp(parseDec(articolo.sconto || 0), 0, 100);
  const sconto2 = clamp(parseDec(articolo.sconto2 || 0), 0, 100);

  const prezzoLordo = parseDec(articolo.prezzoLordo || 0);
  const prezzoScontato = prezzoLordo * (1 - sconto1 / 100) * (1 - sconto2 / 100);
  const totaleNettoUnit = roundTwo(prezzoScontato);

  const margine = clamp(parseDec(articolo.margine || 0), 0, 99.99);
  const conMargineUnit = roundTwo(totaleNettoUnit / (1 - margine / 100));

  const qta = Math.max(1, parseInt(articolo.quantita || 1, 10) || 1);

  const serviziUnit = roundTwo(parseDec(articolo.costoTrasporto || 0) + parseDec(articolo.costoInstallazione || 0));
  const granTotRiga = roundTwo((conMargineUnit + serviziUnit) * qta);

  const venduto = parseDec(articolo.venduto || 0);
  const differenza = roundTwo(venduto - granTotRiga);

  const nettoCadSmart = roundTwo(granTotRiga / qta);

  return { sconto1, sconto2, totaleNettoUnit, conMargineUnit, qta, serviziUnit, granTotRiga, venduto, differenza, nettoCadSmart };
}

// -------------------- TABELLA: RENDER 1 VOLTA + UPDATE CELLE --------------------
function renderTabellaArticoli() {
  const tableBody = document.querySelector("#articoli-table tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  articoliAggiunti.forEach((articolo, index) => {
    const r = computeRow(articolo);

    const row = document.createElement("tr");
    row.dataset.index = String(index);

    row.innerHTML = `
      <td data-col="codice">${articolo.codice}</td>
      <td data-col="descrizione">${articolo.descrizione}</td>

      <td data-col="prezzoLordo" class="cell-prezzoLordo">${roundTwo(parseDec(articolo.prezzoLordo)).toFixed(2)}€</td>

      <td data-col="sconto1">
        <input class="cell-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
          value="${fmtDec(r.sconto1, 2, true)}"
          data-index="${index}" data-field="sconto" />
      </td>

      <td data-col="sconto2">
        <input class="cell-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
          value="${fmtDec(r.sconto2, 2, true)}"
          data-index="${index}" data-field="sconto2" />
      </td>

      <td data-col="margine">
        <input class="cell-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
          value="${fmtDec(parseDec(articolo.margine || 0), 2, true)}"
          data-index="${index}" data-field="margine" />
      </td>

      <td data-col="totaleNetto" class="cell-totaleNetto">${r.totaleNettoUnit.toFixed(2)}€</td>

      <td data-col="trasporto">
        <input class="cell-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
          value="${fmtDec(parseDec(articolo.costoTrasporto || 0), 2, true)}"
          data-index="${index}" data-field="costoTrasporto" />
      </td>

      <td data-col="installazione">
        <input class="cell-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
          value="${fmtDec(parseDec(articolo.costoInstallazione || 0), 2, true)}"
          data-index="${index}" data-field="costoInstallazione" />
      </td>

      <td data-col="qta">
        <input class="cell-input" type="number" min="1" step="1"
          value="${r.qta}"
          data-index="${index}" data-field="quantita" />
      </td>

      <td data-col="granTot" class="cell-granTot">${r.granTotRiga.toFixed(2)}€</td>

      <td data-col="venduto">
        <input class="cell-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
          value="${fmtDec(r.venduto, 2, true)}"
          data-index="${index}" data-field="venduto" />
      </td>

      <td data-col="diff" class="cell-diff">${r.differenza.toFixed(2)}€</td>

      <td data-col="azioni"><button onclick="rimuoviArticolo(${index})">Rimuovi</button></td>
    `;

    tableBody.appendChild(row);
  });

  // Delegation: una sola volta (ma sicuro) — rimuovo prima per evitare doppioni
  tableBody.removeEventListener('input', onTableInput, true);
  tableBody.addEventListener('input', onTableInput, true);

  // Micro stile input (stabilizza layout)
  tableBody.querySelectorAll('input.cell-input').forEach(inp => {
    inp.style.width = '100%';
    inp.style.boxSizing = 'border-box';
  });

  applyColumnVisibility();
}

function onTableInput(e) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;

  const idx = parseInt(target.dataset.index || '-1', 10);
  const field = target.dataset.field || '';
  if (idx < 0 || !field) return;

  // Per i campi testuali decimali: permetti virgola e non distruggere il testo mentre digita
  if (field !== 'quantita') {
    const cleaned = sanitizeDecimalTyping(target.value);
    if (cleaned !== target.value) {
      const pos = target.selectionStart ?? cleaned.length;
      target.value = cleaned;
      try { target.setSelectionRange(pos, pos); } catch (_) {}
    }
  }

  // Aggiorna solo il dato in memoria (senza re-render della tabella)
  if (field === 'quantita') {
    let v = parseInt(String(target.value || '1'), 10) || 1;
    if (v < 1) v = 1;
    articoliAggiunti[idx][field] = v;
  } else {
    let v = parseDec(target.value);
    if (field === "sconto" || field === "sconto2") v = clamp(v, 0, 100);
    if (field === "margine") v = clamp(v, 0, 99.99);
    if (field === "costoTrasporto" || field === "costoInstallazione" || field === "venduto") v = Math.max(0, v);
    articoliAggiunti[idx][field] = v;
  }

  // Aggiorna SOLO celle calcolate della riga (mantieni focus e caret)
  aggiornaCalcoliRiga(idx);

  // Totali e sconto equivalente
  aggiornaTotaliGenerali();
  updateEquivalentDiscountDisplay();
}

function aggiornaCalcoliRiga(index) {
  const row = document.querySelector(`#articoli-table tbody tr[data-index="${index}"]`);
  if (!row) return;

  const articolo = articoliAggiunti[index];
  const r = computeRow(articolo);

  const tdTotaleNetto = row.querySelector('.cell-totaleNetto');
  const tdGranTot = row.querySelector('.cell-granTot');
  const tdDiff = row.querySelector('.cell-diff');
  const tdPrezzoLordo = row.querySelector('.cell-prezzoLordo');

  if (tdPrezzoLordo) tdPrezzoLordo.textContent = `${roundTwo(parseDec(articolo.prezzoLordo)).toFixed(2)}€`;
  if (tdTotaleNetto) tdTotaleNetto.textContent = `${r.totaleNettoUnit.toFixed(2)}€`;
  if (tdGranTot) tdGranTot.textContent = `${r.granTotRiga.toFixed(2)}€`;
  if (tdDiff) tdDiff.textContent = `${r.differenza.toFixed(2)}€`;
}

function aggiornaCalcoliRighe() {
  for (let i = 0; i < articoliAggiunti.length; i++) aggiornaCalcoliRiga(i);
}

// -------------------- RIMOZIONE --------------------
function rimuoviArticolo(index) {
  window.track?.remove_item?.();
  articoliAggiunti.splice(index, 1);
  renderTabellaArticoli();
  aggiornaTotaliGenerali();
  updateEquivalentDiscountDisplay();
}

// -------------------- TOTALI --------------------
function aggiornaTotaliGenerali() {
  let totaleSenzaServizi = 0;
  let totaleConServizi = 0;
  let totaleVenduto = 0;
  let totaleDifferenzaSconto = 0;

  articoliAggiunti.forEach(articolo => {
    const r = computeRow(articolo);
    totaleSenzaServizi += r.conMargineUnit * r.qta;
    totaleConServizi += r.granTotRiga;
    totaleVenduto += r.venduto;
    totaleDifferenzaSconto += r.differenza;
  });

  const imponibile = autoPopolaCosti ? roundTwo(totaleConServizi) : roundTwo(totaleSenzaServizi);
  const vatRate = clamp(parseDec(smartSettings.vatRate ?? 22), 0, 100);
  const iva = roundTwo(imponibile * (vatRate / 100));
  const totaleIvato = roundTwo(imponibile + iva);

  let totaleDiv = document.getElementById("totaleGenerale");
  if (!totaleDiv) {
    totaleDiv = document.createElement("div");
    totaleDiv.id = "totaleGenerale";
    totaleDiv.style.padding = "1em";
    document.getElementById("report-section").insertAdjacentElement("beforebegin", totaleDiv);
  }

  const smart = !!smartSettings.smartMode;

  let html = "";
  if (!smart) {
    html += `<strong>Totale Netto (senza Trasporto/Installazione):</strong> ${totaleSenzaServizi.toFixed(2)}€<br>`;
    html += `<strong>Totale Complessivo (inclusi Trasporto/Installazione):</strong> ${totaleConServizi.toFixed(2)}€<br>`;
    html += `<strong>Totale Venduto:</strong> ${totaleVenduto.toFixed(2)}€<br>`;
    html += `<strong>Totale Differenza Sconto:</strong> ${totaleDifferenzaSconto.toFixed(2)}€`;
  } else {
    html += `<strong>Imponibile:</strong> ${imponibile.toFixed(2)}€<br>`;
    if (smartSettings.showVAT) {
      html += `<strong>IVA (${vatRate.toFixed(1)}%):</strong> ${iva.toFixed(2)}€<br>`;
      html += `<strong>Totale + IVA:</strong> ${totaleIvato.toFixed(2)}€`;
    } else {
      html += `<strong>Totale:</strong> ${imponibile.toFixed(2)}€`;
    }
  }

  if (!smart && smartSettings.showVAT) {
    html += `<br><br><strong>Imponibile:</strong> ${imponibile.toFixed(2)}€<br>`;
    html += `<strong>IVA (${vatRate.toFixed(1)}%):</strong> ${iva.toFixed(2)}€<br>`;
    html += `<strong>Totale + IVA:</strong> ${totaleIvato.toFixed(2)}€`;
  }

  totaleDiv.innerHTML = html;
}

// -------------------- MANUALE --------------------
function mostraFormArticoloManuale() {
  const tableBody = document.querySelector("#articoli-table tbody");
  if (!tableBody) return;
  if (document.getElementById("manual-input-row")) return;

  const row = document.createElement("tr");
  row.id = "manual-input-row";

  row.innerHTML = `
    <td data-col="codice"><input type="text" id="manualCodice" placeholder="Codice" /></td>
    <td data-col="descrizione"><input type="text" id="manualDescrizione" placeholder="Descrizione" /></td>

    <td data-col="prezzoLordo"><input type="text" inputmode="decimal" id="manualPrezzo" placeholder="€" value="0" /></td>

    <td data-col="sconto1"><input type="text" inputmode="decimal" id="manualSconto1" placeholder="%" value="0" /></td>
    <td data-col="sconto2"><input type="text" inputmode="decimal" id="manualSconto2" placeholder="%" value="0" /></td>
    <td data-col="margine"><input type="text" inputmode="decimal" id="manualMargine" placeholder="%" value="0" /></td>

    <td data-col="totaleNetto"><span id="manualTotale">—</span></td>

    <td data-col="trasporto"><input type="text" inputmode="decimal" id="manualTrasporto" placeholder="€" value="0" /></td>
    <td data-col="installazione"><input type="text" inputmode="decimal" id="manualInstallazione" placeholder="€" value="0" /></td>

    <td data-col="qta"><input type="number" id="manualQuantita" placeholder="1" value="1" min="1" step="1" /></td>

    <td data-col="granTot"><span id="manualGranTotale">—</span></td>

    <td data-col="venduto"><input type="text" inputmode="decimal" id="manualVenduto" placeholder="€" value="0" /></td>
    <td data-col="diff"><span id="manualDifferenza">—</span></td>

    <td data-col="azioni">
      <button onclick="aggiungiArticoloManuale()">✅</button>
      <button onclick="annullaArticoloManuale()">❌</button>
    </td>
  `;

  tableBody.appendChild(row);

  [
    "manualPrezzo", "manualSconto1", "manualSconto2", "manualMargine",
    "manualTrasporto", "manualInstallazione", "manualQuantita", "manualVenduto"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      // mantieni digitazione “umana”
      if (el.type === 'text') el.value = sanitizeDecimalTyping(el.value);
      calcolaRigaManuale();
    });
  });

  applyColumnVisibility();
  calcolaRigaManuale();
}

function calcolaRigaManuale() {
  const prezzoLordo = parseDec(document.getElementById("manualPrezzo").value);
  const sconto1 = clamp(parseDec(document.getElementById("manualSconto1").value), 0, 100);
  const sconto2 = clamp(parseDec(document.getElementById("manualSconto2").value), 0, 100);
  const margine = clamp(parseDec(document.getElementById("manualMargine").value), 0, 99.99);

  const trasporto = Math.max(0, parseDec(document.getElementById("manualTrasporto").value));
  const installazione = Math.max(0, parseDec(document.getElementById("manualInstallazione").value));
  const quantita = Math.max(1, parseInt(document.getElementById("manualQuantita").value || '1', 10) || 1);
  const venduto = Math.max(0, parseDec(document.getElementById("manualVenduto").value));

  const scontato = roundTwo(prezzoLordo * (1 - sconto1 / 100) * (1 - sconto2 / 100));
  const conMargine = roundTwo(scontato / (1 - margine / 100));
  const granTot = roundTwo((conMargine + trasporto + installazione) * quantita);
  const differenza = roundTwo(venduto - granTot);

  document.getElementById("manualTotale").textContent = scontato.toFixed(2) + "€";
  document.getElementById("manualGranTotale").textContent = granTot.toFixed(2) + "€";
  document.getElementById("manualDifferenza").textContent = differenza.toFixed(2) + "€";
}

function aggiungiArticoloManuale() {
  window.track?.add_item_manual?.();

  const codice = document.getElementById("manualCodice").value.trim();
  const descrizione = document.getElementById("manualDescrizione").value.trim();

  const prezzoLordo = parseDec(document.getElementById("manualPrezzo").value);
  const sconto = clamp(parseDec(document.getElementById("manualSconto1").value), 0, 100);
  const sconto2 = clamp(parseDec(document.getElementById("manualSconto2").value), 0, 100);
  const margine = clamp(parseDec(document.getElementById("manualMargine").value), 0, 99.99);

  const costoTrasporto = Math.max(0, parseDec(document.getElementById("manualTrasporto").value));
  const costoInstallazione = Math.max(0, parseDec(document.getElementById("manualInstallazione").value));
  const quantita = Math.max(1, parseInt(document.getElementById("manualQuantita").value || '1', 10) || 1);
  const venduto = Math.max(0, parseDec(document.getElementById("manualVenduto").value));

  const nuovoArticolo = {
    codice,
    descrizione,
    prezzoLordo,
    sconto,
    sconto2,
    margine,
    costoTrasporto,
    costoInstallazione,
    quantita,
    venduto
  };

  articoliAggiunti.push(nuovoArticolo);

  annullaArticoloManuale();
  renderTabellaArticoli();
  aggiornaTotaliGenerali();
  updateEquivalentDiscountDisplay();
}

function annullaArticoloManuale() {
  const row = document.getElementById("manual-input-row");
  if (row) row.remove();
}

// -------------------- REPORTS --------------------
function generaReportSmartCliente() {
  let report = "PREVENTIVO / ORDINE\n\n";
  let imponibile = 0;

  const checkboxServizi = document.getElementById("toggleMostraServizi");
  const mostraServizi = checkboxServizi && checkboxServizi.checked && autoPopolaCosti;

  articoliAggiunti.forEach((articolo, index) => {
    const r = computeRow(articolo);

    const nettoCad = r.nettoCadSmart;
    const qta = r.qta;
    const totRiga = r.granTotRiga;

    imponibile += totRiga;

    report += `${index + 1}) ${articolo.descrizione}\n`;
    report += `Codice: ${articolo.codice}\n`;
    report += `Q.tà: ${qta}\n`;
    report += `Netto/cad: ${nettoCad.toFixed(2)}€\n`;

    if (mostraServizi) {
      const tr = roundTwo(parseDec(articolo.costoTrasporto || 0));
      const ins = roundTwo(parseDec(articolo.costoInstallazione || 0));
      if (tr !== 0 || ins !== 0) {
        report += `Servizi:\n`;
        report += `Trasporto ${tr.toFixed(2)}€\n`;
        report += `Installazione ${ins.toFixed(2)}€\n`;
      }
    }

    report += `Totale riga: ${totRiga.toFixed(2)}€\n\n`;
  });

  imponibile = roundTwo(imponibile);

  const vatRate = clamp(parseDec(smartSettings.vatRate ?? 22), 0, 100);
  const iva = roundTwo(imponibile * (vatRate / 100));
  const totaleIvato = roundTwo(imponibile + iva);

  report += `RIEPILOGO\n`;
  report += `Imponibile: ${imponibile.toFixed(2)}€\n`;

  if (smartSettings.showVAT) {
    report += `IVA (${vatRate.toFixed(1)}%): ${iva.toFixed(2)}€\n`;
    report += `Totale + IVA: ${totaleIvato.toFixed(2)}€\n`;
  } else {
    report += `Totale: ${imponibile.toFixed(2)}€\n`;
  }

  return report;
}

function generaReportTesto() {
  if (smartSettings.smartMode) return generaReportSmartCliente();

  let report = "Report Articoli:\n\n";
  let totaleSenzaServizi = 0;
  let totaleConServizi = 0;
  let sommaDifferenze = 0;
  let totaleVenduto = 0;

  const checkboxServizi = document.getElementById("toggleMostraServizi");
  mostraDettagliServizi = checkboxServizi && checkboxServizi.checked;

  articoliAggiunti.forEach((articolo, index) => {
    const r = computeRow(articolo);

    sommaDifferenze += r.differenza;
    totaleVenduto += r.venduto;
    totaleSenzaServizi += r.conMargineUnit * r.qta;
    totaleConServizi += r.granTotRiga;

    report += `${index + 1}. Codice: ${articolo.codice}\n`;
    report += `Descrizione: ${articolo.descrizione}\n`;
    report += `Prezzo netto: ${r.totaleNettoUnit.toFixed(2)}€\n`;

    if (!smartSettings.hideDiscounts) {
      report += `Sconto 1: ${r.sconto1}%\n`;
      report += `Sconto 2: ${r.sconto2}%\n`;
    }

    report += `Quantità: ${r.qta}\n`;

    if (mostraDettagliServizi && autoPopolaCosti) {
      report += `Trasporto: ${roundTwo(parseDec(articolo.costoTrasporto || 0)).toFixed(2)}€\n`;
      report += `Installazione: ${roundTwo(parseDec(articolo.costoInstallazione || 0)).toFixed(2)}€\n`;
    }

    report += `Totale: ${r.granTotRiga.toFixed(2)}€\n`;

    if (!smartSettings.hideVenduto) report += `Venduto A: ${(r.venduto || 0).toFixed(2)}€\n`;
    if (!smartSettings.hideDiff) report += `Differenza sconto: ${r.differenza.toFixed(2)}€\n`;

    report += `\n`;
  });

  report += `Totale Netto (senza Trasporto/Installazione): ${totaleSenzaServizi.toFixed(2)}€\n`;
  if (autoPopolaCosti) report += `Totale Complessivo (inclusi Trasporto/Installazione): ${totaleConServizi.toFixed(2)}€\n`;

  if (!smartSettings.hideVenduto) report += `Totale Venduto: ${totaleVenduto.toFixed(2)}€\n`;
  if (!smartSettings.hideDiff) report += `Totale Differenza Sconto: ${sommaDifferenze.toFixed(2)}€\n`;

  if (smartSettings.showVAT) {
    const imponibile = autoPopolaCosti ? roundTwo(totaleConServizi) : roundTwo(totaleSenzaServizi);
    const vatRate = clamp(parseDec(smartSettings.vatRate ?? 22), 0, 100);
    const iva = roundTwo(imponibile * (vatRate / 100));
    const totaleIvato = roundTwo(imponibile + iva);

    report += `\nRIEPILOGO IVA\n`;
    report += `Imponibile: ${imponibile.toFixed(2)}€\n`;
    report += `IVA (${vatRate.toFixed(1)}%): ${iva.toFixed(2)}€\n`;
    report += `Totale + IVA: ${totaleIvato.toFixed(2)}€\n`;
  }

  return report;
}

function inviaReportWhatsApp() {
  window.track?.report_whatsapp?.({ variant: smartSettings.smartMode ? 'smart' : 'standard' });
  const report = generaReportTesto();
  const whatsappUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(report);
  window.open(whatsappUrl, '_blank');
}

function generaPDFReport() {
  window.track?.csv_export?.({ format: smartSettings.smartMode ? 'txt_smart' : 'txt_standard' });
  const report = generaReportTesto();
  const blob = new Blob([report], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = smartSettings.smartMode ? "preventivo_smart.txt" : "report.txt";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function generaReportTestoSenzaMargine() {
  if (smartSettings.smartMode) return generaReportSmartCliente();

  let report = "Report Articoli (senza Margine):\n\n";
  let totaleSenzaServizi = 0;
  let totaleConServizi = 0;

  const checkboxServizi = document.getElementById("toggleMostraServizi");
  const mostraServizi = checkboxServizi && checkboxServizi.checked;

  articoliAggiunti.forEach((articolo, index) => {
    const sconto1 = clamp(parseDec(articolo.sconto || 0), 0, 100);
    const sconto2 = clamp(parseDec(articolo.sconto2 || 0), 0, 100);

    const prezzoLordo = parseDec(articolo.prezzoLordo || 0);
    const prezzoScontato = roundTwo(prezzoLordo * (1 - sconto1 / 100) * (1 - sconto2 / 100));
    const quantita = Math.max(1, parseInt(articolo.quantita || 1, 10) || 1);

    const granTotale =
      (prezzoScontato + Math.max(0, parseDec(articolo.costoTrasporto || 0)) + Math.max(0, parseDec(articolo.costoInstallazione || 0)))
      * quantita;

    const granTotaleFinal = roundTwo(granTotale);

    totaleSenzaServizi += prezzoScontato * quantita;
    totaleConServizi += granTotaleFinal;

    report += `${index + 1}. Codice: ${articolo.codice}\n`;
    report += `Descrizione: ${articolo.descrizione}\n`;
    report += `Prezzo netto: ${prezzoScontato.toFixed(2)}€\n`;

    if (!smartSettings.hideDiscounts) {
      report += `Sconto 1: ${sconto1}%\n`;
      report += `Sconto 2: ${sconto2}%\n`;
    }

    report += `Quantità: ${quantita}\n`;

    if (mostraServizi && autoPopolaCosti) {
      report += `Trasporto: ${roundTwo(parseDec(articolo.costoTrasporto || 0)).toFixed(2)}€\n`;
      report += `Installazione: ${roundTwo(parseDec(articolo.costoInstallazione || 0)).toFixed(2)}€\n`;
    }

    report += `Totale: ${granTotaleFinal.toFixed(2)}€\n\n`;
  });

  report += `Totale Netto (senza Trasporto/Installazione): ${totaleSenzaServizi.toFixed(2)}€\n`;
  if (autoPopolaCosti) report += `Totale Complessivo (inclusi Trasporto/Installazione): ${totaleConServizi.toFixed(2)}€\n`;

  if (smartSettings.showVAT) {
    const imponibile = autoPopolaCosti ? roundTwo(totaleConServizi) : roundTwo(totaleSenzaServizi);
    const vatRate = clamp(parseDec(smartSettings.vatRate ?? 22), 0, 100);
    const iva = roundTwo(imponibile * (vatRate / 100));
    const totaleIvato = roundTwo(imponibile + iva);

    report += `\nRIEPILOGO IVA\n`;
    report += `Imponibile: ${imponibile.toFixed(2)}€\n`;
    report += `IVA (${vatRate.toFixed(1)}%): ${iva.toFixed(2)}€\n`;
    report += `Totale + IVA: ${totaleIvato.toFixed(2)}€\n`;
  }

  return report;
}

function inviaReportWhatsAppSenzaMargine() {
  window.track?.report_whatsapp?.({ variant: smartSettings.smartMode ? 'smart' : 'no_margin' });
  const report = generaReportTestoSenzaMargine();
  const whatsappUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(report);
  window.open(whatsappUrl, '_blank');
}

function generaTXTReportSenzaMargine() {
  window.track?.csv_export?.({ format: smartSettings.smartMode ? 'txt_smart' : 'txt_no_margin' });
  const report = generaReportTestoSenzaMargine();
  const blob = new Blob([report], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = smartSettings.smartMode ? "preventivo_smart.txt" : "report_senza_margine.txt";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
