#!/usr/bin/env python3
"""
Fetch German school holidays (Schulferien) from OpenHolidaysAPI.

Downloads school holiday data for all 16 Bundesländer and outputs
JSON compatible with HCP's school_YYYY.json format.

Usage:
    python3 tools/fetch_de_schulferien.py --years 2026
    python3 tools/fetch_de_schulferien.py --years 2026 2027 2028
    python3 tools/fetch_de_schulferien.py --years 2026 --output src/db/seed/holidays/de/

Source: https://openholidaysapi.org (free, no API key)
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen, Request

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_OUTPUT = PROJECT_ROOT / "src" / "db" / "seed" / "holidays" / "de"

API_BASE = "https://openholidaysapi.org"

# German holiday name → English translation
NAME_EN = {
    "Weihnachtsferien": "Christmas holidays",
    "Winterferien": "Winter holidays",
    "Frühjahrsferien": "Spring break",
    "Halbjahresferien": "Mid-year break",
    "Halbjahrespause": "Mid-year break",
    "Osterferien": "Easter holidays",
    "Pfingstferien": "Whitsun holidays",
    "Sommerferien": "Summer holidays",
    "Herbstferien": "Autumn holidays",
    "Fastnachtsferien": "Carnival holidays",
    "Himmelfahrt": "Ascension break",
    "Buß- und Bettag": "Repentance Day",
    "Brückentag": "Bridge day",
    "Variabler Ferientag": "Flexible holiday",
    "Unterrichtsfreier Tag": "Day off school",
    "Zusätzlicher Ferientag": "Additional holiday",
    "Schulfreier Tag": "Day off school",
    "Tag nach Himmelfahrt": "Day after Ascension",
    "Reformationsfest": "Reformation Day",
    "Gründonnerstag": "Maundy Thursday",
}


def fetch_json(url):
    """Fetch JSON from URL."""
    req = Request(url, headers={"Accept": "application/json"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_school_holidays(year):
    """Fetch all DE school holidays for a given year from OpenHolidaysAPI."""
    url = (
        f"{API_BASE}/SchoolHolidays"
        f"?countryIsoCode=DE&languageIsoCode=DE"
        f"&validFrom={year}-01-01&validTo={year}-12-31"
    )
    print(f"  Fetching {year}... ", end="", flush=True)
    data = fetch_json(url)
    print(f"{len(data)} entries")
    return data


def translate_name(de_name):
    """Translate German holiday name to English."""
    # Try exact match first
    if de_name in NAME_EN:
        return NAME_EN[de_name]
    # Try prefix match (e.g. "Winterferien" in "Winterferien (Ferienwoche)")
    for key, val in NAME_EN.items():
        if de_name.startswith(key):
            return val
    # Fallback
    return de_name


def convert_to_hcp_format(api_data, year):
    """
    Convert OpenHolidaysAPI response to HCP school_YYYY.json format.
    Groups by Bundesland, merges holidays.
    """
    by_state = defaultdict(list)

    for entry in api_data:
        # Get Bundesland code
        subdivisions = entry.get("subdivisions", [])
        if not subdivisions:
            continue

        de_name = entry["name"][0]["text"] if entry.get("name") else "?"
        en_name = translate_name(de_name)

        holiday = {
            "name": {"de": de_name, "en": en_name},
            "start": entry["startDate"],
            "end": entry["endDate"],
            "type": "vacation",
        }

        for sub in subdivisions:
            bl = sub.get("shortName", "")
            if bl:
                by_state[bl].append(holiday)

    # Build output entries sorted by Bundesland
    result = []
    for bl in sorted(by_state.keys()):
        holidays = sorted(by_state[bl], key=lambda h: h["start"])
        result.append({
            "canton": bl,
            "year": year,
            "category": "school",
            "holidays": holidays,
        })

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Fetch German school holidays from OpenHolidaysAPI"
    )
    parser.add_argument(
        "--years",
        nargs="+",
        type=int,
        required=True,
        help="Years to fetch (e.g. 2026 2027)",
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help=f"Output directory (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and display stats without saving",
    )
    args = parser.parse_args()

    output_dir = Path(args.output) if args.output else DEFAULT_OUTPUT

    print(f"\n  HCP DE School Holiday Fetcher")
    print(f"  ─────────────────────────────")
    print(f"  Source:  OpenHolidaysAPI")
    print(f"  Years:   {', '.join(str(y) for y in args.years)}")
    print(f"  Output:  {output_dir}")
    print()

    for year in args.years:
        # Fetch
        api_data = fetch_school_holidays(year)

        if not api_data:
            print(f"  No data for {year}, skipping.")
            continue

        # Convert
        entries = convert_to_hcp_format(api_data, year)

        # Stats
        total_holidays = sum(len(e["holidays"]) for e in entries)
        print(f"\n  {year}: {len(entries)} Bundesländer, {total_holidays} holiday periods")
        for e in entries:
            periods = ", ".join(h["name"]["de"] for h in e["holidays"])
            print(f"    {e['canton']}: {len(e['holidays'])} — {periods}")

        # Save
        if not args.dry_run:
            output_dir.mkdir(parents=True, exist_ok=True)
            out_path = output_dir / f"school_{year}.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(entries, f, ensure_ascii=False, indent=2)
                f.write("\n")
            print(f"\n  Saved: {out_path}")
        else:
            print(f"\n  Dry run — not saved.")

    print()


if __name__ == "__main__":
    main()
