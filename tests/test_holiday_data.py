"""
Unit tests for HCP holiday seed data and parser tools.

Run: python3 -m pytest tests/test_holiday_data.py -v
"""

import json
import re
from collections import defaultdict
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
HOLIDAYS_DIR = PROJECT_ROOT / "src" / "db" / "seed" / "holidays"
GEMEINDEN_PATH = PROJECT_ROOT / "src" / "db" / "seed" / "gemeinden.json"
SCHEMA_PATH = HOLIDAYS_DIR / "_schema.json"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
VALID_TYPES = {"public_holiday", "vacation", "bridge_day"}
VALID_CATEGORIES = {"worker", "school", "student"}

CH_CANTONS = {
    "ZH", "BE", "LU", "UR", "SZ", "OW", "NW", "GL", "ZG", "FR",
    "SO", "BS", "BL", "SH", "AR", "AI", "SG", "GR", "AG", "TG",
    "TI", "VD", "VS", "NE", "GE", "JU",
}
DE_BUNDESLAENDER = {
    "BB", "BE", "BW", "BY", "HB", "HE", "HH", "MV",
    "NI", "NW", "RP", "SH", "SL", "SN", "ST", "TH",
}


# === Fixtures ===

@pytest.fixture(scope="session")
def gemeinden():
    with open(GEMEINDEN_PATH, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="session")
def gemeinden_ids(gemeinden):
    return {g["id"] for g in gemeinden}


def discover_holiday_files():
    """Find all holiday JSON files across all countries."""
    files = []
    for country_dir in sorted(HOLIDAYS_DIR.iterdir()):
        if not country_dir.is_dir() or country_dir.name.startswith("."):
            continue
        for f in sorted(country_dir.iterdir()):
            if f.suffix == ".json":
                files.append(f)
    return files


def load_holiday_file(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# === Gemeinden tests ===

class TestGemeinden:
    def test_file_exists(self):
        assert GEMEINDEN_PATH.exists()

    def test_valid_json(self):
        data = load_holiday_file(GEMEINDEN_PATH)
        assert isinstance(data, list)
        assert len(data) > 0

    def test_no_duplicate_ids(self, gemeinden):
        ids = [g["id"] for g in gemeinden]
        duplicates = [id for id in ids if ids.count(id) > 1]
        assert len(set(duplicates)) == 0, f"Duplicate IDs: {set(duplicates)}"

    def test_required_fields(self, gemeinden):
        for g in gemeinden:
            assert "id" in g, f"Missing id in {g}"
            assert "name" in g, f"Missing name in {g.get('id', '?')}"
            assert "country" in g, f"Missing country in {g['id']}"
            assert "plz" in g, f"Missing plz in {g['id']}"
            assert isinstance(g["plz"], list), f"plz not a list in {g['id']}"

    def test_ch_coverage(self, gemeinden):
        ch = [g for g in gemeinden if g["country"] == "CH"]
        assert len(ch) > 2000, f"Expected 2000+ CH gemeinden, got {len(ch)}"
        ch_cantons = {g["canton"] for g in ch if g.get("canton")}
        # At least 20 cantons represented
        assert len(ch_cantons) >= 20, f"Only {len(ch_cantons)} CH cantons: {ch_cantons}"

    def test_de_coverage(self, gemeinden):
        de = [g for g in gemeinden if g["country"] == "DE"]
        assert len(de) > 10000, f"Expected 10000+ DE gemeinden, got {len(de)}"
        de_bl = {g["canton"] for g in de if g.get("canton")}
        assert de_bl == DE_BUNDESLAENDER, f"Missing DE Bundesländer: {DE_BUNDESLAENDER - de_bl}"

    def test_galaxy_demo(self, gemeinden):
        galaxy = [g for g in gemeinden if g["country"] == "GALAXY"]
        assert len(galaxy) > 0, "No GALAXY demo gemeinden found"


# === Holiday file structure tests ===

HOLIDAY_FILES = discover_holiday_files()


@pytest.mark.parametrize("path", HOLIDAY_FILES, ids=lambda p: str(p.relative_to(HOLIDAYS_DIR)))
class TestHolidayFile:
    def test_valid_json(self, path):
        data = load_holiday_file(path)
        assert isinstance(data, list)

    def test_entries_have_holidays(self, path):
        data = load_holiday_file(path)
        for entry in data:
            assert "holidays" in entry, f"Missing 'holidays' in entry: {entry.keys()}"
            assert isinstance(entry["holidays"], list)

    def test_holiday_required_fields(self, path):
        data = load_holiday_file(path)
        for entry in data:
            for h in entry["holidays"]:
                assert "name" in h, f"Missing name in holiday: {h}"
                assert "start" in h, f"Missing start in holiday: {h}"
                assert "end" in h, f"Missing end in holiday: {h}"
                assert "type" in h, f"Missing type in holiday: {h}"

    def test_date_format(self, path):
        data = load_holiday_file(path)
        for entry in data:
            for h in entry["holidays"]:
                assert DATE_RE.match(h["start"]), f"Bad start date: {h['start']}"
                assert DATE_RE.match(h["end"]), f"Bad end date: {h['end']}"

    def test_end_not_before_start(self, path):
        data = load_holiday_file(path)
        for entry in data:
            for h in entry["holidays"]:
                assert h["end"] >= h["start"], f"End before start: {h['start']} > {h['end']} in {h['name']}"

    def test_valid_type(self, path):
        data = load_holiday_file(path)
        for entry in data:
            for h in entry["holidays"]:
                assert h["type"] in VALID_TYPES, f"Invalid type '{h['type']}' in {h['name']}"

    def test_name_has_de(self, path):
        data = load_holiday_file(path)
        for entry in data:
            for h in entry["holidays"]:
                name = h["name"]
                assert isinstance(name, dict), f"Name not a dict: {name}"
                assert "de" in name, f"Missing 'de' in name: {name}"


# === Workers tests ===

class TestWorkers:
    def _load_workers(self, country, year):
        path = HOLIDAYS_DIR / country / f"workers_{year}.json"
        if not path.exists():
            pytest.skip(f"No workers_{year}.json for {country}")
        return load_holiday_file(path)

    def test_ch_workers_2026_has_26_cantons(self):
        data = self._load_workers("ch", 2026)
        cantons = {e["canton"] for e in data}
        assert len(cantons) == 26, f"Expected 26 cantons, got {len(cantons)}: {cantons}"

    def test_de_workers_2026_has_16_bundeslaender(self):
        data = self._load_workers("de", 2026)
        bls = {e["canton"] for e in data}
        assert bls == DE_BUNDESLAENDER, f"Missing: {DE_BUNDESLAENDER - bls}"

    def test_de_workers_have_neujahr(self):
        data = self._load_workers("de", 2026)
        for entry in data:
            names = [h["name"]["de"] for h in entry["holidays"]]
            assert "Neujahr" in names, f"{entry['canton']} missing Neujahr"

    def test_de_workers_have_einheit(self):
        data = self._load_workers("de", 2026)
        for entry in data:
            names = [h["name"]["de"] for h in entry["holidays"]]
            assert "Tag der Deutschen Einheit" in names, f"{entry['canton']} missing Tag der Deutschen Einheit"


# === School tests ===

class TestSchool:
    def _load_school(self, country, year):
        path = HOLIDAYS_DIR / country / f"school_{year}.json"
        if not path.exists():
            pytest.skip(f"No school_{year}.json for {country}")
        return load_holiday_file(path)

    def test_de_school_2026_has_16_bundeslaender(self):
        data = self._load_school("de", 2026)
        bls = {e["canton"] for e in data}
        assert bls == DE_BUNDESLAENDER, f"Missing: {DE_BUNDESLAENDER - bls}"

    def test_de_school_has_sommerferien(self):
        data = self._load_school("de", 2026)
        for entry in data:
            names = [h["name"]["de"] for h in entry["holidays"]]
            assert "Sommerferien" in names, f"{entry['canton']} missing Sommerferien"

    def test_school_entries_have_category(self):
        data = self._load_school("de", 2026)
        for entry in data:
            assert entry.get("category") == "school", f"Wrong category in {entry.get('canton')}"


# === Students tests ===

class TestStudents:
    def _load_students(self, country):
        path = HOLIDAYS_DIR / country / "students.json"
        if not path.exists():
            pytest.skip(f"No students.json for {country}")
        return load_holiday_file(path)

    def test_de_students_has_10_universities(self):
        data = self._load_students("de")
        assert len(data) >= 10, f"Expected 10+ entries, got {len(data)}"

    def test_de_student_gemeinde_ids_exist(self, gemeinden_ids):
        data = self._load_students("de")
        for entry in data:
            gid = entry["gemeinde_id"]
            assert gid in gemeinden_ids, f"gemeinde_id '{gid}' not found in gemeinden.json"

    def test_ch_student_gemeinde_ids_exist(self, gemeinden_ids):
        data = self._load_students("ch")
        for entry in data:
            gid = entry["gemeinde_id"]
            assert gid in gemeinden_ids, f"gemeinde_id '{gid}' not found in gemeinden.json"

    def test_students_have_category(self):
        data = self._load_students("de")
        for entry in data:
            assert entry["category"] == "student"

    def test_students_have_year(self):
        data = self._load_students("de")
        for entry in data:
            assert "year" in entry
            assert isinstance(entry["year"], int)


# === Parser tools tests ===

class TestParserTools:
    def test_fetch_de_gemeinden_importable(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "fetch_de_gemeinden", PROJECT_ROOT / "tools" / "fetch_de_gemeinden.py"
        )
        assert spec is not None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        assert hasattr(mod, "parse_geonames")
        assert hasattr(mod, "build_gemeinden_entries")

    def test_fetch_de_schulferien_importable(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "fetch_de_schulferien", PROJECT_ROOT / "tools" / "fetch_de_schulferien.py"
        )
        assert spec is not None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        assert hasattr(mod, "convert_to_hcp_format")
        assert hasattr(mod, "translate_name")

    def test_fetch_de_feiertage_importable(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "fetch_de_feiertage", PROJECT_ROOT / "tools" / "fetch_de_feiertage.py"
        )
        assert spec is not None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        assert hasattr(mod, "convert_to_hcp_format")
        assert hasattr(mod, "translate_name")

    def test_schulferien_translate(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "fetch_de_schulferien", PROJECT_ROOT / "tools" / "fetch_de_schulferien.py"
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        assert mod.translate_name("Sommerferien") == "Summer holidays"
        assert mod.translate_name("Weihnachtsferien") == "Christmas holidays"

    def test_feiertage_translate(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "fetch_de_feiertage", PROJECT_ROOT / "tools" / "fetch_de_feiertage.py"
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        assert mod.translate_name("Neujahr") == "New Year's Day"
        assert mod.translate_name("Karfreitag") == "Good Friday"


# === Cross-reference tests ===

class TestCrossReferences:
    def test_all_countries_have_holiday_dirs(self, gemeinden):
        countries = {g["country"].lower() for g in gemeinden if g.get("country")}
        for c in countries:
            if c in ("ch", "de", "galaxy"):
                assert (HOLIDAYS_DIR / c).exists(), f"No holiday dir for {c}"

    def test_schema_file_exists(self):
        assert SCHEMA_PATH.exists()
        data = load_holiday_file(SCHEMA_PATH)
        assert "$schema" in data
