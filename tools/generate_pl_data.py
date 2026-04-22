#!/usr/bin/env python3
"""
Generate Polish holiday and municipality data for HCP.

Sources:
- Public holidays: Dz.U. 1951 nr 4 poz. 18 + amendments (Epiphany since 2011)
- School holidays: MEN (Ministerstwo Edukacji Narodowej) official calendars
- Universities: official semester calendars
- Municipalities: major Polish cities with PLZ, grouped by voivodeship
"""

import json
import os
from datetime import date, timedelta

# ── Output paths ────────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(BASE, "src", "db", "seed")
PL_DIR = os.path.join(SEED, "holidays", "pl")
GEMEINDEN_PATH = os.path.join(SEED, "gemeinden.json")
os.makedirs(PL_DIR, exist_ok=True)

# ── Voivodeships ─────────────────────────────────────────────────────────────
VOIVODESHIPS = {
    "DS": {"pl": "dolnośląskie",      "en": "Lower Silesia"},
    "KP": {"pl": "kujawsko-pomorskie","en": "Kuyavian-Pomeranian"},
    "LU": {"pl": "lubelskie",         "en": "Lublin"},
    "LB": {"pl": "lubuskie",          "en": "Lubusz"},
    "LD": {"pl": "łódzkie",           "en": "Łódź"},
    "MA": {"pl": "małopolskie",       "en": "Lesser Poland"},
    "MZ": {"pl": "mazowieckie",       "en": "Masovian"},
    "OP": {"pl": "opolskie",          "en": "Opole"},
    "PK": {"pl": "podkarpackie",      "en": "Subcarpathian"},
    "PD": {"pl": "podlaskie",         "en": "Podlaskie"},
    "PM": {"pl": "pomorskie",         "en": "Pomeranian"},
    "SL": {"pl": "śląskie",           "en": "Silesian"},
    "SK": {"pl": "świętokrzyskie",    "en": "Świętokrzyskie"},
    "WN": {"pl": "warmińsko-mazurskie","en": "Warmian-Masurian"},
    "WP": {"pl": "wielkopolskie",     "en": "Greater Poland"},
    "ZP": {"pl": "zachodniopomorskie","en": "West Pomeranian"},
}

# ── Easter algorithm (Anonymous Gregorian) ───────────────────────────────────
def easter(year):
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(114 + h + l - 7 * m, 31)
    return date(year, month, day + 1)

def fmt(d):
    return d.strftime("%Y-%m-%d")

def add(d, n):
    return d + timedelta(days=n)

# ── Polish public holidays ────────────────────────────────────────────────────
def workers_for_year(year):
    e = easter(year)
    holidays = [
        {"name": {"pl": "Nowy Rok",                    "de": "Neujahr",              "en": "New Year's Day",        "fr": "Nouvel An"},
         "start": f"{year}-01-01", "end": f"{year}-01-01", "type": "public_holiday"},
        {"name": {"pl": "Trzech Króli",                "de": "Heilige Drei Könige",  "en": "Epiphany",              "fr": "Épiphanie"},
         "start": f"{year}-01-06", "end": f"{year}-01-06", "type": "public_holiday"},
        {"name": {"pl": "Wielkanoc",                   "de": "Ostersonntag",         "en": "Easter Sunday",         "fr": "Pâques"},
         "start": fmt(e), "end": fmt(e), "type": "public_holiday"},
        {"name": {"pl": "Poniedziałek Wielkanocny",    "de": "Ostermontag",          "en": "Easter Monday",         "fr": "Lundi de Pâques"},
         "start": fmt(add(e, 1)), "end": fmt(add(e, 1)), "type": "public_holiday"},
        {"name": {"pl": "Święto Pracy",                "de": "Tag der Arbeit",       "en": "Labour Day",            "fr": "Fête du Travail"},
         "start": f"{year}-05-01", "end": f"{year}-05-01", "type": "public_holiday"},
        {"name": {"pl": "Święto Konstytucji 3 Maja",   "de": "Verfassungstag",       "en": "Constitution Day",      "fr": "Jour de la Constitution"},
         "start": f"{year}-05-03", "end": f"{year}-05-03", "type": "public_holiday"},
        {"name": {"pl": "Zielone Świątki",             "de": "Pfingstsonntag",       "en": "Whit Sunday",           "fr": "Pentecôte"},
         "start": fmt(add(e, 49)), "end": fmt(add(e, 49)), "type": "public_holiday"},
        {"name": {"pl": "Boże Ciało",                  "de": "Fronleichnam",         "en": "Corpus Christi",        "fr": "Fête-Dieu"},
         "start": fmt(add(e, 60)), "end": fmt(add(e, 60)), "type": "public_holiday"},
        {"name": {"pl": "Wniebowzięcie NMP",           "de": "Mariä Himmelfahrt",    "en": "Assumption Day",        "fr": "Assomption"},
         "start": f"{year}-08-15", "end": f"{year}-08-15", "type": "public_holiday"},
        {"name": {"pl": "Wszystkich Świętych",         "de": "Allerheiligen",        "en": "All Saints' Day",       "fr": "Toussaint"},
         "start": f"{year}-11-01", "end": f"{year}-11-01", "type": "public_holiday"},
        {"name": {"pl": "Święto Niepodległości",       "de": "Unabhängigkeitstag",   "en": "Independence Day",      "fr": "Jour de l'Indépendance"},
         "start": f"{year}-11-11", "end": f"{year}-11-11", "type": "public_holiday"},
        {"name": {"pl": "Boże Narodzenie",             "de": "Erster Weihnachtstag", "en": "Christmas Day",         "fr": "Noël"},
         "start": f"{year}-12-25", "end": f"{year}-12-25", "type": "public_holiday"},
        {"name": {"pl": "Drugi dzień Bożego Narodzenia","de": "Zweiter Weihnachtstag","en": "Second Day of Christmas","fr": "Lendemain de Noël"},
         "start": f"{year}-12-26", "end": f"{year}-12-26", "type": "public_holiday"},
    ]
    return holidays

def generate_workers(years):
    for year in years:
        holidays = workers_for_year(year)
        data = [
            {"canton": vwk, "year": year, "category": "worker", "holidays": holidays}
            for vwk in VOIVODESHIPS
        ]
        path = os.path.join(PL_DIR, f"workers_{year}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  workers_{year}.json  ({len(data)} voivodeships × {len(holidays)} holidays)")

# ── School holidays (ferie) ───────────────────────────────────────────────────
# MEN official zones for ferie zimowe (2-week winter break)
# Zone assignments rotate yearly. Official data 2025-2028, estimated beyond.
FERIE_ZIMOWE = {
    # year: {zone_voivodeships: (start, end)}
    2025: {
        frozenset(["KP","LB","MZ","WN"]): ("2025-01-20", "2025-02-02"),
        frozenset(["DS","LD","OP","ZP"]): ("2025-02-03", "2025-02-16"),
        frozenset(["LU","PK","PD","SK"]): ("2025-02-10", "2025-02-23"),
        frozenset(["MA","PM","SL","WP"]): ("2025-02-17", "2025-03-02"),
    },
    2026: {
        frozenset(["DS","LD","OP","ZP"]): ("2026-01-19", "2026-02-01"),
        frozenset(["LU","MA","PK","SK"]): ("2026-02-02", "2026-02-15"),
        frozenset(["PD","PM","SL","WP"]): ("2026-02-09", "2026-02-22"),
        frozenset(["KP","LB","MZ","WN"]): ("2026-02-16", "2026-03-01"),
    },
    2027: {
        frozenset(["LU","MA","PK","SK"]): ("2027-01-18", "2027-01-31"),
        frozenset(["PD","PM","SL","WP"]): ("2027-02-01", "2027-02-14"),
        frozenset(["KP","LB","MZ","WN"]): ("2027-02-08", "2027-02-21"),
        frozenset(["DS","LD","OP","ZP"]): ("2027-02-15", "2027-02-28"),
    },
    2028: {
        frozenset(["PD","PM","SL","WP"]): ("2028-01-17", "2028-01-30"),
        frozenset(["KP","LB","MZ","WN"]): ("2028-01-31", "2028-02-13"),
        frozenset(["DS","LD","OP","ZP"]): ("2028-02-07", "2028-02-20"),
        frozenset(["LU","MA","PK","SK"]): ("2028-02-14", "2028-02-27"),
    },
}

def get_ferie_for_voivodeship(year, vwk):
    zones = FERIE_ZIMOWE.get(year)
    if not zones:
        # Estimate: pattern repeats ~every 4 years with slight shift
        base_year = 2025 + ((year - 2025) % 4)
        zones = FERIE_ZIMOWE.get(base_year, {})
    for zone, dates in zones.items():
        if vwk in zone:
            return dates
    # Fallback: mid-February
    return (f"{year}-02-10", f"{year}-02-23")

def school_holidays_for(year, vwk):
    e = easter(year)
    ferie_start, ferie_end = get_ferie_for_voivodeship(year, vwk)

    # Summer break: June 21 – Aug 31 (or Sep 1 if it falls on weekend)
    summer_start = date(year, 6, 20)
    # Move to first Friday on or after June 20
    while summer_start.weekday() != 4:  # 4 = Friday
        summer_start += timedelta(days=1)
    summer_start += timedelta(days=1)  # Saturday after last school day

    # But classes finish on Friday and vacation starts Saturday/Monday
    # Official: vacation starts on Saturday after last class day
    # Simplification: June 21 as summer start
    summer_start = date(year, 6, 21)
    summer_end   = date(year, 8, 31)

    holidays = [
        # Christmas break (previous year end to Jan 1)
        {"name": {"pl": "Ferie świąteczne",    "de": "Weihnachtsferien",  "en": "Christmas holidays", "fr": "Vacances de Noël"},
         "start": f"{year-1}-12-23", "end": f"{year}-01-01", "type": "vacation"},
        # Winter break (ferie zimowe)
        {"name": {"pl": "Ferie zimowe",         "de": "Winterferien",      "en": "Winter holidays",    "fr": "Vacances d'hiver"},
         "start": ferie_start, "end": ferie_end, "type": "vacation"},
        # Easter break (Holy Thursday → Easter Monday)
        {"name": {"pl": "Przerwa wielkanocna",  "de": "Osterferien",       "en": "Easter break",       "fr": "Vacances de Pâques"},
         "start": fmt(add(e, -3)), "end": fmt(add(e, 1)), "type": "vacation"},
        # Summer break
        {"name": {"pl": "Wakacje letnie",       "de": "Sommerferien",      "en": "Summer holidays",    "fr": "Grandes vacances"},
         "start": fmt(summer_start), "end": fmt(summer_end), "type": "vacation"},
        # Christmas break (current year)
        {"name": {"pl": "Ferie świąteczne",    "de": "Weihnachtsferien",  "en": "Christmas holidays", "fr": "Vacances de Noël"},
         "start": f"{year}-12-23", "end": f"{year+1}-01-01", "type": "vacation"},
    ]
    return holidays

def generate_school(years):
    for year in years:
        data = []
        for vwk in VOIVODESHIPS:
            data.append({
                "canton": vwk,
                "year": year,
                "category": "school",
                "holidays": school_holidays_for(year, vwk),
            })
        path = os.path.join(PL_DIR, f"school_{year}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  school_{year}.json   ({len(data)} voivodeships)")

# ── University / student holidays ─────────────────────────────────────────────
UNIVERSITIES = [
    # (gemeinde_id, name, code, voivodeship)
    ("pl-mz-warszawa",    "Uniwersytet Warszawski",     "UW",    "MZ"),
    ("pl-mz-warszawa",    "Politechnika Warszawska",    "PW",    "MZ"),
    ("pl-ma-krakow",      "Uniwersytet Jagielloński",   "UJ",    "MA"),
    ("pl-ma-krakow",      "AGH Kraków",                 "AGH",   "MA"),
    ("pl-ds-wroclaw",     "Politechnika Wrocławska",    "PWR",   "DS"),
    ("pl-ds-wroclaw",     "Uniwersytet Wrocławski",     "UWR",   "DS"),
    ("pl-pm-gdansk",      "Politechnika Gdańska",       "PG",    "PM"),
    ("pl-pm-gdansk",      "Uniwersytet Gdański",        "UG",    "PM"),
    ("pl-ld-lodz",        "Politechnika Łódzka",        "TUL",   "LD"),
    ("pl-sl-gliwice",     "Politechnika Śląska",        "PolSl", "SL"),
    ("pl-wp-poznan",      "Politechnika Poznańska",     "PP",    "WP"),
    ("pl-wp-poznan",      "Uniwersytet im. A. Mickiewicza","UAM","WP"),
    ("pl-mz-warszawa",    "Szkoła Główna Handlowa",     "SGH",   "MZ"),
    ("pl-ma-krakow",      "Politechnika Krakowska",     "PK-KR", "MA"),
    ("pl-kp-bydgoszcz",   "Uniwersytet Kazimierza Wielkiego","UKW","KP"),
    ("pl-lu-lublin",      "Politechnika Lubelska",      "PL-LU", "LU"),
    ("pl-pk-rzeszow",     "Politechnika Rzeszowska",    "PRZ",   "PK"),
    ("pl-wn-olsztyn",     "Uniwersytet Warmińsko-Mazurski","UWM","WN"),
    ("pl-sk-kielce",      "Politechnika Świętokrzyska", "PSwK",  "SK"),
    ("pl-pd-bialystok",   "Politechnika Białostocka",   "PB",    "PD"),
]

def student_holidays_for_year(year, gemeinde_id):
    """Polish university semester dates (approximate, based on typical academic calendar)."""
    e = easter(year)
    return [
        # Winter exam session + break
        {"name": {"pl": "Przerwa zimowa",       "en": "Winter break",        "de": "Winterpause",      "fr": "Pause hivernale"},
         "start": f"{year}-01-15", "end": f"{year}-02-15", "type": "vacation"},
        # Spring exam session
        {"name": {"pl": "Przerwa wielkanocna",  "en": "Easter break",        "de": "Osterpause",       "fr": "Pause pascale"},
         "start": fmt(add(e, -3)), "end": fmt(add(e, 1)), "type": "vacation"},
        # Summer break
        {"name": {"pl": "Wakacje",              "en": "Summer break",        "de": "Sommerferien",     "fr": "Vacances d'été"},
         "start": f"{year}-06-20", "end": f"{year}-09-30", "type": "vacation"},
    ]

def generate_students(years):
    data = []
    for year in years:
        for gemeinde_id, name, code, vwk in UNIVERSITIES:
            data.append({
                "gemeinde_id": gemeinde_id,
                "year": year,
                "category": "student",
                "holidays": student_holidays_for_year(year, gemeinde_id),
            })
    path = os.path.join(PL_DIR, "students.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  students.json  ({len(data)} entries)")

# ── Municipality / Gemeinden data ─────────────────────────────────────────────
POLISH_CITIES = [
    # (id, name, voivodeship, plz_list)
    # DS - Dolnośląskie
    ("pl-ds-wroclaw",     "Wrocław",            "DS", ["50-001","50-370","51-001"]),
    ("pl-ds-legnica",     "Legnica",            "DS", ["59-220"]),
    ("pl-ds-walbrzych",   "Wałbrzych",          "DS", ["58-300"]),
    ("pl-ds-jelenia-gora","Jelenia Góra",       "DS", ["58-500"]),
    ("pl-ds-lubin",       "Lubin",              "DS", ["59-300"]),
    ("pl-ds-boleslawiec", "Bolesławiec",        "DS", ["59-700"]),
    ("pl-ds-glogow",      "Głogów",             "DS", ["67-200"]),
    ("pl-ds-swidnica",    "Świdnica",           "DS", ["58-100"]),
    ("pl-ds-dzierzoniow", "Dzierżoniów",        "DS", ["58-200"]),
    # KP - Kujawsko-Pomorskie
    ("pl-kp-bydgoszcz",   "Bydgoszcz",         "KP", ["85-001","85-066"]),
    ("pl-kp-torun",       "Toruń",             "KP", ["87-100"]),
    ("pl-kp-wloclawek",   "Włocławek",         "KP", ["87-800"]),
    ("pl-kp-grudziadz",   "Grudziądz",         "KP", ["86-300"]),
    ("pl-kp-inowroclaw",  "Inowrocław",        "KP", ["88-100"]),
    ("pl-kp-bydgoszcz",   "Bydgoszcz",         "KP", ["85-001"]),
    # LU - Lubelskie
    ("pl-lu-lublin",      "Lublin",            "LU", ["20-001","20-950"]),
    ("pl-lu-chelm",       "Chełm",             "LU", ["22-100"]),
    ("pl-lu-zamosc",      "Zamość",            "LU", ["22-400"]),
    ("pl-lu-biala-podlaska","Biała Podlaska",  "LU", ["21-500"]),
    ("pl-lu-pulawy",      "Puławy",            "LU", ["24-100"]),
    # LB - Lubuskie
    ("pl-lb-zielona-gora","Zielona Góra",      "LB", ["65-001","65-066"]),
    ("pl-lb-gorzow",      "Gorzów Wielkopolski","LB",["66-400"]),
    ("pl-lb-nowa-sol",    "Nowa Sól",          "LB", ["67-100"]),
    # LD - Łódzkie
    ("pl-ld-lodz",        "Łódź",              "LD", ["90-001","90-950","91-001","92-001","93-001"]),
    ("pl-ld-piotrkow",    "Piotrków Trybunalski","LD",["97-300"]),
    ("pl-ld-skierniewice","Skierniewice",      "LD", ["96-100"]),
    ("pl-ld-pabianice",   "Pabianice",         "LD", ["95-200"]),
    ("pl-ld-tomaszow",    "Tomaszów Mazowiecki","LD",["97-200"]),
    # MA - Małopolskie
    ("pl-ma-krakow",      "Kraków",            "MA", ["30-001","31-001","32-001"]),
    ("pl-ma-nowy-sacz",   "Nowy Sącz",         "MA", ["33-300"]),
    ("pl-ma-tarnow",      "Tarnów",            "MA", ["33-100"]),
    ("pl-ma-oswiecim",    "Oświęcim",          "MA", ["32-600"]),
    ("pl-ma-nowy-targ",   "Nowy Targ",         "MA", ["34-400"]),
    ("pl-ma-zakopane",    "Zakopane",          "MA", ["34-500"]),
    ("pl-ma-chrzanow",    "Chrzanów",          "MA", ["32-500"]),
    # MZ - Mazowieckie
    ("pl-mz-warszawa",    "Warszawa",          "MZ", ["00-001","00-950","01-001","02-001","03-001","04-001"]),
    ("pl-mz-radom",       "Radom",             "MZ", ["26-600"]),
    ("pl-mz-plock",       "Płock",             "MZ", ["09-400"]),
    ("pl-mz-siedlce",     "Siedlce",           "MZ", ["08-100"]),
    ("pl-mz-ostroleka",   "Ostrołęka",         "MZ", ["07-400"]),
    ("pl-mz-legionowo",   "Legionowo",         "MZ", ["05-120"]),
    ("pl-mz-pruszkow",    "Pruszków",          "MZ", ["05-800"]),
    ("pl-mz-nowy-dwor",   "Nowy Dwór Mazowiecki","MZ",["05-100"]),
    # OP - Opolskie
    ("pl-op-opole",       "Opole",             "OP", ["45-001","45-055"]),
    ("pl-op-kedzierzyn",  "Kędzierzyn-Koźle",  "OP", ["47-200"]),
    ("pl-op-nysa",        "Nysa",              "OP", ["48-300"]),
    ("pl-op-brzeg",       "Brzeg",             "OP", ["49-300"]),
    # PK - Podkarpackie
    ("pl-pk-rzeszow",     "Rzeszów",           "PK", ["35-001","35-959"]),
    ("pl-pk-przemysl",    "Przemyśl",          "PK", ["37-700"]),
    ("pl-pk-stalowa-wola","Stalowa Wola",      "PK", ["37-450"]),
    ("pl-pk-mielec",      "Mielec",            "PK", ["39-300"]),
    ("pl-pk-krosno",      "Krosno",            "PK", ["38-400"]),
    ("pl-pk-tarnobrzeg",  "Tarnobrzeg",        "PK", ["39-400"]),
    # PD - Podlaskie
    ("pl-pd-bialystok",   "Białystok",         "PD", ["15-001","15-950"]),
    ("pl-pd-suwalki",     "Suwałki",           "PD", ["16-400"]),
    ("pl-pd-lomza",       "Łomża",             "PD", ["18-400"]),
    ("pl-pd-augustow",    "Augustów",          "PD", ["16-300"]),
    # PM - Pomorskie
    ("pl-pm-gdansk",      "Gdańsk",            "PM", ["80-001","80-950","81-001"]),
    ("pl-pm-gdynia",      "Gdynia",            "PM", ["81-001","81-451"]),
    ("pl-pm-sopot",       "Sopot",             "PM", ["81-800"]),
    ("pl-pm-slupsk",      "Słupsk",            "PM", ["76-200"]),
    ("pl-pm-starogard",   "Starogard Gdański", "PM", ["83-200"]),
    ("pl-pm-tczew",       "Tczew",             "PM", ["83-110"]),
    ("pl-pm-rumia",       "Rumia",             "PM", ["84-230"]),
    # SL - Śląskie
    ("pl-sl-katowice",    "Katowice",          "SL", ["40-001","40-951"]),
    ("pl-sl-czestochowa", "Częstochowa",       "SL", ["42-200"]),
    ("pl-sl-sosnowiec",   "Sosnowiec",         "SL", ["41-200"]),
    ("pl-sl-gliwice",     "Gliwice",           "SL", ["44-100"]),
    ("pl-sl-zabrze",      "Zabrze",            "SL", ["41-800"]),
    ("pl-sl-bytom",       "Bytom",             "SL", ["41-902"]),
    ("pl-sl-rybnik",      "Rybnik",            "SL", ["44-200"]),
    ("pl-sl-tychy",       "Tychy",             "SL", ["43-100"]),
    ("pl-sl-bielsko-biala","Bielsko-Biała",    "SL", ["43-300"]),
    ("pl-sl-dabrowa",     "Dąbrowa Górnicza",  "SL", ["41-300"]),
    ("pl-sl-jastrzebie",  "Jastrzębie-Zdrój",  "SL", ["44-330"]),
    ("pl-sl-siemianowice","Siemianowice Śląskie","SL",["41-100"]),
    ("pl-sl-zory",        "Żory",              "SL", ["44-240"]),
    ("pl-sl-jaworzno",    "Jaworzno",          "SL", ["43-600"]),
    ("pl-sl-myslowice",   "Mysłowice",         "SL", ["41-400"]),
    ("pl-sl-chorzow",     "Chorzów",           "SL", ["41-500"]),
    # SK - Świętokrzyskie
    ("pl-sk-kielce",      "Kielce",            "SK", ["25-001","25-516"]),
    ("pl-sk-ostrowiec",   "Ostrowiec Świętokrzyski","SK",["27-400"]),
    ("pl-sk-starachowice","Starachowice",      "SK", ["27-200"]),
    ("pl-sk-skarzysko",   "Skarżysko-Kamienna","SK", ["26-110"]),
    ("pl-sk-radom",       "Radomsko",          "SK", ["97-500"]),
    # WN - Warmińsko-Mazurskie
    ("pl-wn-olsztyn",     "Olsztyn",           "WN", ["10-001","10-959"]),
    ("pl-wn-elblag",      "Elbląg",            "WN", ["82-300"]),
    ("pl-wn-elk",         "Ełk",               "WN", ["19-300"]),
    ("pl-wn-ostróda",     "Ostróda",           "WN", ["14-100"]),
    ("pl-wn-ilawa",       "Iława",             "WN", ["14-200"]),
    # WP - Wielkopolskie
    ("pl-wp-poznan",      "Poznań",            "WP", ["60-001","61-001","62-001"]),
    ("pl-wp-kalisz",      "Kalisz",            "WP", ["62-800"]),
    ("pl-wp-leszno",      "Leszno",            "WP", ["64-100"]),
    ("pl-wp-konin",       "Konin",             "WP", ["62-500"]),
    ("pl-wp-gniezno",     "Gniezno",           "WP", ["62-200"]),
    ("pl-wp-pila",        "Piła",              "WP", ["64-920"]),
    ("pl-wp-ostrów",      "Ostrów Wielkopolski","WP",["63-400"]),
    ("pl-wp-kalisz",      "Kalisz",            "WP", ["62-800"]),
    # ZP - Zachodniopomorskie
    ("pl-zp-szczecin",    "Szczecin",          "ZP", ["70-001","70-952","71-001"]),
    ("pl-zp-koszalin",    "Koszalin",          "ZP", ["75-001"]),
    ("pl-zp-swinoujscie", "Świnoujście",       "ZP", ["72-600"]),
    ("pl-zp-stargard",    "Stargard",          "ZP", ["73-110"]),
    ("pl-zp-kolobrzeg",   "Kołobrzeg",         "ZP", ["78-100"]),
    ("pl-zp-polic",       "Police",            "ZP", ["72-010"]),
]

def generate_gemeinden():
    """Add Polish cities to gemeinden.json."""
    with open(GEMEINDEN_PATH, encoding="utf-8") as f:
        gemeinden = json.load(f)

    # Remove existing PL entries (re-run safety)
    gemeinden = [g for g in gemeinden if g.get("country") != "PL"]

    # Deduplicate by id
    seen = set()
    new_entries = []
    for id_, name, vwk, plz in POLISH_CITIES:
        if id_ in seen:
            continue
        seen.add(id_)
        new_entries.append({
            "id": id_,
            "name": name,
            "canton": vwk,
            "country": "PL",
            "language": "pl",
            "plz": plz,
        })

    gemeinden.extend(new_entries)

    with open(GEMEINDEN_PATH, "w", encoding="utf-8") as f:
        json.dump(gemeinden, f, ensure_ascii=False, indent=2)
    print(f"  gemeinden.json  +{len(new_entries)} PL cities (total: {len(gemeinden)})")

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    WORKER_YEARS  = list(range(2025, 2036))
    SCHOOL_YEARS  = list(range(2025, 2029))
    STUDENT_YEARS = list(range(2025, 2029))

    print("Generating workers holidays...")
    generate_workers(WORKER_YEARS)

    print("Generating school holidays...")
    generate_school(SCHOOL_YEARS)

    print("Generating student holidays...")
    generate_students(STUDENT_YEARS)

    print("Adding municipalities to gemeinden.json...")
    generate_gemeinden()

    print("\nDone. Next steps:")
    print("  1. Register 'pl' in src/db/seed/loader.js")
    print("  2. Bump SEED_VERSION in src/db/store.js")
    print("  3. npm run build")
