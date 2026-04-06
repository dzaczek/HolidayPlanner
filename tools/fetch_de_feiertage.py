#!/usr/bin/env python3
"""
Fetch German public holidays (Feiertage) from OpenHolidaysAPI.

Downloads public holiday data for all 16 Bundesländer and outputs
JSON compatible with HCP's workers_YYYY.json format.

Usage:
    python3 tools/fetch_de_feiertage.py --years 2026
    python3 tools/fetch_de_feiertage.py --years 2026 2027 2028 2029 2030
    python3 tools/fetch_de_feiertage.py --years 2026 --dry-run

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

ALL_BUNDESLAENDER = [
    "BB", "BE", "BW", "BY", "HB", "HE", "HH", "MV",
    "NI", "NW", "RP", "SH", "SL", "SN", "ST", "TH",
]

# German → English holiday name translations
NAME_EN = {
    "Neujahr": "New Year's Day",
    "Heilige Drei Könige": "Epiphany",
    "Internationaler Frauentag": "International Women's Day",
    "Karfreitag": "Good Friday",
    "Ostermontag": "Easter Monday",
    "Tag der Arbeit": "Labour Day",
    "Christi Himmelfahrt": "Ascension Day",
    "Pfingstmontag": "Whit Monday",
    "Fronleichnam": "Corpus Christi",
    "Mariä Himmelfahrt": "Assumption of Mary",
    "Weltkindertag": "World Children's Day",
    "Tag der Deutschen Einheit": "German Unity Day",
    "Reformationstag": "Reformation Day",
    "Allerheiligen": "All Saints' Day",
    "Buß- und Bettag": "Repentance and Prayer Day",
    "1. Weihnachtsfeiertag": "Christmas Day",
    "Erster Weihnachtsfeiertag": "Christmas Day",
    "2. Weihnachtsfeiertag": "St. Stephen's Day",
    "Zweiter Weihnachtsfeiertag": "St. Stephen's Day",
    "Augsburger Hohes Friedensfest": "Augsburg Peace Festival",
    "Ostersonntag": "Easter Sunday",
    "Pfingstsonntag": "Whit Sunday",
}


def fetch_json(url):
    req = Request(url, headers={"Accept": "application/json"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def translate_name(de_name):
    if de_name in NAME_EN:
        return NAME_EN[de_name]
    for key, val in NAME_EN.items():
        if de_name.startswith(key):
            return val
    return de_name


def fetch_public_holidays(year):
    url = (
        f"{API_BASE}/PublicHolidays"
        f"?countryIsoCode=DE&languageIsoCode=DE"
        f"&validFrom={year}-01-01&validTo={year}-12-31"
    )
    print(f"  Fetching {year}... ", end="", flush=True)
    data = fetch_json(url)
    print(f"{len(data)} entries")
    return data


def convert_to_hcp_format(api_data, year):
    by_state = {bl: [] for bl in ALL_BUNDESLAENDER}

    for entry in api_data:
        de_name = entry["name"][0]["text"] if entry.get("name") else "?"
        en_name = translate_name(de_name)

        holiday = {
            "name": {"de": de_name, "en": en_name},
            "start": entry["startDate"],
            "end": entry["endDate"],
            "type": "public_holiday",
        }

        if entry.get("nationwide"):
            for bl in ALL_BUNDESLAENDER:
                by_state[bl].append(holiday)
        else:
            for sub in entry.get("subdivisions", []):
                bl = sub.get("shortName", "")
                if bl in by_state:
                    by_state[bl].append(holiday)

    result = []
    for bl in sorted(by_state.keys()):
        holidays = sorted(by_state[bl], key=lambda h: h["start"])
        if holidays:
            result.append({
                "canton": bl,
                "year": year,
                "category": "worker",
                "holidays": holidays,
            })

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Fetch German public holidays from OpenHolidaysAPI"
    )
    parser.add_argument("--years", nargs="+", type=int, required=True)
    parser.add_argument("--output", "-o", type=str, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    output_dir = Path(args.output) if args.output else DEFAULT_OUTPUT

    print(f"\n  HCP DE Public Holiday Fetcher")
    print(f"  ─────────────────────────────")
    print(f"  Source:  OpenHolidaysAPI")
    print(f"  Years:   {', '.join(str(y) for y in args.years)}")
    print(f"  Output:  {output_dir}")
    print()

    for year in args.years:
        api_data = fetch_public_holidays(year)
        if not api_data:
            print(f"  No data for {year}, skipping.")
            continue

        entries = convert_to_hcp_format(api_data, year)

        total = sum(len(e["holidays"]) for e in entries)
        print(f"\n  {year}: {len(entries)} Bundesländer, {total} holidays")
        for e in entries:
            names = ", ".join(h["name"]["de"] for h in e["holidays"])
            print(f"    {e['canton']}: {len(e['holidays'])} — {names}")

        if not args.dry_run:
            output_dir.mkdir(parents=True, exist_ok=True)
            out_path = output_dir / f"workers_{year}.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(entries, f, ensure_ascii=False, indent=2)
                f.write("\n")
            print(f"\n  Saved: {out_path}")
        else:
            print(f"\n  Dry run — not saved.")

    print()


if __name__ == "__main__":
    main()
