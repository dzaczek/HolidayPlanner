#!/usr/bin/env python3
"""
HCP Holiday Editor — interactive local web tool for editing holiday JSON seed data.

Launches a local web server with a calendar UI to view, add, edit, and delete
holidays per country/region/year/category. Reads and writes the JSON files
in src/db/seed/holidays/{country}/.

Usage:
    python3 tools/holiday-editor.py
    python3 tools/holiday-editor.py --port 9000
    python3 tools/holiday-editor.py --no-browser

Requires: Python 3.8+ (no external dependencies)
"""

import argparse
import http.server
import json
import os
import socketserver
import sys
import threading
import urllib.parse
import webbrowser
from pathlib import Path

# === Paths ===

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
HOLIDAYS_DIR = PROJECT_ROOT / "src" / "db" / "seed" / "holidays"
GEMEINDEN_PATH = PROJECT_ROOT / "src" / "db" / "seed" / "gemeinden.json"

# === Data helpers ===


def discover_countries():
    """Find all country directories under holidays/."""
    countries = []
    if not HOLIDAYS_DIR.exists():
        return countries
    for d in sorted(HOLIDAYS_DIR.iterdir()):
        if d.is_dir() and d.name != "__pycache__" and not d.name.startswith(".") and d.name != "_schema.json":
            countries.append(d.name)
    return countries


def discover_files(country):
    """Find all holiday JSON files for a country, grouped by type."""
    cdir = HOLIDAYS_DIR / country
    result = {"workers": [], "school": [], "students": []}
    if not cdir.exists():
        return result
    for f in sorted(cdir.iterdir()):
        if not f.suffix == ".json":
            continue
        if f.name.startswith("workers_"):
            result["workers"].append(f.name)
        elif f.name.startswith("school_"):
            result["school"].append(f.name)
        elif f.name == "students.json":
            result["students"].append(f.name)
    return result


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_gemeinden():
    if GEMEINDEN_PATH.exists():
        return load_json(GEMEINDEN_PATH)
    return []


# === HTTP Handler ===

HTML_PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HCP Holiday Editor</title>
<style>
:root {
  --bg: #0d1117; --surface: #161b22; --border: #30363d;
  --text: #e6edf3; --text2: #8b949e; --accent: #58a6ff;
  --green: #3fb950; --red: #f85149; --orange: #d29922; --purple: #bc8cff;
  --holiday-pub: #f0883e; --holiday-vac: #3fb950; --holiday-bridge: #d29922;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
.container { max-width: 1400px; margin: 0 auto; padding: 16px; }
header { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
header h1 { font-size: 20px; font-weight: 600; }
header .badge { background: var(--accent); color: #000; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }

/* Controls */
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
.controls label { font-size: 13px; color: var(--text2); }
.controls select, .controls input[type="number"] {
  background: var(--bg); color: var(--text); border: 1px solid var(--border);
  padding: 6px 10px; border-radius: 6px; font-size: 14px;
}
.controls select:focus, .controls input:focus { border-color: var(--accent); outline: none; }
.btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 13px; font-weight: 500; }
.btn:hover { background: var(--border); }
.btn-primary { background: #238636; border-color: #2ea043; }
.btn-primary:hover { background: #2ea043; }
.btn-danger { background: #da3633; border-color: #f85149; }
.btn-danger:hover { background: #f85149; }
.btn-sm { padding: 3px 8px; font-size: 12px; }

/* Stats bar */
.stats { display: flex; gap: 16px; margin-bottom: 12px; font-size: 13px; color: var(--text2); }
.stats .stat { display: flex; align-items: center; gap: 4px; }
.stats .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot-pub { background: var(--holiday-pub); }
.dot-vac { background: var(--holiday-vac); }
.dot-bridge { background: var(--holiday-bridge); }

/* Calendar grid */
.calendar-year { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 1100px) { .calendar-year { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 800px) { .calendar-year { grid-template-columns: repeat(2, 1fr); } }
.month-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
.month-card h3 { font-size: 13px; font-weight: 600; text-align: center; padding: 4px 0; color: var(--accent); }
.month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
.month-grid .dow { font-size: 10px; text-align: center; color: var(--text2); padding: 2px 0; font-weight: 600; }
.day-cell {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  font-size: 12px; border-radius: 4px; cursor: pointer; position: relative;
  transition: background 0.15s;
}
.day-cell:hover { outline: 2px solid var(--accent); outline-offset: -2px; }
.day-cell.empty { cursor: default; }
.day-cell.empty:hover { outline: none; }
.day-cell.weekend { color: var(--text2); }
.day-cell.public_holiday { background: var(--holiday-pub); color: #000; font-weight: 600; }
.day-cell.vacation { background: var(--holiday-vac); color: #000; font-weight: 600; }
.day-cell.bridge_day { background: var(--holiday-bridge); color: #000; font-weight: 600; }
.day-cell.today { box-shadow: inset 0 0 0 2px var(--accent); }
.day-cell .multi-dot { position: absolute; bottom: 1px; right: 1px; width: 5px; height: 5px; border-radius: 50%; background: var(--purple); }

/* Holiday list */
.holiday-list { margin-top: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
.holiday-list h3 { padding: 12px 16px; border-bottom: 1px solid var(--border); font-size: 14px; }
.holiday-list table { width: 100%; border-collapse: collapse; font-size: 13px; }
.holiday-list th { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); color: var(--text2); font-weight: 500; font-size: 12px; }
.holiday-list td { padding: 6px 12px; border-bottom: 1px solid var(--border); }
.holiday-list tr:last-child td { border-bottom: none; }
.holiday-list tr:hover td { background: rgba(88,166,255,0.05); }
.type-badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.type-badge.public_holiday { background: var(--holiday-pub); color: #000; }
.type-badge.vacation { background: var(--holiday-vac); color: #000; }
.type-badge.bridge_day { background: var(--holiday-bridge); color: #000; }

/* Modal */
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; align-items: center; justify-content: center; }
.modal-overlay.active { display: flex; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 440px; max-width: 95vw; }
.modal h3 { margin-bottom: 16px; font-size: 16px; }
.modal .form-group { margin-bottom: 12px; }
.modal label { display: block; font-size: 13px; color: var(--text2); margin-bottom: 4px; }
.modal input, .modal select {
  width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border);
  padding: 8px 10px; border-radius: 6px; font-size: 14px;
}
.modal input:focus, .modal select:focus { border-color: var(--accent); outline: none; }
.modal .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

/* Toast */
.toast { position: fixed; bottom: 20px; right: 20px; background: var(--green); color: #000; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; z-index: 200; display: none; }
.toast.error { background: var(--red); color: #fff; }
.toast.show { display: block; animation: fadeInOut 2.5s ease; }
@keyframes fadeInOut { 0%{opacity:0;transform:translateY(10px)} 15%{opacity:1;transform:translateY(0)} 80%{opacity:1} 100%{opacity:0} }

/* Region/gemeinde filter tabs */
.view-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
.view-tab { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text2); cursor: pointer; font-size: 13px; }
.view-tab.active { background: var(--accent); color: #000; border-color: var(--accent); font-weight: 600; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>HCP Holiday Editor</h1>
    <span class="badge">admin tool</span>
  </header>

  <div class="controls">
    <div>
      <label>Country</label><br>
      <select id="sel-country"></select>
    </div>
    <div>
      <label>Category</label><br>
      <select id="sel-category">
        <option value="worker">Workers (public holidays)</option>
        <option value="school">School holidays</option>
        <option value="student">Student holidays</option>
      </select>
    </div>
    <div>
      <label>Year</label><br>
      <input type="number" id="sel-year" value="2026" min="2020" max="2040" style="width:90px">
    </div>
    <div>
      <label>Region</label><br>
      <select id="sel-region"><option value="__all__">All regions</option></select>
    </div>
    <div>
      <label>Gemeinde</label><br>
      <select id="sel-gemeinde"><option value="">All (region level)</option></select>
    </div>
    <div style="margin-left:auto; display:flex; gap:6px; align-items:flex-end;">
      <button class="btn btn-primary" onclick="addHoliday()">+ Add holiday</button>
      <button class="btn" onclick="loadData()">Reload</button>
    </div>
  </div>

  <div class="stats" id="stats"></div>
  <div class="calendar-year" id="calendar"></div>

  <div class="holiday-list" id="holiday-list">
    <h3>Holidays <span id="list-count"></span></h3>
    <table><thead><tr>
      <th>Name (de)</th><th>Name (en)</th><th>Start</th><th>End</th><th>Type</th><th>Region</th><th></th>
    </tr></thead><tbody id="holiday-tbody"></tbody></table>
  </div>
</div>

<!-- Add/Edit modal -->
<div class="modal-overlay" id="modal">
  <div class="modal">
    <h3 id="modal-title">Add Holiday</h3>
    <div class="form-group" id="m-scope-group">
      <label>Scope</label>
      <select id="m-scope" onchange="onScopeChange()">
        <option value="country">Entire country (all regions)</option>
        <option value="region">Single region (canton/Bundesland)</option>
        <option value="gemeinde">Specific Gemeinde only</option>
      </select>
    </div>
    <div class="form-group" id="m-region-group" style="display:none">
      <label>Region</label>
      <select id="m-region"></select>
    </div>
    <div class="form-group" id="m-gemeinde-group" style="display:none">
      <label>Gemeinde</label>
      <select id="m-gemeinde"></select>
    </div>
    <div class="form-group"><label>Name (de)</label><input id="m-name-de"></div>
    <div class="form-group"><label>Name (en)</label><input id="m-name-en"></div>
    <div class="form-group"><label>Name (fr)</label><input id="m-name-fr"></div>
    <div class="form-group"><label>Name (it)</label><input id="m-name-it"></div>
    <div class="form-group"><label>Start date</label><input type="date" id="m-start"></div>
    <div class="form-group"><label>End date</label><input type="date" id="m-end"></div>
    <div class="form-group">
      <label>Type</label>
      <select id="m-type">
        <option value="public_holiday">Public holiday</option>
        <option value="vacation">Vacation</option>
        <option value="bridge_day">Bridge day</option>
      </select>
    </div>
    <input type="hidden" id="m-edit-idx" value="-1">
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveModal()">Save</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Mo','Tu','We','Th','Fr','Sa','Su'];

let state = { country:'', category:'worker', year:2026, region:'__all__', gemeinde:'', data:[], holidays:[], gemeinden:[], fileInfo:{} };

// === API calls ===
async function api(path, opts={}) {
  const r = await fetch('/api' + path, opts);
  return r.json();
}

// === Init ===
async function init() {
  const meta = await api('/meta');
  const sel = document.getElementById('sel-country');
  sel.innerHTML = meta.countries.map(c => `<option value="${c}">${c.toUpperCase()}</option>`).join('');
  state.country = meta.countries[0] || 'ch';
  state.gemeinden = meta.gemeinden;
  await loadData();

  document.getElementById('sel-country').addEventListener('change', e => { state.country = e.target.value; loadData(); });
  document.getElementById('sel-category').addEventListener('change', e => { state.category = e.target.value; loadData(); });
  document.getElementById('sel-year').addEventListener('change', e => { state.year = parseInt(e.target.value); loadData(); });
  document.getElementById('sel-region').addEventListener('change', e => { state.region = e.target.value; updateGemeindeSelect(); render(); });
  document.getElementById('sel-gemeinde').addEventListener('change', e => { state.gemeinde = e.target.value; render(); });
}

async function loadData() {
  const d = await api(`/holidays?country=${state.country}&category=${state.category}&year=${state.year}`);
  state.data = d.entries || [];
  state.fileInfo = d.fileInfo || {};
  updateRegionSelect();
  render();
}

function updateRegionSelect() {
  const regions = new Set();
  for (const e of state.data) {
    if (e.canton) regions.add(e.canton);
  }
  const sel = document.getElementById('sel-region');
  const prevRegion = state.region;
  sel.innerHTML = '<option value="__all__">All regions</option>' +
    [...regions].sort().map(r => `<option value="${r}">${r}</option>`).join('');
  // Restore previous selection if still valid
  if (prevRegion !== '__all__' && regions.has(prevRegion)) {
    sel.value = prevRegion;
    state.region = prevRegion;
  } else {
    state.region = '__all__';
  }

  updateGemeindeSelect();
}

function updateGemeindeSelect() {
  const gSel = document.getElementById('sel-gemeinde');
  const country = state.country.toUpperCase();

  if (state.category === 'student') {
    // For students: show gemeinden that have data
    const gIds = [...new Set(state.data.map(e => e.gemeinde_id).filter(Boolean))];
    const gList = state.gemeinden.filter(g => gIds.includes(g.id));
    gSel.innerHTML = '<option value="">All</option>' + gList.map(g =>
      `<option value="${g.id}">${g.name} (${g.canton||''}, ${g.country||''})</option>`
    ).join('');
  } else {
    // For workers/school: show gemeinden filtered by selected region & country
    let filtered = state.gemeinden.filter(g => (g.country||'').toUpperCase() === country);
    if (state.region !== '__all__') {
      filtered = filtered.filter(g => g.canton === state.region);
    }
    gSel.innerHTML = '<option value="">All (region level)</option>' +
      filtered.slice(0, 200).map(g =>
        `<option value="${g.id}">${g.name}${g.canton ? ' (' + g.canton + ')' : ''} — ${(g.plz||[])[0]||''}</option>`
      ).join('');
    if (filtered.length > 200) {
      gSel.innerHTML += `<option disabled>... ${filtered.length - 200} more (select a region first)</option>`;
    }
  }
  state.gemeinde = '';
}

// === Rendering ===
function getFilteredEntries() {
  let entries = state.data;
  if (state.gemeinde && state.category !== 'student') {
    // When a specific gemeinde is selected for worker/school,
    // find its canton and filter by that — holidays are stored at canton level
    const g = state.gemeinden.find(x => x.id === state.gemeinde);
    if (g && g.canton) {
      entries = entries.filter(e => e.canton === g.canton);
    }
  } else if (state.region !== '__all__') {
    entries = entries.filter(e => e.canton === state.region);
  }
  if (state.gemeinde && state.category === 'student') {
    entries = entries.filter(e => e.gemeinde_id === state.gemeinde);
  }
  return entries;
}

function getAllHolidays() {
  const entries = getFilteredEntries();
  const all = [];
  for (const e of entries) {
    for (const h of (e.holidays || [])) {
      all.push({ ...h, canton: e.canton || '', gemeinde_id: e.gemeinde_id || '', _entry: e });
    }
  }
  all.sort((a, b) => a.start.localeCompare(b.start));
  return all;
}

function render() {
  state.holidays = getAllHolidays();
  renderStats();
  renderCalendar();
  renderList();
}

function renderStats() {
  const h = state.holidays;
  const pub = h.filter(x => x.type === 'public_holiday').length;
  const vac = h.filter(x => x.type === 'vacation').length;
  const bridge = h.filter(x => x.type === 'bridge_day').length;
  let ctx = `${state.country.toUpperCase()}`;
  if (state.region !== '__all__') ctx += ` / ${state.region}`;
  if (state.gemeinde) {
    const g = state.gemeinden.find(x => x.id === state.gemeinde);
    if (g) ctx += ` / ${g.name}`;
  }
  document.getElementById('stats').innerHTML =
    `<span class="stat"><strong>${ctx}</strong></span>` +
    `<span class="stat"><span class="dot dot-pub"></span> ${pub} public holidays</span>` +
    `<span class="stat"><span class="dot dot-vac"></span> ${vac} vacation periods</span>` +
    `<span class="stat"><span class="dot dot-bridge"></span> ${bridge} bridge days</span>` +
    `<span class="stat" style="margin-left:auto">Total: ${h.length} entries</span>`;
}

function renderCalendar() {
  const year = state.year;
  const cal = document.getElementById('calendar');
  const today = new Date().toISOString().slice(0,10);

  // Build date->holiday map
  const dateMap = {};
  for (const h of state.holidays) {
    let d = new Date(h.start + 'T00:00:00');
    const end = new Date(h.end + 'T00:00:00');
    while (d <= end) {
      const ds = fmtDate(d);
      if (!dateMap[ds]) dateMap[ds] = [];
      dateMap[ds].push(h);
      d.setDate(d.getDate() + 1);
    }
  }

  let html = '';
  for (let m = 0; m < 12; m++) {
    html += `<div class="month-card"><h3>${MONTHS[m]} ${year}</h3><div class="month-grid">`;
    for (const d of DOW) html += `<div class="dow">${d}</div>`;

    const first = new Date(year, m, 1);
    let startDay = first.getDay(); // 0=Sun
    startDay = startDay === 0 ? 6 : startDay - 1; // convert to Mon=0

    for (let i = 0; i < startDay; i++) html += '<div class="day-cell empty"></div>';

    const daysInMonth = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dow = new Date(year, m, d).getDay();
      const isWe = dow === 0 || dow === 6;
      const hols = dateMap[ds] || [];
      let cls = 'day-cell';
      if (isWe) cls += ' weekend';
      if (ds === today) cls += ' today';
      if (hols.length > 0) cls += ' ' + hols[0].type;
      const multiDot = hols.length > 1 ? '<span class="multi-dot"></span>' : '';
      const title = hols.map(h => nameStr(h.name)).join(', ');
      html += `<div class="${cls}" title="${esc(title)}" onclick="clickDay('${ds}')">${d}${multiDot}</div>`;
    }
    html += '</div></div>';
  }
  cal.innerHTML = html;
}

function renderList() {
  const tbody = document.getElementById('holiday-tbody');
  document.getElementById('list-count').textContent = `(${state.holidays.length})`;
  if (state.holidays.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:20px">No holidays found for this selection</td></tr>';
    return;
  }
  tbody.innerHTML = state.holidays.map((h, i) => {
    let region = h.canton || '';
    if (h.gemeinde_id) {
      const g = state.gemeinden.find(x => x.id === h.gemeinde_id);
      region = g ? `${g.name} (${g.canton||''})` : h.gemeinde_id;
    }
    return `<tr>
      <td>${esc(nameStr(h.name, 'de'))}</td>
      <td style="color:var(--text2)">${esc(nameStr(h.name, 'en'))}</td>
      <td>${h.start}</td><td>${h.end}</td>
      <td><span class="type-badge ${h.type}">${h.type.replace('_',' ')}</span></td>
      <td>${esc(region)}</td>
      <td>
        <button class="btn btn-sm" onclick="editHoliday(${i})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteHoliday(${i})">Del</button>
      </td>
    </tr>`;
  }).join('');
}

// === Modal helpers ===
function populateModalRegions() {
  const regions = new Set();
  // From existing data
  for (const e of state.data) { if (e.canton) regions.add(e.canton); }
  // From gemeinden (so we can add to regions with no data yet)
  const country = state.country.toUpperCase();
  for (const g of state.gemeinden) {
    if ((g.country||'').toUpperCase() === country && g.canton) regions.add(g.canton);
  }
  const sel = document.getElementById('m-region');
  sel.innerHTML = [...regions].sort().map(r => `<option value="${r}">${r}</option>`).join('');
  return [...regions].sort();
}

function populateModalGemeinden(region) {
  const country = state.country.toUpperCase();
  let filtered = state.gemeinden.filter(g => (g.country||'').toUpperCase() === country);
  if (region) filtered = filtered.filter(g => g.canton === region);
  const sel = document.getElementById('m-gemeinde');
  sel.innerHTML = filtered.slice(0, 300).map(g =>
    `<option value="${g.id}">${g.name}${g.canton ? ' (' + g.canton + ')' : ''} — ${(g.plz||[])[0]||''}</option>`
  ).join('');
}

function onScopeChange() {
  const scope = document.getElementById('m-scope').value;
  // For student category, always show gemeinde
  if (state.category === 'student') {
    document.getElementById('m-gemeinde-group').style.display = '';
    document.getElementById('m-region-group').style.display = 'none';
    document.getElementById('m-scope-group').style.display = 'none';
    populateModalGemeinden(null);
    return;
  }
  document.getElementById('m-scope-group').style.display = '';
  document.getElementById('m-region-group').style.display = scope === 'region' || scope === 'gemeinde' ? '' : 'none';
  document.getElementById('m-gemeinde-group').style.display = scope === 'gemeinde' ? '' : 'none';
  if (scope === 'gemeinde') {
    const region = document.getElementById('m-region').value;
    populateModalGemeinden(region);
  }
}

// === CRUD ===
function addHoliday() {
  document.getElementById('modal-title').textContent = 'Add Holiday';
  document.getElementById('m-name-de').value = '';
  document.getElementById('m-name-en').value = '';
  document.getElementById('m-name-fr').value = '';
  document.getElementById('m-name-it').value = '';
  document.getElementById('m-start').value = `${state.year}-01-01`;
  document.getElementById('m-end').value = `${state.year}-01-01`;
  document.getElementById('m-type').value = state.category === 'worker' ? 'public_holiday' : 'vacation';
  document.getElementById('m-edit-idx').value = '-1';

  // Populate region/gemeinde
  const regions = populateModalRegions();
  if (state.region !== '__all__') {
    document.getElementById('m-region').value = state.region;
  }

  if (state.category === 'student') {
    document.getElementById('m-scope').value = 'gemeinde';
    populateModalGemeinden(null);
    if (state.gemeinde) document.getElementById('m-gemeinde').value = state.gemeinde;
  } else if (state.gemeinde) {
    document.getElementById('m-scope').value = 'gemeinde';
    populateModalGemeinden(state.region !== '__all__' ? state.region : null);
    document.getElementById('m-gemeinde').value = state.gemeinde;
  } else if (state.region !== '__all__') {
    document.getElementById('m-scope').value = 'region';
  } else {
    document.getElementById('m-scope').value = 'country';
  }
  onScopeChange();
  document.getElementById('m-region').addEventListener('change', function() {
    if (document.getElementById('m-scope').value === 'gemeinde') {
      populateModalGemeinden(this.value);
    }
  });

  document.getElementById('modal').classList.add('active');
}

function editHoliday(idx) {
  const h = state.holidays[idx];
  document.getElementById('modal-title').textContent = 'Edit Holiday';
  document.getElementById('m-name-de').value = nameStr(h.name, 'de');
  document.getElementById('m-name-en').value = nameStr(h.name, 'en');
  document.getElementById('m-name-fr').value = nameStr(h.name, 'fr');
  document.getElementById('m-name-it').value = nameStr(h.name, 'it');
  document.getElementById('m-start').value = h.start;
  document.getElementById('m-end').value = h.end;
  document.getElementById('m-type').value = h.type;
  document.getElementById('m-edit-idx').value = String(idx);

  // Populate region/gemeinde from existing entry
  populateModalRegions();
  if (h.canton) document.getElementById('m-region').value = h.canton;
  if (h.gemeinde_id) {
    document.getElementById('m-scope').value = 'gemeinde';
    populateModalGemeinden(h.canton || null);
    document.getElementById('m-gemeinde').value = h.gemeinde_id;
  } else {
    document.getElementById('m-scope').value = 'region';
  }
  onScopeChange();

  document.getElementById('modal').classList.add('active');
}

async function saveModal() {
  const idx = parseInt(document.getElementById('m-edit-idx').value);
  const holiday = {
    name: {
      de: document.getElementById('m-name-de').value.trim(),
      en: document.getElementById('m-name-en').value.trim(),
      fr: document.getElementById('m-name-fr').value.trim(),
      it: document.getElementById('m-name-it').value.trim(),
    },
    start: document.getElementById('m-start').value,
    end: document.getElementById('m-end').value,
    type: document.getElementById('m-type').value,
  };
  // Remove empty language keys
  for (const k of Object.keys(holiday.name)) {
    if (!holiday.name[k]) delete holiday.name[k];
  }
  if (!holiday.name.de) { toast('Name (de) is required', true); return; }
  if (!holiday.start || !holiday.end) { toast('Dates are required', true); return; }

  const scope = document.getElementById('m-scope').value;
  let targetRegion = document.getElementById('m-region').value || null;
  let targetGemeinde = null;

  if (state.category === 'student' || scope === 'gemeinde') {
    targetGemeinde = document.getElementById('m-gemeinde').value || null;
    if (!targetGemeinde) { toast('Select a Gemeinde', true); return; }
  } else if (scope === 'region') {
    if (!targetRegion) { toast('Select a region', true); return; }
  }
  // scope === 'country': targetRegion and targetGemeinde stay null — backend adds to all regions

  if (idx >= 0) {
    const h = state.holidays[idx];
    if (!targetRegion && h.canton) targetRegion = h.canton;
    if (!targetGemeinde && h.gemeinde_id) targetGemeinde = h.gemeinde_id;
  }

  const body = { country: state.country, category: state.category, year: state.year, region: targetRegion, gemeinde_id: targetGemeinde, holiday, editIdx: idx >= 0 ? findOriginalIdx(idx) : -1, scope };
  const r = await api('/holidays', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (r.ok) {
    const msg = scope === 'country' ? 'Holiday added to all regions' : (idx >= 0 ? 'Holiday updated' : 'Holiday added');
    toast(msg); closeModal(); await loadData();
  }
  else toast(r.error || 'Save failed', true);
}

async function deleteHoliday(idx) {
  const h = state.holidays[idx];
  if (!confirm(`Delete "${nameStr(h.name)}"?`)) return;
  const body = { country: state.country, category: state.category, year: state.year, region: h.canton || null, gemeinde_id: h.gemeinde_id || null, deleteIdx: findOriginalIdx(idx) };
  const r = await api('/holidays', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (r.ok) { toast('Holiday deleted'); await loadData(); }
  else toast(r.error || 'Delete failed', true);
}

function findOriginalIdx(filteredIdx) {
  // Map filtered holiday index back to its index in the source entry's holidays array
  const h = state.holidays[filteredIdx];
  const entry = h._entry;
  if (!entry || !entry.holidays) return -1;
  for (let i = 0; i < entry.holidays.length; i++) {
    const eh = entry.holidays[i];
    if (eh.start === h.start && eh.end === h.end && nameStr(eh.name) === nameStr(h.name)) return i;
  }
  return -1;
}

function clickDay(ds) {
  // If there are holidays on this day, scroll to first one in list
  const idx = state.holidays.findIndex(h => h.start <= ds && h.end >= ds);
  if (idx >= 0) {
    const rows = document.querySelectorAll('#holiday-tbody tr');
    if (rows[idx]) { rows[idx].scrollIntoView({behavior:'smooth', block:'center'}); rows[idx].style.background='rgba(88,166,255,0.15)'; setTimeout(()=>rows[idx].style.background='',1500); }
  } else {
    // Pre-fill add dialog with this date
    document.getElementById('m-start').value = ds;
    document.getElementById('m-end').value = ds;
    addHoliday();
    document.getElementById('m-start').value = ds;
    document.getElementById('m-end').value = ds;
  }
}

function closeModal() { document.getElementById('modal').classList.remove('active'); }

// === Helpers ===
function nameStr(name, lang) {
  if (!name) return '';
  if (typeof name === 'string') return name;
  if (lang) return name[lang] || '';
  return name.de || name.en || name.fr || name.it || '';
}
function fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show' + (err ? ' error' : '');
  setTimeout(() => t.className = 'toast', 2500);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
init();
</script>
</body>
</html>"""


class EditorHandler(http.server.BaseHTTPRequestHandler):
    """HTTP handler for the holiday editor API + UI."""

    def log_message(self, format, *args):
        # Quieter logging
        sys.stderr.write(f"  {args[0]}\n")

    def _json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html_response(self, html):
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    # --- Routes ---

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/" or parsed.path == "":
            self._html_response(HTML_PAGE)
        elif parsed.path == "/api/meta":
            self._handle_meta()
        elif parsed.path == "/api/holidays":
            self._handle_get_holidays(parsed.query)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/api/holidays":
            self._handle_save_holiday()
        else:
            self.send_error(404)

    def do_DELETE(self):
        if self.path == "/api/holidays":
            self._handle_delete_holiday()
        else:
            self.send_error(404)

    # --- API handlers ---

    def _handle_meta(self):
        countries = discover_countries()
        gemeinden = load_gemeinden()
        self._json_response({"countries": countries, "gemeinden": gemeinden})

    def _handle_get_holidays(self, query_string):
        params = urllib.parse.parse_qs(query_string)
        country = params.get("country", ["ch"])[0]
        category = params.get("category", ["worker"])[0]
        year = int(params.get("year", [2026])[0])

        files = discover_files(country)
        entries = []
        source_file = None

        if category == "worker":
            fname = f"workers_{year}.json"
            if fname in files["workers"]:
                source_file = fname
                entries = load_json(HOLIDAYS_DIR / country / fname)
        elif category == "school":
            fname = f"school_{year}.json"
            if fname in files["school"]:
                source_file = fname
                entries = load_json(HOLIDAYS_DIR / country / fname)
        elif category == "student":
            if "students.json" in files["students"]:
                source_file = "students.json"
                all_entries = load_json(HOLIDAYS_DIR / country / "students.json")
                entries = [e for e in all_entries if e.get("year") == year]

        self._json_response({
            "entries": entries,
            "fileInfo": {"file": source_file, "country": country, "category": category, "year": year},
        })

    def _handle_save_holiday(self):
        body = self._read_body()
        country = body["country"]
        category = body["category"]
        year = body["year"]
        region = body.get("region")
        gemeinde_id = body.get("gemeinde_id")
        holiday = body["holiday"]
        edit_idx = body.get("editIdx", -1)
        scope = body.get("scope", "region")

        file_path, all_data = self._resolve_file(country, category, year)
        if file_path is None:
            file_path = self._new_file_path(country, category, year)
            all_data = []

        if category == "student":
            # Student: find or create entry by gemeinde_id
            if not gemeinde_id:
                self._json_response({"ok": False, "error": "Gemeinde required for student holidays"}, 400)
                return
            entry = next((e for e in all_data if e.get("gemeinde_id") == gemeinde_id and e.get("year") == year), None)
            if not entry:
                entry = {"gemeinde_id": gemeinde_id, "year": year, "category": "student", "holidays": []}
                all_data.append(entry)
            if edit_idx >= 0 and edit_idx < len(entry["holidays"]):
                entry["holidays"][edit_idx] = holiday
            else:
                entry["holidays"].append(holiday)
            full_data = load_json(file_path) if file_path.exists() else []
            full_data = [e for e in full_data if not (e.get("gemeinde_id") == gemeinde_id and e.get("year") == year)]
            full_data.append(entry)
            save_json(file_path, full_data)
        elif scope == "country":
            # Add holiday to ALL region entries in the file
            # If no region entries exist yet, create them from gemeinden data
            region_entries = [e for e in all_data if e.get("canton") and not e.get("gemeinde_id")]
            if not region_entries:
                gemeinden = load_gemeinden()
                regions = sorted({g["canton"] for g in gemeinden
                                  if g.get("country", "").upper() == country.upper() and g.get("canton")})
                if not regions:
                    self._json_response({"ok": False, "error": "No regions found for this country"}, 400)
                    return
                for r in regions:
                    entry = {"canton": r, "year": year, "holidays": []}
                    if category == "school":
                        entry["category"] = "school"
                    all_data.append(entry)
                region_entries = [e for e in all_data if e.get("canton") and not e.get("gemeinde_id")]
            count = 0
            for entry in region_entries:
                entry["holidays"].append(holiday)
                count += 1
            save_json(file_path, all_data)
            self._json_response({"ok": True, "count": count})
            return
        elif gemeinde_id:
            # Gemeinde-level override
            entry = next((e for e in all_data if e.get("gemeinde_id") == gemeinde_id), None)
            if not entry:
                entry = {"gemeinde_id": gemeinde_id, "year": year, "holidays": []}
                if category == "school":
                    entry["category"] = "school"
                all_data.append(entry)
            if edit_idx >= 0 and edit_idx < len(entry["holidays"]):
                entry["holidays"][edit_idx] = holiday
            else:
                entry["holidays"].append(holiday)
            save_json(file_path, all_data)
        else:
            # Region-level (canton/Bundesland)
            if not region:
                self._json_response({"ok": False, "error": "Region required"}, 400)
                return
            entry = next((e for e in all_data if e.get("canton") == region and not e.get("gemeinde_id")), None)
            if not entry:
                entry = {"canton": region, "year": year, "holidays": []}
                if category == "school":
                    entry["category"] = "school"
                all_data.append(entry)
            if edit_idx >= 0 and edit_idx < len(entry["holidays"]):
                entry["holidays"][edit_idx] = holiday
            else:
                entry["holidays"].append(holiday)
            save_json(file_path, all_data)

        self._json_response({"ok": True})

    def _handle_delete_holiday(self):
        body = self._read_body()
        country = body["country"]
        category = body["category"]
        year = body["year"]
        region = body.get("region")
        gemeinde_id = body.get("gemeinde_id")
        delete_idx = body.get("deleteIdx", -1)

        file_path, all_data = self._resolve_file(country, category, year)
        if file_path is None or delete_idx < 0:
            self._json_response({"ok": False, "error": "File or index not found"}, 400)
            return

        if category == "student":
            entry = next((e for e in all_data if e.get("gemeinde_id") == gemeinde_id and e.get("year") == year), None)
            if entry and 0 <= delete_idx < len(entry["holidays"]):
                entry["holidays"].pop(delete_idx)
                full_data = load_json(file_path) if file_path.exists() else []
                full_data = [e for e in full_data if not (e.get("gemeinde_id") == gemeinde_id and e.get("year") == year)]
                if entry["holidays"]:
                    full_data.append(entry)
                save_json(file_path, full_data)
                self._json_response({"ok": True})
            else:
                self._json_response({"ok": False, "error": "Entry not found"}, 400)
        elif gemeinde_id:
            # Gemeinde-level entry
            entry = next((e for e in all_data if e.get("gemeinde_id") == gemeinde_id), None)
            if entry and 0 <= delete_idx < len(entry["holidays"]):
                entry["holidays"].pop(delete_idx)
                if not entry["holidays"]:
                    all_data.remove(entry)
                save_json(file_path, all_data)
                self._json_response({"ok": True})
            else:
                self._json_response({"ok": False, "error": "Entry not found"}, 400)
        else:
            entry = next((e for e in all_data if e.get("canton") == region and not e.get("gemeinde_id")), None)
            if entry and 0 <= delete_idx < len(entry["holidays"]):
                entry["holidays"].pop(delete_idx)
                if not entry["holidays"]:
                    all_data.remove(entry)
                save_json(file_path, all_data)
                self._json_response({"ok": True})
            else:
                self._json_response({"ok": False, "error": "Entry not found"}, 400)

    # --- File resolution ---

    def _resolve_file(self, country, category, year):
        """Return (Path, data) for the matching file, or (None, [])."""
        cdir = HOLIDAYS_DIR / country
        if category == "worker":
            p = cdir / f"workers_{year}.json"
        elif category == "school":
            p = cdir / f"school_{year}.json"
        elif category == "student":
            p = cdir / "students.json"
        else:
            return None, []

        if p.exists():
            data = load_json(p)
            if category == "student":
                return p, [e for e in data if e.get("year") == year]
            return p, data
        return None, []

    def _new_file_path(self, country, category, year):
        cdir = HOLIDAYS_DIR / country
        cdir.mkdir(parents=True, exist_ok=True)
        if category == "worker":
            return cdir / f"workers_{year}.json"
        elif category == "school":
            return cdir / f"school_{year}.json"
        elif category == "student":
            return cdir / "students.json"


# === Main ===

def main():
    parser = argparse.ArgumentParser(description="HCP Holiday Editor — local admin tool")
    parser.add_argument("--port", type=int, default=8888, help="Port to listen on (default: 8888)")
    parser.add_argument("--no-browser", action="store_true", help="Don't auto-open browser")
    args = parser.parse_args()

    # Verify data directory exists
    if not HOLIDAYS_DIR.exists():
        print(f"ERROR: Holiday data directory not found: {HOLIDAYS_DIR}")
        print("Run this script from the HCP project root.")
        sys.exit(1)

    countries = discover_countries()
    print(f"\n  HCP Holiday Editor")
    print(f"  ──────────────────")
    print(f"  Data dir:   {HOLIDAYS_DIR}")
    print(f"  Countries:  {', '.join(c.upper() for c in countries) if countries else '(none)'}")
    print(f"  Gemeinden:  {GEMEINDEN_PATH}")
    print(f"  Server:     http://localhost:{args.port}")
    print(f"  Press Ctrl+C to stop\n")

    with socketserver.TCPServer(("", args.port), EditorHandler) as httpd:
        httpd.allow_reuse_address = True
        if not args.no_browser:
            threading.Timer(0.5, lambda: webbrowser.open(f"http://localhost:{args.port}")).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Stopped.")


if __name__ == "__main__":
    main()
