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
- **Privacy first**: nessun account, nessun tracker invasivo. I dati restano sul dispositivo

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
