#!/usr/bin/env python3
"""
Parser for Swiss cantonal public holidays (kant-feiertage.pdf).
Extracts fixed-date and moveable holidays per canton,
then generates year-specific JSON files for the HCP app.

Usage:
    python3 tools/parse_feiertage.py kant-feiertage.pdf --years 2026 2027
    python3 tools/parse_feiertage.py kant-feiertage.pdf --years 2026 2027 -o src/db/seed/holidays/ch
"""

import sys
import json
import re
from datetime import date, timedelta
from pathlib import Path

import pdfplumber

# === Easter calculation (Anonymous Gregorian algorithm) ===

def easter(year: int) -> date:
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def compute_moveable(year: int) -> dict[str, date]:
    """Compute all moveable Swiss holiday dates for a given year."""
    e = easter(year)
    return {
        "karfreitag": e - timedelta(days=2),
        "ostermontag": e + timedelta(days=1),
        "auffahrt": e + timedelta(days=39),
        "pfingstmontag": e + timedelta(days=50),
        "fronleichnam": e + timedelta(days=60),
    }


# === Holiday name translations ===

HOLIDAY_NAMES = {
    "neujahrstag": {
        "de": "Neujahrstag", "fr": "Nouvel An", "it": "Capodanno", "en": "New Year's Day",
        "fixed": (1, 1),
    },
    "berchtoldstag": {
        "de": "Berchtoldstag", "fr": "2 janvier", "it": "2 gennaio", "en": "Berchtold's Day",
        "fixed": (1, 2),
    },
    "dreikoenig": {
        "de": "Dreikönigstag", "fr": "Épiphanie", "it": "Epifania", "en": "Epiphany",
        "fixed": (1, 6),
    },
    "josephstag": {
        "de": "Josephstag", "fr": "Saint-Joseph", "it": "San Giuseppe", "en": "St. Joseph's Day",
        "fixed": (3, 19),
    },
    "karfreitag": {
        "de": "Karfreitag", "fr": "Vendredi saint", "it": "Venerdì santo", "en": "Good Friday",
        "moveable": "karfreitag",
    },
    "ostermontag": {
        "de": "Ostermontag", "fr": "Lundi de Pâques", "it": "Lunedì di Pasqua", "en": "Easter Monday",
        "moveable": "ostermontag",
    },
    "tag_der_arbeit": {
        "de": "Tag der Arbeit", "fr": "Fête du travail", "it": "Festa del lavoro", "en": "Labour Day",
        "fixed": (5, 1),
    },
    "auffahrt": {
        "de": "Auffahrt", "fr": "Ascension", "it": "Ascensione", "en": "Ascension Day",
        "moveable": "auffahrt",
    },
    "pfingstmontag": {
        "de": "Pfingstmontag", "fr": "Lundi de Pentecôte", "it": "Lunedì di Pentecoste", "en": "Whit Monday",
        "moveable": "pfingstmontag",
    },
    "fronleichnam": {
        "de": "Fronleichnam", "fr": "Fête-Dieu", "it": "Corpus Domini", "en": "Corpus Christi",
        "moveable": "fronleichnam",
    },
    "peter_paul": {
        "de": "Peter und Paul", "fr": "Saints Pierre et Paul", "it": "San Pietro e Paolo", "en": "Saints Peter and Paul",
        "fixed": (6, 29),
    },
    "bundesfeiertag": {
        "de": "Bundesfeiertag", "fr": "Fête nationale", "it": "Festa nazionale", "en": "Swiss National Day",
        "fixed": (8, 1),
    },
    "mariae_himmelfahrt": {
        "de": "Mariä Himmelfahrt", "fr": "Assomption", "it": "Assunzione", "en": "Assumption of Mary",
        "fixed": (8, 15),
    },
    "mauritiustag": {
        "de": "Mauritiustag", "fr": "Saint-Maurice", "it": "San Maurizio", "en": "St. Maurice's Day",
        "fixed": (9, 22),
    },
    "bruderklaus": {
        "de": "Bruder Klaus", "fr": "Saint Nicolas de Flüe", "it": "San Nicola della Flüe", "en": "Brother Klaus",
        "fixed": (9, 25),
    },
    "allerheiligen": {
        "de": "Allerheiligen", "fr": "Toussaint", "it": "Ognissanti", "en": "All Saints' Day",
        "fixed": (11, 1),
    },
    "mariae_empfaengnis": {
        "de": "Mariä Empfängnis", "fr": "Immaculée Conception", "it": "Immacolata", "en": "Immaculate Conception",
        "fixed": (12, 8),
    },
    "weihnachtstag": {
        "de": "Weihnachtstag", "fr": "Noël", "it": "Natale", "en": "Christmas Day",
        "fixed": (12, 25),
    },
    "stephanstag": {
        "de": "Stephanstag", "fr": "Saint-Étienne", "it": "Santo Stefano", "en": "St. Stephen's Day",
        "fixed": (12, 26),
    },
    "restauration_geneve": {
        "de": "Restauration der Republik", "fr": "Restauration de la République", "it": "Restaurazione della Repubblica", "en": "Restoration of the Republic",
        "fixed": (12, 31),
    },
    "naefelser_fahrt": {
        "de": "Näfelser Fahrt", "fr": "Näfelser Fahrt", "it": "Näfelser Fahrt", "en": "Näfels Pilgrimage",
        "note": "First Thursday in April",
    },
    "medardus": {
        "de": "Medardus", "fr": "Saint-Médard", "it": "San Medardo", "en": "St. Medard's Day",
        "fixed": (6, 8),
    },
    "jeune_genevois": {
        "de": "Genfer Bettag", "fr": "Jeûne genevois", "it": "Digiuno ginevrino", "en": "Geneva Fast",
        "note": "Thursday after first Sunday of September",
    },
    "bettagsmontag": {
        "de": "Bettagsmontag", "fr": "Lundi du Jeûne fédéral", "it": "Lunedì del digiuno federale", "en": "Federal Fast Monday",
        "note": "Monday after third Sunday of September",
    },
    "lundi_jeune_federal": {
        "de": "Bettagsmontag", "fr": "Lundi du Jeûne fédéral", "it": "Lunedì del digiuno federale", "en": "Federal Fast Monday",
        "note": "Monday after third Sunday of September",
    },
}

# Canton -> list of holiday keys (section a: legally recognized)
# Parsed manually from the PDF structure
CANTON_HOLIDAYS = {
    "ZH": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "tag_der_arbeit", "auffahrt", "pfingstmontag", "weihnachtstag", "stephanstag"],
    "BE": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "weihnachtstag", "stephanstag"],
    "LU": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "UR": ["neujahrstag", "dreikoenig", "josephstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "SZ": ["neujahrstag", "dreikoenig", "josephstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "OW": ["neujahrstag", "berchtoldstag", "josephstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "bruderklaus", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "NW": ["neujahrstag", "josephstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "GL": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "allerheiligen", "weihnachtstag", "stephanstag"],
    "ZG": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "FR": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "SO": ["neujahrstag", "karfreitag", "tag_der_arbeit", "auffahrt", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "weihnachtstag"],
    "BS": ["neujahrstag", "karfreitag", "ostermontag", "tag_der_arbeit", "auffahrt", "pfingstmontag", "weihnachtstag", "stephanstag"],
    "BL": ["neujahrstag", "karfreitag", "ostermontag", "tag_der_arbeit", "auffahrt", "pfingstmontag", "weihnachtstag", "stephanstag"],
    "SH": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "tag_der_arbeit", "auffahrt", "pfingstmontag", "weihnachtstag", "stephanstag"],
    "AR": ["neujahrstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "weihnachtstag", "stephanstag"],
    "AI": ["neujahrstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "SG": ["neujahrstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "allerheiligen", "weihnachtstag", "stephanstag"],
    "GR": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "weihnachtstag", "stephanstag"],
    "AG": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "TG": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "tag_der_arbeit", "auffahrt", "pfingstmontag", "weihnachtstag", "stephanstag"],
    "TI": ["neujahrstag", "dreikoenig", "josephstag", "ostermontag", "tag_der_arbeit", "auffahrt", "pfingstmontag", "fronleichnam", "peter_paul", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag", "stephanstag"],
    "VD": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "weihnachtstag"],
    "VS": ["neujahrstag", "josephstag", "ostermontag", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "mariae_empfaengnis", "weihnachtstag"],
    "NE": ["neujahrstag", "berchtoldstag", "karfreitag", "tag_der_arbeit", "auffahrt", "fronleichnam", "weihnachtstag"],
    "GE": ["neujahrstag", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "weihnachtstag", "restauration_geneve"],
    "JU": ["neujahrstag", "berchtoldstag", "karfreitag", "ostermontag", "tag_der_arbeit", "auffahrt", "pfingstmontag", "fronleichnam", "mariae_himmelfahrt", "allerheiligen", "weihnachtstag"],
}


def compute_special_moveable(key: str, year: int) -> date | None:
    """Compute special moveable holidays not based on Easter."""
    if key == "naefelser_fahrt":
        # First Thursday in April
        d = date(year, 4, 1)
        while d.weekday() != 3:  # Thursday
            d += timedelta(days=1)
        return d
    if key == "jeune_genevois":
        # Thursday after first Sunday of September
        d = date(year, 9, 1)
        while d.weekday() != 6:  # Sunday
            d += timedelta(days=1)
        return d + timedelta(days=4)  # Thursday
    if key in ("bettagsmontag", "lundi_jeune_federal"):
        # Monday after third Sunday of September
        d = date(year, 9, 1)
        sundays = 0
        while sundays < 3:
            if d.weekday() == 6:
                sundays += 1
            if sundays < 3:
                d += timedelta(days=1)
        return d + timedelta(days=1)  # Monday
    return None


def resolve_holiday_date(key: str, info: dict, year: int, moveable_dates: dict) -> date | None:
    """Resolve a holiday to a concrete date for a given year."""
    if "fixed" in info:
        month, day = info["fixed"]
        return date(year, month, day)
    if "moveable" in info:
        return moveable_dates.get(info["moveable"])
    if "note" in info:
        return compute_special_moveable(key, year)
    return None


def generate_year(year: int) -> list[dict]:
    """Generate canton-level holiday entries for a given year."""
    moveable = compute_moveable(year)
    entries = []

    for canton, holiday_keys in CANTON_HOLIDAYS.items():
        # Always add Bundesfeiertag
        all_keys = list(holiday_keys)
        if "bundesfeiertag" not in all_keys:
            all_keys.append("bundesfeiertag")

        holidays = []
        for key in all_keys:
            info = HOLIDAY_NAMES.get(key)
            if not info:
                continue

            d = resolve_holiday_date(key, info, year, moveable)
            if not d:
                continue

            holidays.append({
                "name": {
                    "de": info["de"],
                    "fr": info["fr"],
                    "it": info["it"],
                    "en": info["en"],
                },
                "start": d.isoformat(),
                "end": d.isoformat(),
                "type": "public_holiday",
            })

        # Sort by date
        holidays.sort(key=lambda h: h["start"])

        entries.append({
            "canton": canton,
            "year": year,
            "category": "worker",
            "holidays": holidays,
        })

    return entries


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate Swiss public holidays per canton per year")
    parser.add_argument("pdf", nargs="?", help="PDF file (for reference, data is hardcoded from parsed content)")
    parser.add_argument("--years", nargs="+", type=int, default=[2026, 2027], help="Years to generate")
    parser.add_argument("--output-dir", "-o", default="src/db/seed/holidays/ch", help="Output directory")

    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for year in args.years:
        entries = generate_year(year)
        total_holidays = sum(len(e["holidays"]) for e in entries)

        out_path = out_dir / f"workers_{year}.json"
        with open(out_path, "w") as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)

        print(f"{out_path}: {len(entries)} cantons, {total_holidays} holidays")

    print(f"\nDone. Generated for years: {', '.join(str(y) for y in args.years)}")

    # Print sample
    sample = generate_year(args.years[0])
    zh = next(e for e in sample if e["canton"] == "ZH")
    print(f"\nSample — ZH {args.years[0]}:")
    for h in zh["holidays"]:
        print(f"  {h['start']}  {h['name']['de']}")


if __name__ == "__main__":
    main()
