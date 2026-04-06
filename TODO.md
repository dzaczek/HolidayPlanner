# HCP - Future Plans

## Phase Next - Interaction
- [ ] Click on day cell to see details popup
- [x] Drag & drop day selection on calendar
- [x] "+" button on person to select consecutive days count
- [x] Edit/delete individual holiday entries (via holiday-editor tool)
- [x] Share calendar via URL
- [x] Share calendar via QR code

## Phase Next - Germany (DE) Data Parsers
- [x] Parser: fetch DE municipalities from GeoNames postal codes → `gemeinden.json` (tools/fetch_de_gemeinden.py, 15549 Gemeinden, 17966 PLZ)
- [x] Map DE Bundesland codes to short codes (BY, BW...) in gemeinden.json
- [x] Dynamic DE public holiday computation in public-holidays.js (16 Bundesländer)
- [ ] Parser: fetch DE public holidays from date.nager.at API → `workers_YYYY.json`
- [ ] Parser: fetch DE public holidays from OpenHolidaysAPI → `workers_YYYY.json`
- [ ] Parser: fetch DE school holidays from ferien-api.de API → `school_YYYY.json`
- [ ] Parser: fetch DE school holidays from OpenHolidaysAPI → `school_YYYY.json`
- [ ] Parser: fetch DE school holidays from KMK PDF → `school_YYYY.json`

## Done - Multi-Country Support
- [x] Multi-country loader (src/db/seed/loader.js) — dynamic per-country glob patterns
- [x] Person autocomplete with (Region, Country) format
- [x] Holiday editor tool with calendar + spreadsheet views (tools/holiday-editor.py)
- [x] Country/region/gemeinde scope for adding holidays
- [x] GALAXY demo country for testing (13 Gemeinden, 5 regions)
- [x] Documentation: data sources (CH + DE), adding new countries guide

## Phase Later - Cloud & Sharing
- [ ] iCloud sync
- [ ] Google Drive sync

## Phase Later - Data
- [ ] Go + AI parser for automatic Gemeinde holiday data extraction
- [ ] More countries/regions support (AT, FR, IT...)
- [ ] Import/export CSV/JSON
- [ ] Yearly database refresh workflow
