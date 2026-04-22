# Data Sources

All holiday data is derived from official government and institutional sources. The source PDF files are stored in the `datasource/` directory.

#### Switzerland (CH)

| Source | Type | URL | Used for |
|--------|------|-----|----------|
| **EDK/CDIP Schulferien 2026** | PDF | [edudoc.ch/record/235166/files/Schulferien_2026.pdf](https://edudoc.ch/record/235166/files/Schulferien_2026.pdf) | School holidays for all 26 cantons (2026) |
| **EDK/CDIP Schulferien 2027** | PDF | [edudoc.ch/record/240657/files/Schulferien_2027.pdf](https://edudoc.ch/record/240657/files/Schulferien_2027.pdf) | School holidays for all 26 cantons (2027) |
| **Kantonal-einheitlicher Ferienplan (BKS)** | PDF | [schulen-aargau.ch/.../bksvs-kantonal-einheitlicher-ferienplan.pdf](https://www.schulen-aargau.ch/media/schulen-aargau/schulorganisation/ressourcen-planung/stunden-ferienplanung/bksvs-kantonal-einheitlicher-ferienplan.pdf) | School holidays for canton Aargau (AG), from the Erziehungsrat Ferienplan |
| **Kantonale Feiertage** | PDF | [bj.admin.ch/dam/bj/de/data/publiservice/service/zivilprozessrecht/kant-feiertage.pdf](https://www.bj.admin.ch/dam/bj/de/data/publiservice/service/zivilprozessrecht/kant-feiertage.pdf) | Official public holidays per canton (fixed + moveable dates) |
| **Universität Zürich Semesterdaten** | Web | [uzh.ch/de/studies/dates](https://www.uzh.ch/de/studies/dates.html) | University semester breaks (students.json) |
| **swisstopo PLZ/Ortschaften** | Data | [data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz](https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/) | Municipality database (2123 Gemeinden with BFS number, canton, PLZ, language) |

#### Germany (DE)

All sources below are free, require no API key, and have been verified as working.

| Source | Type | URL | Used for |
|--------|------|-----|----------|
| **Destatis GV-ISys** | CSV/XLS | [destatis.de/.../Gemeindeverzeichnis](https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/_inhalt.html) | Authoritative municipality register — all Gemeinden with AGS code, Bundesland, Kreis |
| **OpenPLZAPI** | JSON API | [openplzapi.org](https://openplzapi.org/) | Municipality lookup with PLZ, name, Bundesland. Search-based: `/de/Localities?name=Berlin` |
| **OpenHolidaysAPI** | JSON API | [openholidaysapi.org](https://openholidaysapi.org/) | Public holidays + school holidays in one API. `/PublicHolidays?countryIsoCode=DE&validFrom=2026-01-01&validTo=2026-12-31` |
| **date.nager.at** | JSON API | [date.nager.at/api/v3/publicholidays/2026/DE](https://date.nager.at/api/v3/publicholidays/2026/DE) | Public holidays per Bundesland with subdivision codes |
| **feiertage-api.de** | JSON API | [feiertage-api.de/api/?jahr=2026&nur_land=BY](https://feiertage-api.de/api/?jahr=2026&nur_land=BY) | Public holidays per Bundesland with detailed notes |
| **ferien-api.de** | JSON API | [ferien-api.de/api/v1/holidays/BY/2026](https://ferien-api.de/api/v1/holidays/BY/2026) | School holidays per Bundesland and year |
| **KMK Ferienregelung** | PDF | [kmk.org/service/ferien.html](https://www.kmk.org/service/ferien.html) | Official school holidays PDF (authoritative source, all 16 Bundesländer) |

#### France (FR)

| Source | Type | URL | Used for |
|--------|------|-----|----------|
| **Service-Public.fr** | Web | [service-public.fr/particuliers/vosdroits/F2405](https://www.service-public.fr/particuliers/vosdroits/F2405) | Public holidays (Jours fériés) |
| **Education.gouv.fr** | Web | [education.gouv.fr/calendrier-scolaire](https://www.education.gouv.fr/calendrier-scolaire) | School holidays per zone (Zone A, B, C) |

Source files in the repository:
```
datasource/
├── Schulferien_2026.pdf                        # EDK/CDIP school holidays 2026
├── Schulferien_2027.pdf                        # EDK/CDIP school holidays 2027
├── kant-feiertage.pdf                          # cantonal public holidays (BJ)
└── bksvs-kantonal-einheitlicher-ferienplan.pdf # AG school holidays (Erziehungsrat)
```

### Swiss Cantons (26 cantons, 2025-2035)

Public holidays are computed dynamically (Easter algorithm + fixed dates) and stored as `workers_YYYY.json`. The source table is parsed from `datasource/kant-feiertage.pdf` (Bundesamt für Justiz).

Generation:
```bash
python3 tools/parse_feiertage.py --years 2025 2026 2027 2028 2029 2030
```

### School Holidays

Parsed from official EDK/CDIP PDFs (`datasource/Schulferien_YYYY.pdf`). Canton AG uses data from the official Erziehungsrat Ferienplan (`datasource/bksvs-kantonal-einheitlicher-ferienplan.pdf`).

```bash
python3 tools/parse_schulferien.py Schulferien_2026.pdf Schulferien_2027.pdf
```

### Universities

Student holiday data is available per university. Users select their university by name in the municipality field.

#### Switzerland (20 universities)

| University | Code | Canton |
|-----------|------|--------|
| Universität Zürich | UZH | ZH |
| ETH Zürich | ETH | ZH |
| Université de Genève | UNIGE | GE |
| Université de Lausanne | UNIL | VD |
| EPFL Lausanne | EPFL | VD |
| Universität Bern | UNIBE | BE |
| Universität Basel | UNIBAS | BS |
| Université de Fribourg | UNIFR | FR |
| Universität St. Gallen | HSG | SG |
| Universität Luzern | UNILU | LU |
| Université de Neuchâtel | UNINE | NE |
| USI Lugano | USI | TI |
| ZHAW Zürich | ZHAW | ZH |
| BFH Bern | BFH | BE |
| ZHdK Zürich | ZHdK | ZH |
| FHNW Windisch | FHNW | AG |
| OST Rapperswil | OST | SG |
| ZHAW Winterthur | ZHAW-W | ZH |
| HSLU Luzern | HSLU | LU |
| FH Graubünden | FHGR | GR |

#### Germany (13 universities)

| University | Code | Bundesland |
|-----------|------|------------|
| LMU München | LMU | BY |
| TU München | TUM | BY |
| FU Berlin | FU | BE |
| HU Berlin | HU | BE |
| TU Berlin | TU | BE |
| Universität zu Köln | Uni Köln | NW |
| Goethe-Universität Frankfurt | Goethe | HE |
| Universität Hamburg | Uni HH | HH |
| RWTH Aachen | RWTH | NW |
| WWU Münster | WWU | NW |
| Universität Heidelberg | Uni HD | BW |
| Universität Stuttgart | Uni S | BW |
| TU Dresden | TUD | SN |

### Data Format

Holiday data follows a standardized schema (`src/db/seed/holidays/_schema.json`) designed for future automated parsing via Go + AI.

```
src/db/seed/holidays/ch/
├── school_2026.json      # school holidays per canton
├── school_2027.json
├── workers_2026.json     # public holidays per canton
├── workers_2027.json
└── students.json         # university holidays (20 universities)

src/db/seed/holidays/de/
├── school_2026.json      # school holidays per Bundesland
├── school_2027.json
├── workers_2026.json     # public holidays per Bundesland
├── workers_2027.json
└── students.json         # university holidays (13 universities)
```

### Adding a New Year (existing country)

1. Generate worker holidays: `python3 tools/parse_feiertage.py --years 2036`
2. Parse school holidays: `python3 tools/parse_schulferien.py Schulferien_2036.pdf`
3. Bump `SEED_VERSION` in `src/db/store.js`
4. Build and deploy

### Adding a New Country

The app supports multiple countries. Each country has its own directory under `src/db/seed/holidays/` and its municipalities in `gemeinden.json`. To add a new country (e.g. Austria `at`):

#### Step 1: Create the holiday directory

```
src/db/seed/holidays/at/
├── workers_2026.json     # public holidays per region
├── school_2026.json      # school holidays per region
└── students.json         # university holidays (or empty [])
```

#### Step 2: Add municipalities to `gemeinden.json`

Each municipality needs these fields:

```json
{
  "id": "at-40101",
  "name": "Linz",
  "canton": "OO",
  "country": "AT",
  "language": "de",
  "plz": ["4020", "4021"]
}
```

- **`id`** — unique identifier (prefix with country code to avoid collisions, e.g. `de-09162`, `at-40101`)
- **`canton`** — regional code (Bundesland, province, etc.). Must match the `canton` field in holiday JSON files
- **`country`** — ISO 2-letter country code (`CH`, `DE`, `AT`, ...)
- **`plz`** — array of postal codes for autocomplete search

#### Step 3: Create holiday JSON files

Holiday files follow the schema in `src/db/seed/holidays/_schema.json`. Each file is an array of entries grouped by region:

```json
[
  {
    "canton": "OO",
    "year": 2026,
    "holidays": [
      {
        "name": { "de": "Neujahrstag", "en": "New Year's Day" },
        "start": "2026-01-01",
        "end": "2026-01-01",
        "type": "public_holiday"
      }
    ]
  }
]
```

- **`canton`** — must match the region code used in `gemeinden.json`
- **`type`** — one of: `public_holiday`, `vacation`, `bridge_day`
- **`name`** — multilingual object; at minimum provide `de` and `en`

For `students.json`, entries reference a specific municipality:

```json
[
  {
    "gemeinde_id": "at-40101",
    "year": 2026,
    "category": "student",
    "holidays": [
      {
        "name": { "de": "Semesterferien", "en": "Semester break" },
        "start": "2026-02-02",
        "end": "2026-02-27",
        "type": "vacation"
      }
    ]
  }
]
```

#### Step 4: Register the country in the loader

Add an entry in `src/db/seed/loader.js` in the `countryModules` object:

```javascript
at: {
  school: import.meta.glob('./holidays/at/school_*.json'),
  workers: import.meta.glob('./holidays/at/workers_*.json'),
  students: () => import('./holidays/at/students.json').catch(() => ({ default: [] })),
},
```

#### Step 5: (Optional) Add dynamic public holiday computation

If you want public holidays to work for years without seed data, add the country's region-to-holiday mapping in `src/holidays/public-holidays.js` (see the existing `CANTON` map for CH and `BUNDESLAND` map for DE as examples).

#### Step 6: Finalize

1. Bump `SEED_VERSION` in `src/db/store.js`
2. Bump the matching version in `seedDatabase()` in `src/db/seed/loader.js`
3. `npm run build` and deploy

The autocomplete in the person modal will automatically show the new municipalities as `Name (Region, Country) — PLZ`.

### Gemeinden

2123 Swiss municipalities from [swisstopo PLZ data](https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/). Each with BFS number, name, canton, PLZ codes, language.
