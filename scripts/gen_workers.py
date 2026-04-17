#!/usr/bin/env python3
"""
Generate workers_YYYY.json holiday files for CH, DE, FR
using the Python `holidays` library (https://pypi.org/project/holidays/).

Output format matches src/db/seed/holidays/_schema.json
"""

import holidays
import json
import os
from datetime import date

YEARS = range(2025, 2036)

CH_CANTONS = ['ZH','BE','LU','UR','SZ','OW','NW','GL','ZG','FR','SO',
               'BS','BL','SH','AR','AI','SG','GR','AG','TG','TI','VD',
               'VS','NE','GE','JU']

DE_STATES  = ['BB','BE','BW','BY','HB','HE','HH','MV',
               'NI','NW','RP','SH','SL','SN','ST','TH']

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'db', 'seed', 'holidays')


def get_names(country, year, subdivision=None):
    """Return {date: {de, fr, it, en}} for every public holiday."""
    langs = ['de', 'fr', 'it', 'en'] if country == 'CH' else (
            ['de', 'en']              if country == 'DE' else
            ['fr', 'de', 'en'])

    results = {}
    for lang in langs:
        try:
            if subdivision:
                h = holidays.country_holidays(country, subdiv=subdivision,
                                              years=year, language=lang)
            else:
                h = holidays.country_holidays(country, years=year, language=lang)
            for d, name in h.items():
                if d not in results:
                    results[d] = {}
                results[d][lang] = name
        except Exception:
            pass

    # Fallback: fill missing langs from any available
    for d in results:
        fallback = next(iter(results[d].values()), '')
        for lang in ['de', 'fr', 'it', 'en']:
            if lang not in results[d]:
                results[d][lang] = fallback

    return results


def build_entry(canton, year, country):
    name_map = get_names(country, year, canton if country != 'FR' else None)
    if not name_map:
        return None

    holidays_list = []
    for d in sorted(name_map):
        names = name_map[d]
        entry = {
            'name': {k: v for k, v in names.items() if v},
            'start': d.isoformat(),
            'end':   d.isoformat(),
            'type':  'public_holiday',
        }
        # Remove redundant langs for DE (only de+en) and FR (fr+de+en)
        if country == 'DE':
            entry['name'] = {k: v for k, v in entry['name'].items() if k in ('de', 'en')}
        elif country == 'FR':
            entry['name'] = {k: v for k, v in entry['name'].items() if k in ('fr', 'de', 'en')}
        holidays_list.append(entry)

    return {
        'canton':   canton,
        'year':     year,
        'category': 'worker',
        'holidays': holidays_list,
    }


def generate_country(country, subdivisions, years):
    for year in years:
        out_path = os.path.join(OUT_DIR, country.lower(), f'workers_{year}.json')
        entries = []
        for sub in subdivisions:
            entry = build_entry(sub, year, country)
            if entry:
                entries.append(entry)

        if entries:
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(entries, f, ensure_ascii=False, indent=2)
            print(f'  wrote {out_path} ({len(entries)} regions)')
        else:
            print(f'  SKIP {out_path} — no data')


FR_DE = {
    "Jour de l'an":          "Neujahrstag",
    "Lundi de Pâques":       "Ostermontag",
    "Fête du Travail":       "Tag der Arbeit",
    "Victoire en Europe":    "Tag des Sieges 1945",
    "Victoire 1945":         "Tag des Sieges 1945",
    "Fête de la Victoire":   "Tag des Sieges 1945",
    "Ascension":             "Christi Himmelfahrt",
    "Lundi de Pentecôte":    "Pfingstmontag",
    "Fête Nationale":        "Nationalfeiertag",
    "Fête nationale":        "Nationalfeiertag",
    "Assomption":            "Mariä Himmelfahrt",
    "Toussaint":             "Allerheiligen",
    "Armistice":             "Waffenstillstand 1918",
    "Noël":                  "Weihnachtstag",
}

FR_EN = {
    "Jour de l'an":          "New Year's Day",
    "Lundi de Pâques":       "Easter Monday",
    "Fête du Travail":       "Labour Day",
    "Victoire en Europe":    "Victory in Europe Day",
    "Victoire 1945":         "Victory in Europe Day",
    "Fête de la Victoire":   "Victory in Europe Day",
    "Ascension":             "Ascension Day",
    "Lundi de Pentecôte":    "Whit Monday",
    "Fête Nationale":        "Bastille Day",
    "Fête nationale":        "Bastille Day",
    "Assomption":            "Assumption of Mary",
    "Toussaint":             "All Saints' Day",
    "Armistice":             "Armistice Day",
    "Noël":                  "Christmas Day",
}

def generate_fr(years):
    """FR: national holidays only — same for everyone, one entry per year."""
    for year in years:
        out_path = os.path.join(OUT_DIR, 'fr', f'workers_{year}.json')
        # Read existing to preserve zones structure if present
        # FR public holidays are national — use existing Zone structure
        zones = ['Zone-A', 'Zone-B', 'Zone-C']
        name_map = get_names('FR', year)
        if not name_map:
            print(f'  SKIP {out_path} — no data')
            continue

        holidays_list = []
        for d in sorted(name_map):
            fr_name = name_map[d].get('fr', '')
            entry = {
                'name': {
                    'fr': fr_name,
                    'de': FR_DE.get(fr_name, fr_name),
                    'en': FR_EN.get(fr_name, fr_name),
                },
                'start': d.isoformat(),
                'end':   d.isoformat(),
                'type':  'public_holiday',
            }
            holidays_list.append(entry)

        # Same holidays for all zones (French public holidays are national)
        entries = [{'canton': z, 'year': year, 'category': 'worker',
                    'holidays': holidays_list} for z in zones]

        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
        print(f'  wrote {out_path} ({len(zones)} zones, {len(holidays_list)} holidays)')


if __name__ == '__main__':
    print('Generating CH workers...')
    generate_country('CH', CH_CANTONS, YEARS)

    print('Generating DE workers...')
    generate_country('DE', DE_STATES, YEARS)

    print('Generating FR workers...')
    generate_fr(YEARS)

    print('Done.')
