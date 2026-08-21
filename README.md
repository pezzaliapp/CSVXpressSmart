# CSVXpressSmart

PWA per agenti di vendita: calcola sconti commerciali (Sconto 1, Sconto 2, sconto cliente equivalente) e margini partendo da listini in formato CSV o Excel.

## Caratteristiche

- **Import CSV o Excel** (.csv, .xlsx, .xlsm, .xls)
- Riconoscimento intelligente colonne (italiano/inglese, varianti case-insensitive)
- Calcolo prezzo netto, margine percentuale, sconto equivalente cliente
- Trasporto e installazione opzionali
- Memoria locale (IndexedDB): l'ultimo listino caricato resta disponibile
- Export report TXT e WhatsApp
- **Offline-first**: funziona senza connessione dopo il primo caricamento
- **Privacy first**: nessun account, nessun tracker, nessuna telemetria, nessuna richiesta
  a servizi esterni. Listini e preventivi restano sul dispositivo

## Pubblicazione su Cloudflare Pages

PWA completamente statica: nessun build, nessun npm, nessun Worker o Function.

1. Genera/usa `CSVXpressSmart-Cloudflare-Ready.zip` (index.html alla radice dello ZIP)
2. Cloudflare Pages → Create project → **Direct Upload** → trascina lo ZIP

Il file `_headers` applica CSP, header di sicurezza e le regole di cache
(`service-worker.js` e `index.html` sempre rivalidati, `vendor/` e `icon/` a cache lunga).

Ad ogni nuova pubblicazione ricordarsi di:
1. incrementare `CACHE_VERSION` in `service-worker.js`
2. incrementare `data-ver` in `index.html`

Così il service worker installa la nuova shell, elimina le cache vecchie e la pagina
si aggiorna da sola.

## Test

Richiedono Google Chrome installato e un server statico locale:

```bash
python3 -m http.server 8899 --bind 127.0.0.1   # oppure: node tests/serve-with-headers.mjs 8898
node tests/logic.test.js       # calcoli, report, export, parsing
node tests/browser.test.mjs    # end-to-end in Chrome headless (import, TXT, offline, responsive)
node tests/update.test.mjs     # aggiornamento PWA e pulizia cache
```

## App nativa iOS

CSVXpressSmart è disponibile anche come app nativa per iPhone su App Store:
👉 https://apps.apple.com/it/app/csvxpresssmart-pezzali/id6774046371

## Colonne supportate

Campi obbligatori:
- **Codice** (alias: code, codiceArt, codArticolo, id)
- **Prezzo** (alias: prezzo, prezzoLordo, prezzo_EUR, price, importo, listino)

Campi opzionali:
- **Descrizione** (alias: description, desc, articolo)
- **CostoTrasporto** (alias: trasporto, shipping, spedizione)
- **CostoInstallazione** (alias: installazione, installation, montaggio)
- **Famiglia, Categoria, Pagine** (preparati per futuri filtri)

Tutti i nomi sono riconosciuti **senza maiuscole/minuscole** e con o senza spazi.

## Licenza

MIT — vedi [LICENSE](LICENSE).

## Autore

Alessandro Pezzali — https://www.alessandropezzali.it
