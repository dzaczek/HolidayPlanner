# HCP - Holiday Calendar Planner

A browser-based yearly calendar planner for managing holidays across different person categories (Workers, Students, School pupils) and municipalities (Gemeinden). All data is stored locally in IndexedDB.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Production Build

```bash
npm run build
npm run preview
```

Static files are output to `dist/`.

## Features

- **Full year calendar** with switchable grid layouts (3×4, 2×6, 4×3, 6×2, 1×12)
- **Person management** — add people with name, category, municipality, and color
- **Two holiday sources:**
  - *From database* (solid color) — select predefined holiday periods per category/Gemeinde
  - *Manual* (striped pattern) — pick custom date ranges
- **Proportional day cells** — 1 person = full cell, 2 = half each, 3 = third, etc.
- **4 languages** — German, French, Italian, English (switchable in header)
- **Offline-first** — all data in IndexedDB, no server required

## Data Format

Holiday data follows a standardized schema (`src/db/seed/holidays/_schema.json`) designed for future automated parsing via Go + AI. Data is organized per country → category → Gemeinde.

## Tech Stack

- Vanilla JS + Vite
- IndexedDB (via `idb`)
- CSS Grid / Flexbox
