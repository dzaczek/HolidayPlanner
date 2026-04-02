#!/usr/bin/env python3
"""
Parser for Swiss Schulferien PDFs (EDK/CDIP format).
Extracts school holiday data per canton and outputs JSON
compatible with the HCP app's holidayTemplates format.

Usage:
    python3 tools/parse_schulferien.py Schulferien_2026.pdf Schulferien_2027.pdf
    python3 tools/parse_schulferien.py Schulferien_2026.pdf --output src/db/seed/holidays/ch/school.json
"""

import sys
import json
import re
from datetime import datetime
from pathlib import Path

import pdfplumber

# Holiday period names in 4 languages
PERIOD_NAMES = {
    "sport": {
        "de": "Sportferien",
        "fr": "Vacances de sport",
        "it": "Vacanze sportive",
        "en": "Sport holidays",
    },
    "spring": {
        "de": "Frühlingsferien",
        "fr": "Vacances de printemps",
        "it": "Vacanze di primavera",
        "en": "Spring holidays",
    },
    "summer": {
        "de": "Sommerferien",
        "fr": "Vacances d'été",
        "it": "Vacanze estive",
        "en": "Summer holidays",
    },
    "autumn": {
        "de": "Herbstferien",
        "fr": "Vacances d'automne",
        "it": "Vacanze autunnali",
        "en": "Autumn holidays",
    },
    "christmas": {
        "de": "Weihnachtsferien",
        "fr": "Vacances de Noël",
        "it": "Vacanze di Natale",
        "en": "Christmas holidays",
    },
}

PERIOD_KEYS = ["sport", "spring", "summer", "autumn", "christmas"]

# Canton code normalization (strip footnote numbers, handle sub-cantons)
CANTON_MAP = {
    "AG": "AG", "AI": "AI", "AR": "AR",
    "BE_d": "BE", "BE_f": "BE",
    "BL": "BL", "BS": "BS",
    "FL": "FL", "FR": "FR",
    "GE": "GE", "GL": "GL", "GR": "GR",
    "JU": "JU", "LU": "LU",
    "NE": "NE", "NW": "NW", "OW": "OW",
    "SG": "SG", "SH": "SH", "SO": "SO", "SZ": "SZ",
    "TG": "TG", "TI": "TI",
    "UR": "UR",
    "VD": "VD", "VS_d": "VS", "VS_f": "VS",
    "ZG": "ZG", "ZH": "ZH",
}


def clean_canton_code(raw: str) -> list[str]:
    """Extract canton code(s) from a cell that may contain footnote numbers or newlines."""
    raw = raw.strip()
    parts = re.split(r"\n", raw)
    codes = []
    for part in parts:
        # Strip footnote superscript digits at the end
        code = re.sub(r"\d+$", "", part.strip())
        code = re.sub(r"\s+", "", code)
        if code:
            codes.append(code)
    return codes


def parse_date(date_str: str) -> str | None:
    """Parse DD.MM.YYYY to YYYY-MM-DD."""
    date_str = date_str.strip()
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str, "%d.%m.%Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return None


def parse_date_range(cell: str) -> list[tuple[str | None, str | None]]:
    """
    Parse a cell that may contain one or more date ranges.
    Handles: "14.02.2026 01.03.2026", multi-line, and special texts like "Sportwoche variiert".
    Returns list of (start, end) tuples.
    """
    if not cell:
        return [(None, None)]

    lines = cell.strip().split("\n")
    results = []

    for line in lines:
        line = line.strip()

        # Skip special texts
        if not line or "variiert" in line.lower() or "festgelegt" in line.lower() or "angaben" in line.lower() or "disponible" in line.lower():
            results.append((None, None))
            continue

        # Extract all dates from the line
        dates = re.findall(r"\d{2}\.\d{2}\.\d{4}", line)
        if len(dates) >= 2:
            start = parse_date(dates[0])
            end = parse_date(dates[1])
            results.append((start, end))
        elif len(dates) == 1:
            d = parse_date(dates[0])
            results.append((d, d))
        else:
            results.append((None, None))

    return results


def extract_year_from_pdf(pdf_path: str) -> int | None:
    """Try to extract year from filename or first page."""
    match = re.search(r"(\d{4})", Path(pdf_path).stem)
    if match:
        return int(match.group(1))
    return None


def parse_pdf(pdf_path: str) -> list[dict]:
    """Parse a Schulferien PDF and return list of holiday entries."""
    year = extract_year_from_pdf(pdf_path)
    if not year:
        print(f"  Warning: Could not determine year from {pdf_path}", file=sys.stderr)
        return []

    print(f"  Parsing {pdf_path} (year={year})...")

    entries = []

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()

        if not tables:
            print(f"  Error: No tables found in {pdf_path}", file=sys.stderr)
            return []

        table = tables[0]

        # Find data rows (skip headers and footnotes)
        data_start = None
        for i, row in enumerate(table):
            if row and row[0] and row[0].strip().startswith("Kanton"):
                data_start = i + 1
                break

        if data_start is None:
            # Fallback: start at row 3
            data_start = 3

        for row in table[data_start:]:
            if not row or not row[0]:
                continue

            canton_raw = row[0].strip()

            # Skip footnote rows
            if canton_raw.startswith(("1 ", "2 ", "©", "Für die")):
                continue
            if len(canton_raw) > 10:
                continue

            canton_codes = clean_canton_code(canton_raw)
            school_types = (row[1] or "").strip().split("\n") if row[1] else [""]

            # Pad school_types to match canton_codes
            while len(school_types) < len(canton_codes):
                school_types.append(school_types[-1] if school_types else "")

            # Parse 5 period columns (indices 2-6)
            period_ranges = []
            for col_idx in range(2, 7):
                cell = row[col_idx] if col_idx < len(row) else ""
                ranges = parse_date_range(cell or "")
                period_ranges.append(ranges)

            # For each canton/school-type sub-row
            for sub_idx, raw_code in enumerate(canton_codes):
                canton = CANTON_MAP.get(raw_code, raw_code.rstrip("0123456789"))
                school = school_types[sub_idx].strip() if sub_idx < len(school_types) else ""

                holidays = []
                for period_idx, period_key in enumerate(PERIOD_KEYS):
                    ranges = period_ranges[period_idx]
                    range_idx = min(sub_idx, len(ranges) - 1)
                    start, end = ranges[range_idx]

                    if start and end:
                        holidays.append({
                            "name": PERIOD_NAMES[period_key],
                            "start": start,
                            "end": end,
                            "type": "vacation",
                        })

                if holidays:
                    entries.append({
                        "canton": canton,
                        "school_type": school,
                        "year": year,
                        "category": "school",
                        "holidays": holidays,
                    })

    print(f"  Extracted {len(entries)} canton/school-type entries with holidays")
    return entries


def entries_to_seed_format(all_entries: list[dict], gemeinden: list[dict]) -> list[dict]:
    """
    Convert parsed entries to the app's seed format.
    Maps cantons to all Gemeinden in that canton.
    """
    # Build canton -> gemeinde_ids map
    canton_gemeinden = {}
    for g in gemeinden:
        c = g.get("canton", "")
        if c not in canton_gemeinden:
            canton_gemeinden[c] = []
        canton_gemeinden[c].append(g["id"])

    seed = []
    for entry in all_entries:
        canton = entry["canton"]
        gem_ids = canton_gemeinden.get(canton, [])

        if not gem_ids:
            # No gemeinden for this canton, use canton as ID
            gem_ids = [canton.lower()]

        for gem_id in gem_ids:
            seed.append({
                "gemeinde_id": gem_id,
                "year": entry["year"],
                "category": "school",
                "holidays": entry["holidays"],
            })

    return seed


def entries_to_flat_templates(all_entries: list[dict], gemeinden: list[dict]) -> list[dict]:
    """
    Convert to flat template format ready for IndexedDB import.
    This is the format used by addTemplatesBatch().
    """
    canton_gemeinden = {}
    for g in gemeinden:
        c = g.get("canton", "")
        if c not in canton_gemeinden:
            canton_gemeinden[c] = []
        canton_gemeinden[c].append(g["id"])

    templates = []
    for entry in all_entries:
        canton = entry["canton"]
        gem_ids = canton_gemeinden.get(canton, [])

        if not gem_ids:
            gem_ids = [canton.lower()]

        for gem_id in gem_ids:
            for holiday in entry["holidays"]:
                templates.append({
                    "category": "school",
                    "gemeinde": gem_id,
                    "name": holiday["name"],
                    "startDate": holiday["start"],
                    "endDate": holiday["end"],
                    "type": holiday["type"],
                    "year": entry["year"],
                    "color": "#4CAF50",
                })

    return templates


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Parse Swiss Schulferien PDFs")
    parser.add_argument("pdfs", nargs="+", help="PDF file(s) to parse")
    parser.add_argument(
        "--output-dir", "-o",
        default="src/db/seed/holidays/ch",
        help="Output directory. Files are written as school_YYYY.json per year.",
    )
    parser.add_argument(
        "--gemeinden",
        default="src/db/seed/gemeinden.json",
        help="Path to gemeinden.json for canton->gemeinde mapping",
    )

    args = parser.parse_args()

    # Load gemeinden for mapping
    gemeinden = []
    gemeinden_path = Path(args.gemeinden)
    if gemeinden_path.exists():
        with open(gemeinden_path) as f:
            gemeinden = json.load(f)
        print(f"Loaded {len(gemeinden)} Gemeinden from {gemeinden_path}")
    else:
        print(f"Warning: {gemeinden_path} not found, using canton codes as IDs", file=sys.stderr)

    # Parse all PDFs
    all_entries = []
    for pdf_path in args.pdfs:
        entries = parse_pdf(pdf_path)
        all_entries.extend(entries)

    print(f"\nTotal: {len(all_entries)} entries from {len(args.pdfs)} PDF(s)")

    # Group by year
    by_year = {}
    for entry in all_entries:
        y = entry["year"]
        if y not in by_year:
            by_year[y] = []
        by_year[y].append(entry)

    # Write one file per year
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for year, entries in sorted(by_year.items()):
        out_path = out_dir / f"school_{year}.json"
        with open(out_path, "w") as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
        print(f"  {out_path}: {len(entries)} entries")

    print(f"\nDone. Files: {', '.join(f'school_{y}.json' for y in sorted(by_year))}")


if __name__ == "__main__":
    main()
