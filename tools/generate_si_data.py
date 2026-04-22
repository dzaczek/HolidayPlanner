#!/usr/bin/env python3
"""Generate Slovenian holiday data for HCP (workers, school, students, gemeinden)."""

import json
import os
from datetime import date, timedelta

OUTPUT_BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../src/db/seed/holidays/si")
os.makedirs(OUTPUT_BASE, exist_ok=True)

# 12 statistical regions used as "cantons"
REGIONS = ["OS", "GO", "PD", "SA", "KO", "PO", "ZA", "PS", "JV", "GR", "OK", "PN"]

# Winter-break groups (Ministry of Education split)
# Group A: central/western: Ljubljana, Gorenjska, Koroška, Primorsko-notranjska
# Group B: eastern/coastal: Maribor, Celje, Pomurska, Zasavska, Posavska, JV, Goriška, Obalno
GROUP_A = {"OS", "GO", "KO", "PN"}
GROUP_B = {"PD", "SA", "PO", "ZA", "PS", "JV", "GR", "OK"}


# ─── Easter algorithm (Anonymous Gregorian) ───────────────────────────────────
def easter(year):
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def fmt(d):
    return d.strftime("%Y-%m-%d")


# ─── National public holidays (same for all regions) ─────────────────────────
def national_holidays(year):
    e = easter(year)
    return [
        ("Novo leto",                        date(year, 1, 1),        date(year, 1, 1),        "public"),
        ("Novo leto",                        date(year, 1, 2),        date(year, 1, 2),        "public"),
        ("Prešernov dan",                    date(year, 2, 8),        date(year, 2, 8),        "public"),
        ("Velika noč",                       e,                       e,                       "public"),
        ("Velikonočni ponedeljek",           e + timedelta(1),        e + timedelta(1),        "public"),
        ("Dan upora proti okupatorju",       date(year, 4, 27),       date(year, 4, 27),       "public"),
        ("Praznik dela",                     date(year, 5, 1),        date(year, 5, 1),        "public"),
        ("Praznik dela",                     date(year, 5, 2),        date(year, 5, 2),        "public"),
        ("Binkošti",                         e + timedelta(49),       e + timedelta(49),       "public"),
        ("Dan državnosti",                   date(year, 6, 25),       date(year, 6, 25),       "public"),
        ("Marijino vnebovzetje",             date(year, 8, 15),       date(year, 8, 15),       "public"),
        ("Dan reformacije",                  date(year, 10, 31),      date(year, 10, 31),      "public"),
        ("Dan spomina na mrtve",             date(year, 11, 1),       date(year, 11, 1),       "public"),
        ("Božič",                            date(year, 12, 25),      date(year, 12, 25),      "public"),
        ("Dan samostojnosti in enotnosti",   date(year, 12, 26),      date(year, 12, 26),      "public"),
    ]


# ─── School holiday calendar ─────────────────────────────────────────────────
# Source: Ministrstvo za izobraževanje, known 2025-2028; estimated beyond.
# Each entry: (autumn_start, autumn_end, xmas_start, xmas_end,
#              winter_A_start, winter_A_end, winter_B_start, winter_B_end,
#              spring_start, spring_end, summer_start, summer_end)

SCHOOL = {
    2025: {
        "autumn":   (date(2025, 10, 27), date(2025, 10, 31)),
        "xmas":     (date(2025, 12, 22), date(2026,  1,  2)),
        "winterA":  (date(2025,  2, 17), date(2025,  2, 21)),
        "winterB":  (date(2025,  2, 24), date(2025,  2, 28)),
        "spring":   (date(2025,  4, 28), date(2025,  5,  2)),
        "summer":   (date(2025,  6, 27), date(2025,  8, 31)),
    },
    2026: {
        "autumn":   (date(2026, 10, 26), date(2026, 10, 30)),
        "xmas":     (date(2026, 12, 21), date(2027,  1,  1)),
        "winterA":  (date(2026,  2, 16), date(2026,  2, 20)),
        "winterB":  (date(2026,  2, 23), date(2026,  2, 27)),
        "spring":   (date(2026,  4, 27), date(2026,  5,  1)),
        "summer":   (date(2026,  6, 26), date(2026,  8, 31)),
    },
    2027: {
        "autumn":   (date(2027, 10, 25), date(2027, 10, 29)),
        "xmas":     (date(2027, 12, 27), date(2028,  1,  7)),
        "winterA":  (date(2027,  2, 15), date(2027,  2, 19)),
        "winterB":  (date(2027,  2, 22), date(2027,  2, 26)),
        "spring":   (date(2027,  4, 26), date(2027,  4, 30)),
        "summer":   (date(2027,  6, 25), date(2027,  8, 31)),
    },
    2028: {
        "autumn":   (date(2028, 10, 30), date(2028, 11,  3)),
        "xmas":     (date(2028, 12, 25), date(2029,  1,  4)),
        "winterA":  (date(2028,  2, 14), date(2028,  2, 18)),
        "winterB":  (date(2028,  2, 21), date(2028,  2, 25)),
        "spring":   (date(2028,  4, 24), date(2028,  4, 28)),
        "summer":   (date(2028,  6, 23), date(2028,  8, 31)),
    },
    # Estimated from here on (last Monday of October etc.)
    2029: {
        "autumn":   (date(2029, 10, 28), date(2029, 11,  1)),
        "xmas":     (date(2029, 12, 23), date(2030,  1,  3)),
        "winterA":  (date(2029,  2, 18), date(2029,  2, 22)),
        "winterB":  (date(2029,  2, 25), date(2029,  3,  1)),
        "spring":   (date(2029,  4, 28), date(2029,  5,  2)),
        "summer":   (date(2029,  6, 28), date(2029,  8, 31)),
    },
    2030: {
        "autumn":   (date(2030, 10, 28), date(2030, 11,  1)),
        "xmas":     (date(2030, 12, 23), date(2031,  1,  2)),
        "winterA":  (date(2030,  2, 17), date(2030,  2, 21)),
        "winterB":  (date(2030,  2, 24), date(2030,  2, 28)),
        "spring":   (date(2030,  4, 28), date(2030,  5,  2)),
        "summer":   (date(2030,  6, 27), date(2030,  8, 31)),
    },
    2031: {
        "autumn":   (date(2031, 10, 27), date(2031, 10, 31)),
        "xmas":     (date(2031, 12, 22), date(2032,  1,  2)),
        "winterA":  (date(2031,  2, 16), date(2031,  2, 20)),
        "winterB":  (date(2031,  2, 23), date(2031,  2, 27)),
        "spring":   (date(2031,  4, 28), date(2031,  5,  2)),
        "summer":   (date(2031,  6, 27), date(2031,  8, 31)),
    },
    2032: {
        "autumn":   (date(2032, 10, 25), date(2032, 10, 29)),
        "xmas":     (date(2032, 12, 20), date(2033,  1,  2)),
        "winterA":  (date(2032,  2, 16), date(2032,  2, 20)),
        "winterB":  (date(2032,  2, 23), date(2032,  2, 27)),
        "spring":   (date(2032,  4, 26), date(2032,  4, 30)),
        "summer":   (date(2032,  6, 25), date(2032,  8, 31)),
    },
    2033: {
        "autumn":   (date(2033, 10, 31), date(2033, 11,  4)),
        "xmas":     (date(2033, 12, 26), date(2034,  1,  6)),
        "winterA":  (date(2033,  2, 14), date(2033,  2, 18)),
        "winterB":  (date(2033,  2, 21), date(2033,  2, 25)),
        "spring":   (date(2033,  4, 25), date(2033,  4, 29)),
        "summer":   (date(2033,  6, 24), date(2033,  8, 31)),
    },
    2034: {
        "autumn":   (date(2034, 10, 30), date(2034, 11,  3)),
        "xmas":     (date(2034, 12, 23), date(2035,  1,  4)),
        "winterA":  (date(2034,  2, 20), date(2034,  2, 24)),
        "winterB":  (date(2034,  2, 27), date(2034,  3,  3)),
        "spring":   (date(2034,  4, 28), date(2034,  5,  2)),
        "summer":   (date(2034,  6, 28), date(2034,  8, 31)),
    },
    2035: {
        "autumn":   (date(2035, 10, 28), date(2035, 11,  1)),
        "xmas":     (date(2035, 12, 22), date(2036,  1,  2)),
        "winterA":  (date(2035,  2, 18), date(2035,  2, 22)),
        "winterB":  (date(2035,  2, 25), date(2035,  3,  1)),
        "spring":   (date(2035,  4, 28), date(2035,  5,  2)),
        "summer":   (date(2035,  6, 27), date(2035,  8, 31)),
    },
}


# ─── Generate workers files ───────────────────────────────────────────────────
for year in range(2025, 2036):
    holidays_raw = national_holidays(year)
    entries = []
    for region in REGIONS:
        entries.append({
            "canton": region,
            "year": year,
            "holidays": [
                {"name": n, "start": fmt(s), "end": fmt(e), "type": t}
                for n, s, e, t in holidays_raw
            ],
        })
    path = os.path.join(OUTPUT_BASE, f"workers_{year}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    print(f"  {path}")


# ─── Generate school files ────────────────────────────────────────────────────
for year in range(2025, 2036):
    sc = SCHOOL[year]
    entries = []
    for region in REGIONS:
        wk = "winterA" if region in GROUP_A else "winterB"
        holidays = [
            {"name": "Zimske počitnice",      "start": fmt(sc[wk][0]),       "end": fmt(sc[wk][1]),       "type": "school"},
            {"name": "Prvomajske počitnice",   "start": fmt(sc["spring"][0]), "end": fmt(sc["spring"][1]), "type": "school"},
            {"name": "Poletne počitnice",      "start": fmt(sc["summer"][0]), "end": fmt(sc["summer"][1]), "type": "school"},
            {"name": "Jesenske počitnice",     "start": fmt(sc["autumn"][0]), "end": fmt(sc["autumn"][1]), "type": "school"},
            {"name": "Novoletne počitnice",    "start": fmt(sc["xmas"][0]),   "end": fmt(sc["xmas"][1]),   "type": "school"},
        ]
        entries.append({"canton": region, "year": year, "holidays": holidays})
    path = os.path.join(OUTPUT_BASE, f"school_{year}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    print(f"  {path}")


# ─── Generate students.json ───────────────────────────────────────────────────
# 4 main Slovenian universities
UNIVERSITIES = [
    ("si-os-ljubljana", "Univerza v Ljubljani",      "OS"),
    ("si-pd-maribor",   "Univerza v Mariboru",       "PD"),
    ("si-ok-koper",     "Univerza na Primorskem",    "OK"),
    ("si-jv-novo-mesto","Univerza v Novem mestu",    "JV"),
]

students_data = []
for year in range(2025, 2036):
    for gid, name, canton in UNIVERSITIES:
        students_data.append({
            "category": "student",
            "gemeinde_id": gid,
            "year": year,
            "holidays": [
                # Winter/Christmas university break (roughly Dec 20 – Jan 10)
                {
                    "name": "Zimske počitnice",
                    "start": f"{year}-12-20",
                    "end":   f"{year+1}-01-10",
                    "type":  "holiday",
                },
                # Summer university break (Jul 1 – Aug 31)
                {
                    "name": "Poletne počitnice",
                    "start": f"{year}-07-01",
                    "end":   f"{year}-08-31",
                    "type":  "holiday",
                },
            ],
        })

path = os.path.join(OUTPUT_BASE, "students.json")
with open(path, "w", encoding="utf-8") as f:
    json.dump(students_data, f, ensure_ascii=False, indent=2)
print(f"  {path}")


# ─── Generate gemeinden entries (printed as JSON for manual append) ──────────
GEMEINDEN = [
    # OS – Osrednjeslovenska (Central Slovenia)
    ("si-os-ljubljana",       "Ljubljana",              "OS", ["1000", "1001", "1002"]),
    ("si-os-domzale",         "Domžale",                "OS", ["1230"]),
    ("si-os-kamnik",          "Kamnik",                 "OS", ["1241"]),
    ("si-os-grosuplje",       "Grosuplje",              "OS", ["1290"]),
    ("si-os-vrhnika",         "Vrhnika",                "OS", ["1360"]),
    ("si-os-logatec",         "Logatec",                "OS", ["1370"]),
    ("si-os-litija",          "Litija",                 "OS", ["1270"]),
    ("si-os-menges",          "Mengeš",                 "OS", ["1234"]),
    ("si-os-medvode",         "Medvode",                "OS", ["1215"]),
    ("si-os-trebnje",         "Trebnje",                "OS", ["8210"]),
    # GO – Gorenjska
    ("si-go-kranj",           "Kranj",                  "GO", ["4000"]),
    ("si-go-jesenice",        "Jesenice",               "GO", ["4270"]),
    ("si-go-trzic",           "Tržič",                  "GO", ["4290"]),
    ("si-go-radovljica",      "Radovljica",             "GO", ["4240"]),
    ("si-go-bled",            "Bled",                   "GO", ["4260"]),
    ("si-go-skofja-loka",     "Škofja Loka",            "GO", ["4220"]),
    ("si-go-kranjska-gora",   "Kranjska Gora",          "GO", ["4280"]),
    ("si-go-bohinj",          "Bohinj",                 "GO", ["4264"]),
    # PD – Podravska
    ("si-pd-maribor",         "Maribor",                "PD", ["2000", "2001"]),
    ("si-pd-ptuj",            "Ptuj",                   "PD", ["2250"]),
    ("si-pd-slov-bistrica",   "Slovenska Bistrica",     "PD", ["2310"]),
    ("si-pd-lenart",          "Lenart v Slov. Goricah", "PD", ["2230"]),
    ("si-pd-ruse",            "Ruše",                   "PD", ["2342"]),
    ("si-pd-kidricevo",       "Kidričevo",              "PD", ["2325"]),
    ("si-pd-ormoz",           "Ormož",                  "PD", ["2270"]),
    # SA – Savinjska
    ("si-sa-celje",           "Celje",                  "SA", ["3000"]),
    ("si-sa-velenje",         "Velenje",                "SA", ["3320"]),
    ("si-sa-zalec",           "Žalec",                  "SA", ["3310"]),
    ("si-sa-lasko",           "Laško",                  "SA", ["3270"]),
    ("si-sa-mozirje",         "Mozirje",                "SA", ["3330"]),
    ("si-sa-smarje",          "Šmarje pri Jelšah",      "SA", ["3240"]),
    ("si-sa-sempeter",        "Šempeter pri Gorici",    "SA", ["5290"]),
    # KO – Koroška
    ("si-ko-slovenj-gradec",  "Slovenj Gradec",         "KO", ["2380"]),
    ("si-ko-ravne",           "Ravne na Koroškem",      "KO", ["2390"]),
    ("si-ko-dravograd",       "Dravograd",              "KO", ["2370"]),
    ("si-ko-muta",            "Muta",                   "KO", ["2366"]),
    # PO – Pomurska
    ("si-po-murska-sobota",   "Murska Sobota",          "PO", ["9000"]),
    ("si-po-lendava",         "Lendava",                "PO", ["9220"]),
    ("si-po-ljutomer",        "Ljutomer",               "PO", ["9240"]),
    ("si-po-gornja-radgona",  "Gornja Radgona",         "PO", ["9250"]),
    ("si-po-ormoz-po",        "Odranci",                "PO", ["9233"]),
    # ZA – Zasavska
    ("si-za-trbovlje",        "Trbovlje",               "ZA", ["1420"]),
    ("si-za-zagorje",         "Zagorje ob Savi",        "ZA", ["1410"]),
    ("si-za-hrastnik",        "Hrastnik",               "ZA", ["1430"]),
    # PS – Posavska
    ("si-ps-krsko",           "Krško",                  "PS", ["8270"]),
    ("si-ps-brezice",         "Brežice",                "PS", ["8250"]),
    ("si-ps-sevnica",         "Sevnica",                "PS", ["8290"]),
    ("si-ps-kostanjevica",    "Kostanjevica na Krki",   "PS", ["8311"]),
    # JV – Jugovzhodna Slovenija
    ("si-jv-novo-mesto",      "Novo Mesto",             "JV", ["8000"]),
    ("si-jv-kocevje",         "Kočevje",                "JV", ["1330"]),
    ("si-jv-crnomelj",        "Črnomelj",               "JV", ["8340"]),
    ("si-jv-metlika",         "Metlika",                "JV", ["8330"]),
    ("si-jv-ribnica",         "Ribnica",                "JV", ["1310"]),
    # GR – Goriška
    ("si-gr-nova-gorica",     "Nova Gorica",            "GR", ["5000"]),
    ("si-gr-ajdovscina",      "Ajdovščina",             "GR", ["5270"]),
    ("si-gr-idrija",          "Idrija",                 "GR", ["5280"]),
    ("si-gr-tolmin",          "Tolmin",                 "GR", ["5220"]),
    ("si-gr-vipava",          "Vipava",                 "GR", ["5271"]),
    # OK – Obalno-kraška
    ("si-ok-koper",           "Koper",                  "OK", ["6000"]),
    ("si-ok-piran",           "Piran",                  "OK", ["6330"]),
    ("si-ok-izola",           "Izola",                  "OK", ["6310"]),
    ("si-ok-sezana",          "Sežana",                 "OK", ["6210"]),
    ("si-ok-hrpelje",         "Hrpelje - Kozina",       "OK", ["6240"]),
    # PN – Primorsko-notranjska
    ("si-pn-postojna",        "Postojna",               "PN", ["6230"]),
    ("si-pn-ilirska-bistrica","Ilirska Bistrica",       "PN", ["6250"]),
    ("si-pn-pivka",           "Pivka",                  "PN", ["6257"]),
    ("si-pn-cerknica",        "Cerknica",               "PN", ["1380"]),
    ("si-pn-loska-dolina",    "Loška Dolina",           "PN", ["1386"]),
]

entries = [
    {
        "id": gid,
        "name": name,
        "canton": canton,
        "country": "SI",
        "language": "sl",
        "plz": plz,
    }
    for gid, name, canton, plz in GEMEINDEN
]

gem_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../src/db/seed/gemeinden_si.json")
with open(gem_path, "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=2)
print(f"\nGemeinden → {gem_path}  ({len(entries)} entries)")
print("\nDone. Append gemeinden_si.json into gemeinden.json manually.")
