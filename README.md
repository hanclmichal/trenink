# Trénink

Offline tréninkový deník do posilovny. Běží v Safari jako aplikace na ploše (PWA), data drží v telefonu
a synchronizuje je se soukromým úložištěm `hanclmichal/trenink-data`. Stejná architektura jako IT Pojmy.

## Co umí

- **Dnes:** naplánovaný trénink (A dřep, B benchpress, C mrtvý tah; doplňky se střídají po týdnech),
  „Dnes jdu / Dnes nejdu“ s přesunem na jiný den, zápis sérií (kg, opakování, RIR), odškrtávání,
  časovač pauzy, poznámky, výměna cviku za jiný na stejnou partii (jen dnes nebo natrvalo), návrh váhy
  podle minulého výkonu, nájezdové série u hlavních cviků, displej nezhasíná.
- **Kalendář:** měsíc s hotovými, rozpracovanými a plánovanými tréninky; přesun, mimořádný den,
  zpětný zápis i úprava starších tréninků.
- **Cviky:** 50 cviků s vlastní animací pohybu, mapou procvičovaných partií, technikou a chybami;
  vlastní GIF nebo video ke cviku (uloží se do datového úložiště, do telefonu se stáhne jednou).
- **Přehled:** vývoj hlavních cviků (nejtěžší série, odhad 1RM), detail libovolného cviku, rekordy,
  docházka po týdnech, minuty kardia, objem sérií po partiích.
- **Kardio po tréninku:** pás, schody, rotoped, eliptický a veslovací trenažér nebo chůze; minuty, rychlost/sklon
  nebo úroveň, tep, odpočet. Předvyplní se podle minula, výchozí délka a stroj v Nastavení.
- **Fakta o zdraví a dlouhověkosti:** 29 ověřených faktů (zdroj a síla důkazů u každého) na obrazovce Dnes,
  u cviků a po dokončení tréninku. Data jsou v `fakty.json`, takže je jde doplňovat bez nové verze aplikace.
- **Čas tréninku:** začátek se zapíše první odškrtnutou sérií, konec dokončením; obojí jde upravit.
- **Offline:** service worker drží aplikaci, IndexedDB data. Změny se odešlou jedním commitem, jakmile je signál.

## Jak to funguje

```
iPhone (aplikace na ploše)                      GitHub
┌──────────────────────────────┐                ┌───────────────────────────────┐
│ Service worker: kód aplikace │                │ hanclmichal/trenink (veřejné)  │ ← GitHub Pages
│ IndexedDB: tréninky + změny  │ ── Git Data API ──▶ hanclmichal/trenink-data │ ← soukromá data
└──────────────────────────────┘                └───────────────────────────────┘
```

Synchronizace používá Git Data API (`git/trees`, `git/commits`, `git/refs`): stáhne jen soubory se změněným
blobem, videa stáhne až při otevření cviku (bez base64, kvůli datům) a změny z telefonu odešle jako jeden
commit (jen fast-forward). Kalendář a seznam videí se při souběžné změně slučují po klíčích; u ostatních
souborů zůstane verze z telefonu a druhá se uloží do `konflikty/`.

## Struktura

```
index.html, styles.css, sw.js, manifest.webmanifest
app/          moduly (ES modules, bez build kroku)
  data.js     výchozí knihovna cviků, plán, kalendář a fakta (použijí se, když v datech chybí)
  facts.js    výběr a zobrazení faktů
  program.js  rotace, plánování, návrhy vah, statistiky
  anim.js     animace cviků (kostra + kinematika, SVG)
  body.js     mapa svalů zepředu a zezadu
  views/      obrazovky
icons/        ikony aplikace
```

## Nasazení

GitHub Pages z větve `main`, složka `/` (root). Při každé změně kódu zvýšit `VERSION` v `sw.js`
(a `APP_VERSION` v `app/main.js`), aby si telefony stáhly novou verzi (aplikace pak nabídne „Načíst“).
