# HCP - Holiday Calendar Planner

A calendar tool that helps families in Switzerland optimize their vacation planning when family members work or attend school in different cantons. Parents and children each have different holiday schedules (public holidays, school holidays, university holidays) depending on their canton and municipality — HCP visualizes all of them on one calendar so you can find the best overlapping days off.

Browser-based, offline-first, all data stored locally in IndexedDB.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Docker

```bash
docker-compose up -d
```

| Service | Port | Description |
|---------|------|-------------|
| **HCP** | [localhost:8080](http://localhost:8080) | Calendar app (nginx, read-only) |
| **GoAccess** | [localhost:7891](http://localhost:7891) | Real-time access log dashboard |

Logs are persisted in a shared Docker volume (`nginx-logs`) between the HCP and GoAccess containers.

### Security

- Read-only filesystem (`read_only: true`)
- Non-root nginx user (uid 101)
- `no-new-privileges`, `cap_drop: ALL`
- CSP, X-Frame-Options, X-Content-Type-Options headers
- Input escaping, color sanitization, share URL payload validation

## Production Build

```bash
npm run build
npm run preview
```

Static files output to `dist/`.

## Features

- **Full year calendar** with switchable grid layouts (3x4, 2x6, 4x3, 6x2, 1x12, 12x1)
- **Person management** — add people with name, category, municipality (Gemeinde), and color
- **Three person categories:**
  - *Workers* — cantonal public holidays
  - *School pupils* — school holidays + public holidays
  - *Students* — university holidays + public holidays
- **Two holiday sources:**
  - *From database* (solid color) — predefined holiday periods per category/Gemeinde
  - *Manual* (striped pattern) — custom date ranges or drag & drop placement
- **Leave management** — vacation periods with multi-person assignment, visual bar on calendar
- **Working days counter** — net working days excluding weekends and holidays
- **Year carry-over** — persons auto-migrate to next year with holiday assignment
- **Lazy year loading** — holiday data loaded on demand per year (not all at once)
- **4 languages** — German, French, Italian, English
- **Share** — share calendar via compressed URL link
- **Backup/Restore** — download/upload JSON backup of all user data
- **Offline-first** — all data in IndexedDB, no server required

## Holiday Data

### Swiss Cantons (26 cantons, 2025-2035)

Public holidays are computed dynamically (Easter algorithm + fixed dates) and stored as `workers_YYYY.json`.

Generation:
```bash
python3 tools/parse_feiertage.py --years 2025 2026 2027 2028 2029 2030
```

### School Holidays

Parsed from official EDK/CDIP PDFs (`Schulferien_YYYY.pdf`). Canton AG uses data from the official Erziehungsrat Ferienplan.

```bash
python3 tools/parse_schulferien.py Schulferien_2026.pdf Schulferien_2027.pdf
```

### Data Format

Holiday data follows a standardized schema (`src/db/seed/holidays/_schema.json`) designed for future automated parsing via Go + AI.

```
src/db/seed/holidays/ch/
├── school_2026.json      # school holidays per canton
├── school_2027.json
├── workers_2026.json     # public holidays per canton
├── workers_2027.json
└── students.json         # university holidays
```

### Adding a New Year

1. Generate worker holidays: `python3 tools/parse_feiertage.py --years 2036`
2. Parse school holidays: `python3 tools/parse_schulferien.py Schulferien_2036.pdf`
3. Bump `SEED_VERSION` in `src/db/store.js`
4. Build and deploy

### Gemeinden

2123 Swiss municipalities from [swisstopo PLZ data](https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/). Each with BFS number, name, canton, PLZ codes, language.

## Versioning

Version is displayed in the header badge, taken from `git describe --tags` at build time.

```bash
git tag v0.2.0
npm run build   # version appears as v0.2.0
```

## Tech Stack

- Vanilla JS + Vite
- IndexedDB (via `idb`)
- CSS Grid / Flexbox
- Docker + nginx + GoAccess
