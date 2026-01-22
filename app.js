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

// --- SMART SETTINGS (nuovi)
const SMART_KEY = 'csvxpresssmart_settings_v1';
let smartSettings = {
  smartMode: false,
  showVAT: false,
  vatRate: 22,
  hideVenduto: true,
  hideDiff: true,
  hideDiscounts: true
};

function roundTwo(num) {
  return Math.round(num * 100) / 100;
}
function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}
function loadSmartSettings() {
  try {
    const raw = localStorage.getItem(SMART_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    smartSettings = { ...smartSettings, ...obj };
  } catch (_) {}
}
function saveSmartSettings() {
  try {
    localStorage.setItem(SMART_KEY, JSON.stringify(smartSettings));
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", function () {
  loadSmartSettings();

  document.getElementById("csvFileInput").addEventListener("change", handleCSVUpload);
  document.getElementById("searchListino").addEventListener("input", aggiornaListinoSelect);

  // Checkboxes (già presenti) - li lasciamo come sono
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

  // --- SMART UI binding
  bindSmartControls();

  // Prima render
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
  applyColumnVisibility();
});

function bindSmartControls() {
  const elSmart = document.getElementById('toggleSmartMode');
  const elVat = document.getElementById('toggleShowVAT');
  const elVatRate = document.getElementById('vatRate');
  const elHideVenduto = document.getElementById('toggleHideVenduto');
  const elHideDiff = document.getElementById('toggleHideDiff');
  const elHideDiscounts = document.getElementById('toggleHideDiscounts');

  // init UI from settings
  if (elSmart) elSmart.checked = !!smartSettings.smartMode;
  if (elVat) elVat.checked = !!smartSettings.showVAT;
  if (elVatRate) elVatRate.value = smartSettings.vatRate ?? 22;
  if (elHideVenduto) elHideVenduto.checked = !!smartSettings.hideVenduto;
  if (elHideDiff) elHideDiff.checked = !!smartSettings.hideDiff;
  if (elHideDiscounts) elHideDiscounts.checked = !!smartSettings.hideDiscounts;

  const onChange = () => {
    smartSettings.smartMode = !!elSmart?.checked;
    smartSettings.showVAT = !!elVat?.checked;

    const rate = parseFloat(String(elVatRate?.value || '22').replace(',', '.')) || 0;
    smartSettings.vatRate = clamp(rate, 0, 100);

    smartSettings.hideVenduto = !!elHideVenduto?.checked;
    smartSettings.hideDiff = !!elHideDiff?.checked;
    smartSettings.hideDiscounts = !!elHideDiscounts?.checked;

    saveSmartSettings();
    window.track?.smart_toggle({ key: 'settings', val: JSON.stringify(smartSettings) });

    applyColumnVisibility();
    aggiornaTabellaArticoli();
    aggiornaTotaliGenerali();
  };

  [elSmart, elVat, elVatRate, elHideVenduto, elHideDiff, elHideDiscounts]
    .filter(Boolean)
    .forEach(el => el.addEventListener('change', onChange));

  // UX: se attivo Smart mode, di default nascondo venduto/diff/sconti (se l’utente non ha scelto)
  if (smartSettings.smartMode) {
    smartSettings.hideVenduto = true;
    smartSettings.hideDiff = true;
    smartSettings.hideDiscounts = true;
    saveSmartSettings();
  }
}

function applyColumnVisibility() {
  // logica: in Smart mode nascondiamo sempre "azioni"? NO (ti serve). Lasciamole.
  const hideDiscounts = smartSettings.smartMode ? true : smartSettings.hideDiscounts;
  const hideVenduto = smartSettings.smartMode ? true : smartSettings.hideVenduto;
  const hideDiff = smartSettings.smartMode ? true : smartSettings.hideDiff;

  // colonne sempre “interne” in smart
  setColHidden('sconto1', hideDiscounts);
  setColHidden('sconto2', hideDiscounts);

  setColHidden('venduto', hideVenduto);
  setColHidden('diff', hideDiff);

  // opzionale: in smart potresti voler nascondere anche margine e prezzo lordo
  setColHidden('margine', smartSettings.smartMode);      // interno
  setColHidden('prezzoLordo', smartSettings.smartMode);  // interno
}

function setColHidden(colKey, hidden) {
  // header
  document.querySelectorAll(`th[data-col="${colKey}"]`).forEach(th => {
    th.classList.toggle('col-hidden', !!hidden);
  });
  // body cells (mappati dopo render: uso data-col in TD)
  document.querySelectorAll(`td[data-col="${colKey}"]`).forEach(td => {
    td.classList.toggle('col-hidden', !!hidden);
  });
}

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

  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
}

function handleCSVUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  window.track?.csv_upload_start({ method: 'file_input' });
  window.track?.csv_upload_ok({ method: 'file_input', file });

  const t0 = performance.now();

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      const ms = Math.round(performance.now() - t0);

      if (!results.data.length) {
        document.getElementById("csvError").style.display = "block";
        window.track?.csv_parse_error({ code: 'empty_or_no_rows', ms });
        return;
      }

      listino = results.data.map(row => ({
        codice: (row["Codice"] || "").trim(),
        descrizione: (row["Descrizione"] || "").trim(),
        prezzoLordo: parseFloat((row["PrezzoLordo"] || "0").replace(",", ".")) || 0,
        sconto: 0,
        sconto2: 0,
        margine: 0,
        costoTrasporto: parseFloat((row["CostoTrasporto"] || "0").replace(",", ".")) || 0,
        costoInstallazione: parseFloat((row["CostoInstallazione"] || "0").replace(",", ".")) || 0,
        quantita: 1
      }));

      const rows = listino.length;
      const cols = Array.isArray(results.meta?.fields) ? results.meta.fields.length : undefined;
      window.track?.csv_parse_ok({ rows, cols, ms });

      document.getElementById("csvError").style.display = "none";
      aggiornaListinoSelect();
    },
    error: function(err) {
      const ms = Math.round(performance.now() - t0);
      console.error("Errore CSV:", err);
      document.getElementById("csvError").style.display = "block";
      window.track?.csv_parse_error({ code: 'papaparse_error', ms });
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
      option.textContent = `${item.codice} - ${item.descrizione} - €${item.prezzoLordo}`;
      select.appendChild(option);
    }
  });
}

function aggiungiArticoloDaListino() {
  window.track?.add_item_listino();

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
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
}

function computeRow(articolo) {
  const sconto1 = articolo.sconto || 0;
  const sconto2 = articolo.sconto2 || 0;

  const prezzoScontato = articolo.prezzoLordo * (1 - sconto1 / 100) * (1 - sconto2 / 100);
  const totaleNettoUnit = roundTwo(prezzoScontato);

  const margine = articolo.margine || 0;
  const conMargineUnit = roundTwo(totaleNettoUnit / (1 - margine / 100)); // “prezzo unitario interno”
  const qta = articolo.quantita || 1;

  const serviziUnit = (articolo.costoTrasporto || 0) + (articolo.costoInstallazione || 0);
  const granTotRiga = roundTwo((conMargineUnit + serviziUnit) * qta);

  const venduto = articolo.venduto || 0;
  const differenza = roundTwo(venduto - granTotRiga);

  // “Netto/cad” per SMART (cliente):
  // uso il totale riga / qta (in pratica prezzo unitario finale “pronto”, inclusi servizi spalmati)
  const nettoCadSmart = roundTwo(granTotRiga / qta);

  return { sconto1, sconto2, totaleNettoUnit, conMargineUnit, qta, serviziUnit, granTotRiga, venduto, differenza, nettoCadSmart };
}

function aggiornaTabellaArticoli() {
  const tableBody = document.querySelector("#articoli-table tbody");
  tableBody.innerHTML = "";

  articoliAggiunti.forEach((articolo, index) => {
    const r = computeRow(articolo);

    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-col="codice">${articolo.codice}</td>
      <td data-col="descrizione">${articolo.descrizione}</td>

      <td data-col="prezzoLordo">${articolo.prezzoLordo}€</td>

      <td data-col="sconto1"><input type="number" value="${r.sconto1}" placeholder="%" data-index="${index}" data-field="sconto" oninput="aggiornaCampo(event)" /></td>
      <td data-col="sconto2"><input type="number" value="${r.sconto2}" placeholder="%" data-index="${index}" data-field="sconto2" oninput="aggiornaCampo(event)" /></td>

      <td data-col="margine"><input type="number" value="${articolo.margine || 0}" placeholder="%" data-index="${index}" data-field="margine" oninput="aggiornaCampo(event)" /></td>

      <td data-col="totaleNetto">${r.totaleNettoUnit.toFixed(2)}€</td>

      <td data-col="trasporto"><input type="number" value="${articolo.costoTrasporto || 0}" placeholder="€" data-index="${index}" data-field="costoTrasporto" oninput="aggiornaCampo(event)" /></td>
      <td data-col="installazione"><input type="number" value="${articolo.costoInstallazione || 0}" placeholder="€" data-index="${index}" data-field="costoInstallazione" oninput="aggiornaCampo(event)" /></td>

      <td data-col="qta"><input type="number" value="${r.qta}" min="1" data-index="${index}" data-field="quantita" oninput="aggiornaCampo(event)" /></td>

      <td data-col="granTot">${r.granTotRiga.toFixed(2)}€</td>

      <td data-col="venduto"><input type="number" value="${r.venduto}" placeholder="€" data-index="${index}" data-field="venduto" oninput="aggiornaCampo(event)" /></td>
      <td data-col="diff">${r.differenza.toFixed(2)}€</td>

      <td data-col="azioni"><button onclick="rimuoviArticolo(${index})">Rimuovi</button></td>
    `;
    tableBody.appendChild(row);
  });

  // ri-applico visibilità colonne dopo re-render
  applyColumnVisibility();
}

function aggiornaCampo(event) {
  const input = event.target;
  const index = parseInt(input.getAttribute("data-index"));
  const field = input.getAttribute("data-field");

  let val = parseFloat(String(input.value || '0').replace(",", ".")) || 0;
  if ((field === "sconto" || field === "sconto2" || field === "margine") && val < 0) val = 0;
  if (field === "quantita" && val < 1) val = 1;

  articoliAggiunti[index][field] = val;
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
}

function rimuoviArticolo(index) {
  window.track?.remove_item();

  articoliAggiunti.splice(index, 1);
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
}

function aggiornaTotaliGenerali() {
  let totaleSenzaServizi = 0;   // “conMargine” * qta
  let totaleConServizi = 0;     // granTot riga
  let totaleVenduto = 0;
  let totaleDifferenzaSconto = 0;

  articoliAggiunti.forEach(articolo => {
    const r = computeRow(articolo);

    totaleSenzaServizi += r.conMargineUnit * r.qta;
    totaleConServizi += r.granTotRiga;

    totaleVenduto += r.venduto;
    totaleDifferenzaSconto += r.differenza;
  });

  // base imponibile che uso per IVA: se autoPopolaCosti è attivo, considero totaleConServizi, altrimenti totaleSenzaServizi
  const imponibile = autoPopolaCosti ? roundTwo(totaleConServizi) : roundTwo(totaleSenzaServizi);
  const vatRate = clamp(parseFloat(String(smartSettings.vatRate ?? 22).replace(',', '.')) || 0, 0, 100);
  const iva = roundTwo(imponibile * (vatRate / 100));
  const totaleIvato = roundTwo(imponibile + iva);

  let totaleDiv = document.getElementById("totaleGenerale");
  if (!totaleDiv) {
    totaleDiv = document.createElement("div");
    totaleDiv.id = "totaleGenerale";
    totaleDiv.style.padding = "1em";
    document.getElementById("report-section").insertAdjacentElement("beforebegin", totaleDiv);
  }

  // In Smart mode: stringhe più “cliente”
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

  // Se non smart, ma showVAT attivo, aggiungo comunque (utile anche internamente)
  if (!smart && smartSettings.showVAT) {
    html += `<br><br><strong>Imponibile:</strong> ${imponibile.toFixed(2)}€<br>`;
    html += `<strong>IVA (${vatRate.toFixed(1)}%):</strong> ${iva.toFixed(2)}€<br>`;
    html += `<strong>Totale + IVA:</strong> ${totaleIvato.toFixed(2)}€`;
  }

  totaleDiv.innerHTML = html;
}

// --- Funzioni per aggiunta manuale articoli (restano, ma in smart verranno nascoste colonne via applyColumnVisibility)

function mostraFormArticoloManuale() {
  const tableBody = document.querySelector("#articoli-table tbody");

  if (document.getElementById("manual-input-row")) return;

  const row = document.createElement("tr");
  row.id = "manual-input-row";

  row.innerHTML = `
    <td data-col="codice"><input type="text" id="manualCodice" placeholder="Codice" /></td>
    <td data-col="descrizione"><input type="text" id="manualDescrizione" placeholder="Descrizione" /></td>
    <td data-col="prezzoLordo"><input type="number" id="manualPrezzo" placeholder="€" step="0.01" /></td>
    <td data-col="sconto1"><input type="number" id="manualSconto1" placeholder="%" value="0" step="0.01" /></td>
    <td data-col="sconto2"><input type="number" id="manualSconto2" placeholder="%" value="0" step="0.01" /></td>
    <td data-col="margine"><input type="number" id="manualMargine" placeholder="%" value="0" step="0.01" /></td>
    <td data-col="totaleNetto"><span id="manualTotale">—</span></td>
    <td data-col="trasporto"><input type="number" id="manualTrasporto" placeholder="€" value="0" step="0.01" /></td>
    <td data-col="installazione"><input type="number" id="manualInstallazione" placeholder="€" value="0" step="0.01" /></td>
    <td data-col="qta"><input type="number" id="manualQuantita" placeholder="1" value="1" min="1" /></td>
    <td data-col="granTot"><span id="manualGranTotale">—</span></td>
    <td data-col="venduto"><input type="number" id="manualVenduto" placeholder="€" value="0" step="0.01" /></td>
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
    document.getElementById(id).addEventListener("input", calcolaRigaManuale);
  });

  applyColumnVisibility();
}

function calcolaRigaManuale() {
  const prezzoLordo = parseFloat(document.getElementById("manualPrezzo").value) || 0;
  const sconto1 = parseFloat(document.getElementById("manualSconto1").value) || 0;
  const sconto2 = parseFloat(document.getElementById("manualSconto2").value) || 0;
  const margine = parseFloat(document.getElementById("manualMargine").value) || 0;
  const trasporto = parseFloat(document.getElementById("manualTrasporto").value) || 0;
  const installazione = parseFloat(document.getElementById("manualInstallazione").value) || 0;
  const quantita = parseInt(document.getElementById("manualQuantita").value) || 1;
  const venduto = parseFloat(document.getElementById("manualVenduto").value) || 0;

  const scontato = roundTwo(prezzoLordo * (1 - sconto1 / 100) * (1 - sconto2 / 100));
  const conMargine = roundTwo(scontato / (1 - margine / 100));
  const granTot = roundTwo((conMargine + trasporto + installazione) * quantita);
  const differenza = roundTwo(venduto - granTot);

  document.getElementById("manualTotale").textContent = scontato.toFixed(2) + "€";
  document.getElementById("manualGranTotale").textContent = granTot.toFixed(2) + "€";
  document.getElementById("manualDifferenza").textContent = differenza.toFixed(2) + "€";
}

function aggiungiArticoloManuale() {
  window.track?.add_item_manual();

  const codice = document.getElementById("manualCodice").value.trim();
  const descrizione = document.getElementById("manualDescrizione").value.trim();
  const prezzoLordo = parseFloat(document.getElementById("manualPrezzo").value) || 0;
  const sconto = parseFloat(document.getElementById("manualSconto1").value) || 0;
  const sconto2 = parseFloat(document.getElementById("manualSconto2").value) || 0;
  const margine = parseFloat(document.getElementById("manualMargine").value) || 0;
  const costoTrasporto = parseFloat(document.getElementById("manualTrasporto").value) || 0;
  const costoInstallazione = parseFloat(document.getElementById("manualInstallazione").value) || 0;
  const quantita = parseInt(document.getElementById("manualQuantita").value) || 1;
  const venduto = parseFloat(document.getElementById("manualVenduto").value) || 0;

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
  aggiornaTabellaArticoli();
  aggiornaTotaliGenerali();
  annullaArticoloManuale();
}

function annullaArticoloManuale() {
  const row = document.getElementById("manual-input-row");
  if (row) row.remove();
}

// -------------------- REPORTS --------------------

function generaReportSmartCliente() {
  // Report “pulito” per cliente
  let report = "PREVENTIVO / ORDINE\n\n";

  let imponibile = 0;

  const checkboxServizi = document.getElementById("toggleMostraServizi");
  const mostraServizi = checkboxServizi && checkboxServizi.checked && autoPopolaCosti;

  articoliAggiunti.forEach((articolo, index) => {
    const r = computeRow(articolo);

    // In smart: prezzo netto/cad + quantità + totale riga
    const nettoCad = r.nettoCadSmart; // vedi computeRow
    const qta = r.qta;
    const totRiga = r.granTotRiga;

    imponibile += totRiga;

    report += `${index + 1}) ${articolo.descrizione}\n`;
    report += `Codice: ${articolo.codice}\n`;
    report += `Q.tà: ${qta}  |  Netto/cad: ${nettoCad.toFixed(2)}€\n`;

    if (mostraServizi) {
      const tr = roundTwo(articolo.costoTrasporto || 0);
      const ins = roundTwo(articolo.costoInstallazione || 0);
      // Solo se non zero
      if (tr !== 0 || ins !== 0) {
        report += `Servizi: Trasporto ${tr.toFixed(2)}€  |  Installazione ${ins.toFixed(2)}€\n`;
      }
    }

    report += `Totale riga: ${totRiga.toFixed(2)}€\n\n`;
  });

  imponibile = roundTwo(imponibile);

  const vatRate = clamp(parseFloat(String(smartSettings.vatRate ?? 22).replace(',', '.')) || 0, 0, 100);
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

// Report “standard” (come prima) — ma con possibilità di omettere sconti / venduto / diff se flag attivi
function generaReportTesto() {
  // Se Smart Mode: genero direttamente il report cliente
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
      report += `Trasporto: ${(articolo.costoTrasporto || 0).toFixed(2)}€\n`;
      report += `Installazione: ${(articolo.costoInstallazione || 0).toFixed(2)}€\n`;
    }
    report += `Totale: ${r.granTotRiga.toFixed(2)}€\n`;

    if (!smartSettings.hideVenduto) {
      report += `Venduto A: ${(r.venduto || 0).toFixed(2)}€\n`;
    }
    if (!smartSettings.hideDiff) {
      report += `Differenza sconto: ${r.differenza.toFixed(2)}€\n`;
    }

    report += `\n`;
  });

  report += `Totale Netto (senza Trasporto/Installazione): ${totaleSenzaServizi.toFixed(2)}€\n`;
  if (autoPopolaCosti) {
    report += `Totale Complessivo (inclusi Trasporto/Installazione): ${totaleConServizi.toFixed(2)}€\n`;
  }
  if (!smartSettings.hideVenduto) {
    report += `Totale Venduto: ${totaleVenduto.toFixed(2)}€\n`;
  }
  if (!smartSettings.hideDiff) {
    report += `Totale Differenza Sconto: ${sommaDifferenze.toFixed(2)}€\n`;
  }

  // IVA opzionale anche in standard
  if (smartSettings.showVAT) {
    const imponibile = autoPopolaCosti ? roundTwo(totaleConServizi) : roundTwo(totaleSenzaServizi);
    const vatRate = clamp(parseFloat(String(smartSettings.vatRate ?? 22).replace(',', '.')) || 0, 0, 100);
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
  window.track?.report_whatsapp({ variant: smartSettings.smartMode ? 'smart' : 'standard' });

  const report = generaReportTesto();
  const whatsappUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(report);
  window.open(whatsappUrl, '_blank');
}

function generaPDFReport() {
  window.track?.csv_export({ format: smartSettings.smartMode ? 'txt_smart' : 'txt_standard' });

  const report = generaReportTesto();
  const blob = new Blob([report], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = smartSettings.smartMode ? "preventivo_smart.txt" : "report.txt";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// “Senza Margine”: se SmartMode attivo ha già senso poco (ma lo mantengo).
function generaReportTestoSenzaMargine() {
  if (smartSettings.smartMode) return generaReportSmartCliente();

  let report = "Report Articoli (senza Margine):\n\n";
  let totaleSenzaServizi = 0;
  let totaleConServizi = 0;

  const checkboxServizi = document.getElementById("toggleMostraServizi");
  const mostraServizi = checkboxServizi && checkboxServizi.checked;

  articoliAggiunti.forEach((articolo, index) => {
    const sconto1 = articolo.sconto || 0;
    const sconto2 = articolo.sconto2 || 0;
    const prezzoLordo = articolo.prezzoLordo || 0;
    const prezzoScontato = roundTwo(prezzoLordo * (1 - sconto1 / 100) * (1 - sconto2 / 100));
    const quantita = articolo.quantita || 1;

    const granTotale = (prezzoScontato + (articolo.costoTrasporto || 0) + (articolo.costoInstallazione || 0)) * quantita;
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
      report += `Trasporto: ${(articolo.costoTrasporto || 0).toFixed(2)}€\n`;
      report += `Installazione: ${(articolo.costoInstallazione || 0).toFixed(2)}€\n`;
    }
    report += `Totale: ${granTotaleFinal.toFixed(2)}€\n\n`;
  });

  report += `Totale Netto (senza Trasporto/Installazione): ${totaleSenzaServizi.toFixed(2)}€\n`;
  if (autoPopolaCosti) {
    report += `Totale Complessivo (inclusi Trasporto/Installazione): ${totaleConServizi.toFixed(2)}€\n`;
  }

  if (smartSettings.showVAT) {
    const imponibile = autoPopolaCosti ? roundTwo(totaleConServizi) : roundTwo(totaleSenzaServizi);
    const vatRate = clamp(parseFloat(String(smartSettings.vatRate ?? 22).replace(',', '.')) || 0, 0, 100);
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
  window.track?.report_whatsapp({ variant: smartSettings.smartMode ? 'smart' : 'no_margin' });

  const report = generaReportTestoSenzaMargine();
  const whatsappUrl = "https://api.whatsapp.com/send?text=" + encodeURIComponent(report);
  window.open(whatsappUrl, '_blank');
}

function generaTXTReportSenzaMargine() {
  window.track?.csv_export({ format: smartSettings.smartMode ? 'txt_smart' : 'txt_no_margin' });

  const report = generaReportTestoSenzaMargine();
  const blob = new Blob([report], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = smartSettings.smartMode ? "preventivo_smart.txt" : "report_senza_margine.txt";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
