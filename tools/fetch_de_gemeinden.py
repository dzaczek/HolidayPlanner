#!/usr/bin/env python3
"""
Fetch German municipality (Gemeinde) data from GeoNames postal codes.

Downloads DE.zip from GeoNames, extracts unique municipalities with PLZ,
and outputs entries compatible with HCP gemeinden.json format.

Usage:
    python3 tools/fetch_de_gemeinden.py
    python3 tools/fetch_de_gemeinden.py --output src/db/seed/gemeinden_de.json
    python3 tools/fetch_de_gemeinden.py --merge   # merge into gemeinden.json directly

Source: https://download.geonames.org/export/zip/DE.zip (CC BY 4.0)
"""

import argparse
import csv
import io
import json
import os
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from urllib.request import urlretrieve

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
GEMEINDEN_PATH = PROJECT_ROOT / "src" / "db" / "seed" / "gemeinden.json"

GEONAMES_URL = "https://download.geonames.org/export/zip/DE.zip"

# Map GeoNames state names (mixed EN/DE) to standard Bundesland 2-letter codes
STATE_MAP = {
    "Baden-Württemberg": "BW",
    "Bayern": "BY",
    "Bavaria": "BY",
    "Berlin": "BE",
    "Land Berlin": "BE",
    "Brandenburg": "BB",
    "Bremen": "HB",
    "Hamburg": "HH",
    "Hessen": "HE",
    "Mecklenburg-Vorpommern": "MV",
    "Mecklenburg-Western Pomerania": "MV",
    "Niedersachsen": "NI",
    "Lower Saxony": "NI",
    "Nordrhein-Westfalen": "NW",
    "North Rhine-Westphalia": "NW",
    "Rheinland-Pfalz": "RP",
    "Rhineland-Palatinate": "RP",
    "Saarland": "SL",
    "Sachsen": "SN",
    "Saxony": "SN",
    "Sachsen-Anhalt": "ST",
    "Saxony-Anhalt": "ST",
    "Schleswig-Holstein": "SH",
    "Thüringen": "TH",
    "Thuringia": "TH",
}

# Patterns that indicate company/institution/special PLZ entries (not real places)
COMPANY_PATTERNS = re.compile(
    r"(GmbH|AG\b|KG\b|OHG|e\.V\.|mbH|UG\b|SE\b|Ltd|Inc|Corp|Stiftung|Verlag|"
    r"Versicherung|Insurance|Bank\b|Postfach|Großkunde|ADAC\b|DHL\b|Amazon\b|"
    r"Agentur für Arbeit|Bundesanstalt|Finanzamt|Zollamt|Jobcenter|"
    r"AOK\b|BKK\b|DAK\b|TK\b|Barmer|Techniker Krankenkasse|"
    r"Landesamt|Bundesamt|Landgericht|Amtsgericht|Polizei|"
    r"Universität|Hochschule|Fachhochschule|"
    r"Sparkasse|Volksbank|Commerzbank|Deutsche Bank|"
    r"Telekom|Vodafone|Deutsche Post|Hermes|DPD|GLS\b|UPS\b|FedEx|"
    r"Klinik\b|Krankenhaus|Hospital|Caritas|Diakonie|"
    r"Bezirksregierung|Regierungspräsidium|Handwerkskammer|IHK\b|"
    r"Landeskirche|Bistum|Erzbistum|Kirchenamt|"
    r"Rundfunk|Fernsehen|SWR\b|NDR\b|WDR\b|MDR\b|ZDF\b|ARD\b)",
    re.IGNORECASE,
)


def download_geonames(dest):
    """Download GeoNames DE.zip to dest path."""
    print(f"  Downloading {GEONAMES_URL} ...")
    urlretrieve(GEONAMES_URL, dest)
    print(f"  Downloaded: {os.path.getsize(dest)} bytes")


def parse_geonames(zip_path):
    """
    Parse DE.txt from GeoNames zip.
    Returns dict of {(name, bundesland_code): {name, canton, plzs, admin3_code}}.
    """
    gemeinden = {}

    with zipfile.ZipFile(zip_path) as zf:
        with zf.open("DE.txt") as f:
            for raw_line in f:
                line = raw_line.decode("utf-8").strip()
                parts = line.split("\t")
                if len(parts) < 10:
                    continue

                country = parts[0]
                plz = parts[1]
                place = parts[2]
                state_name = parts[3]
                admin3_code = parts[8] if len(parts) > 8 else ""

                # Map state name to Bundesland code
                bl = STATE_MAP.get(state_name)
                if not bl:
                    continue

                # Skip company/special PLZ entries
                if COMPANY_PATTERNS.search(place):
                    continue

                # Skip entries with PLZ outside normal range
                if not plz.isdigit() or len(plz) != 5:
                    continue

                # Group by (place_name, bundesland)
                key = (place, bl)
                if key not in gemeinden:
                    gemeinden[key] = {
                        "name": place,
                        "canton": bl,
                        "admin3": admin3_code,
                        "plzs": set(),
                    }
                gemeinden[key]["plzs"].add(plz)

    return gemeinden


def build_gemeinden_entries(raw_data):
    """Convert parsed data into gemeinden.json format entries."""
    entries = []
    # Generate stable IDs from admin3_code or name hash
    seen_ids = set()

    for (name, bl), data in sorted(raw_data.items(), key=lambda x: (x[0][1], x[0][0])):
        # Use admin3_code (Gemeindeschlüssel) as ID if available, else generate
        admin3 = data["admin3"]
        if admin3 and admin3 not in seen_ids:
            gid = f"de-{admin3}"
            seen_ids.add(admin3)
        else:
            # Fallback: generate from name + BL
            slug = re.sub(r"[^a-z0-9]", "", name.lower())[:20]
            gid = f"de-{bl.lower()}-{slug}"
            # Ensure uniqueness
            base = gid
            counter = 2
            while gid in seen_ids:
                gid = f"{base}{counter}"
                counter += 1
            seen_ids.add(gid)

        plzs = sorted(data["plzs"])

        entries.append(
            {
                "id": gid,
                "name": name,
                "canton": bl,
                "country": "DE",
                "language": "de",
                "plz": plzs,
            }
        )

    return entries


def merge_into_gemeinden(de_entries, gemeinden_path):
    """Merge DE entries into existing gemeinden.json, replacing old DE entries."""
    if gemeinden_path.exists():
        with open(gemeinden_path, "r", encoding="utf-8") as f:
            existing = json.load(f)
    else:
        existing = []

    # Remove old DE entries
    non_de = [g for g in existing if g.get("country") != "DE"]
    merged = non_de + de_entries

    with open(gemeinden_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
        f.write("\n")

    return len(non_de), len(de_entries)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch German municipality data from GeoNames"
    )
    parser.add_argument(
        "--output",
        "-o",
        type=str,
        default=None,
        help="Output JSON file (default: print stats only)",
    )
    parser.add_argument(
        "--merge",
        action="store_true",
        help="Merge into gemeinden.json directly",
    )
    parser.add_argument(
        "--zip",
        type=str,
        default=None,
        help="Use existing DE.zip instead of downloading",
    )
    args = parser.parse_args()

    # Download
    if args.zip:
        zip_path = args.zip
    else:
        zip_path = "/tmp/de_geonames.zip"
        download_geonames(zip_path)

    # Parse
    print("  Parsing GeoNames data...")
    raw = parse_geonames(zip_path)
    print(f"  Found {len(raw)} unique places")

    # Build entries
    entries = build_gemeinden_entries(raw)

    # Stats
    by_bl = defaultdict(int)
    for e in entries:
        by_bl[e["canton"]] += 1
    total_plz = sum(len(e["plz"]) for e in entries)

    print(f"\n  Results:")
    print(f"  {'Bundesland':<5} {'Count':>6}")
    print(f"  {'─'*5} {'─'*6}")
    for bl in sorted(by_bl.keys()):
        print(f"  {bl:<5} {by_bl[bl]:>6}")
    print(f"  {'─'*5} {'─'*6}")
    print(f"  Total: {len(entries)} municipalities, {total_plz} PLZ entries")

    # Output
    if args.merge:
        kept, added = merge_into_gemeinden(entries, GEMEINDEN_PATH)
        print(f"\n  Merged into {GEMEINDEN_PATH}")
        print(f"  Kept {kept} non-DE entries, added {added} DE entries")
    elif args.output:
        out_path = Path(args.output)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"\n  Written to {out_path}")
    else:
        print(f"\n  Dry run. Use --merge or --output <file> to save.")
        print(f"  Sample entries:")
        for e in entries[:5]:
            print(f"    {e['id']}: {e['name']} ({e['canton']}) PLZ={e['plz'][:3]}")


if __name__ == "__main__":
    main()
