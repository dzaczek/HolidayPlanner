# HolidayPlanner — Frequently Asked Questions

---

## General

**Do I need to create an account to use HCP?**
No. HCP requires no account, no email address, and no login. Open the app in any modern browser and it's ready to use.

**Does HCP work offline?**
Yes. Once the page has loaded, the app works fully offline. All your data is stored in your browser's IndexedDB — no internet connection is needed to view or edit your calendar.

**Will my data be lost if I clear my browser history or cache?**
Yes. Clearing browser data (cookies, site data, IndexedDB) will erase your calendar. Before clearing, always use the **Backup** button to download a `.json` file of your data. You can restore it at any time with the same button.

**Can I use HCP on multiple devices (phone + laptop)?**
Yes, but your data doesn't sync automatically across devices by default. The easiest options:
- **Family Sync (E2EE):** Creates a live, encrypted connection between devices. Any change on one device appears on the others after a sync.
- **Backup/Restore:** Export a JSON file on one device and import it on another (manual, one-time transfer).
- **Copy Link:** Share a snapshot URL and open it on the other device — this imports the data once but does not stay in sync.

**What languages does HCP support?**
German, French, Italian, and English. The app automatically selects the language that matches your browser's locale setting.

**Which browsers are supported?**
Any modern browser that supports the Web Crypto API and IndexedDB: Chrome 90+, Firefox 90+, Safari 15+, Edge 90+. Internet Explorer is not supported.

---

## Holiday Data

**My municipality / Gemeinde is not in the list — what do I do?**
Try searching by postal code (PLZ) instead of the municipality name. If it still does not appear, the municipality may be very small and not yet in the database. As a workaround, pick the nearest large municipality in the same canton — the public holiday set will be identical.

**The holiday data for my canton looks wrong or outdated. How do I report it?**
Please [open an issue](https://github.com/dzaczek/hcp/issues) with the name of the canton, the incorrect date, and a link to the official source. Holiday data is derived from official government PDFs (EDK/CDIP, Bundesamt für Justiz) and updated periodically.

**How far ahead does the holiday data go?**
The built-in seed data currently covers 2025–2035 for Swiss and German cantons/Bundesländer. For years beyond the seed, public holidays are calculated dynamically using the Easter algorithm and fixed-date rules.

**Can I add a holiday that is not in the database?**
Yes. Select any day on the calendar and use the **Add holiday** option to create a manual entry for any person. Manual holidays are shown with a striped pattern so you can distinguish them from database holidays.

**When will Austria (or another country) be supported?**
There is no fixed roadmap, but the app is built to support multiple countries. See the [developer guide in README.md](../README.md#adding-a-new-country) for instructions on adding a country yourself.

---

## Sharing & Family Sync

**What is the difference between Family Sync and Copy Link?**

| | Family Sync (E2EE) | Copy Link |
|---|---|---|
| Encrypted | ✅ AES-256 | ❌ None |
| Live sync | ✅ Yes | ❌ One-time snapshot |
| Both sides can edit | ✅ Yes | ❌ No |
| Data stored on server | ✅ 180 days | ❌ Never |
| How to share | Family code (`hcp_…`) | URL link |

Use **Family Sync** for ongoing collaboration. Use **Copy Link** to quickly show someone the current state of your calendar.

**Can the server read my Family Sync calendar?**
No. All data is encrypted on your device using AES-256-GCM *before* it is uploaded. The server stores only an opaque encrypted blob — it has no way to read your names, dates, or plans. Even if the server were compromised, an attacker would see only encrypted noise.

**What is the family code and where do I keep it?**
The family code (`hcp_<id>_<key>`) is a single string that contains both the address of your calendar on the server and the encryption key. Anyone who has this code can read and edit your calendar. Keep it private — treat it like a password. You can always copy it again from the **Family Sync** status screen inside the app.

**What if I lose the family code?**
If you still have the Family Sync status screen open, copy the code from there. If the app was closed, check if you have it saved somewhere (a note, a message you sent to yourself). If the code is truly lost and you have no backup, access cannot be recovered — by design, we do not hold a copy of your key. In that case, start a new Family Sync and re-enter your data, or restore from a `.json` backup file.

**How many people can join a Family Sync?**
There is no hard limit on the number of devices or people. Anyone with the family code can join.

**Can I revoke access after I've shared the family code?**
Not directly. Because the code contains the encryption key, everyone who has it retains access. To cut off access: use **Leave** in the Family Sync screen, then create a new Family Sync (which generates a new key and a new calendar ID), and share the new code only with the people you want.

**What happens if two people edit the calendar at the same time?**
Family Sync uses optimistic locking and a smart-merge algorithm. When two devices push at the same time, the second push receives a 409 Conflict response and automatically re-fetches the latest version, merges the changes locally, and pushes again. In practice, conflicts are resolved transparently without any action required from you. In the rare case of a true data conflict on the same entry, the server's version wins.

**What happens after 180 days of inactivity?**
If no device pushes or syncs for 180 consecutive days, the server automatically deletes the encrypted backup to save space. Your local data is not affected — it remains in your browser. To re-activate the sync, simply click **Sync** or **Push** in the app, which re-uploads your local calendar.

**Is the Copy Link safe to share publicly (e.g., post on a website)?**
No. The Copy Link URL contains your full calendar data in a compressed but unencrypted format. Anyone with the link can read all names, dates, and holidays in it. Only share it with people you trust. For private sharing, always use Family Sync.

**Can I import a Copy Link without overwriting my existing data?**
When you open a Copy Link, the app imports the data as a one-time merge into your current browser session. Your existing local data is not automatically deleted. Review the imported data before saving.

---

## Privacy & Security

**Does HCP collect any analytics or telemetry?**
No. The app does not include any analytics scripts, tracking pixels, or telemetry. No usage data is sent anywhere. The only network activity is:
- Loading the static app files from the server
- Family Sync API calls (`GET`/`PUT /v1/calendar/:id`) — only if you use Family Sync

**Does HCP use cookies?**
No cookies are set by the app itself. `localStorage` is used only to store the family code and sync timestamps when Family Sync is active.

**Can I self-host HCP?**
Yes. The app is a static site (plain HTML + JS + CSS). Run `npm run build`, copy the `dist/` folder to any static file host, and optionally run the provided Docker setup. For Family Sync, you also need to deploy one of the two backends: Cloudflare Workers (KV) or the Node.js + SQLite server. See the [Technical Architecture Guide](./technical-architecture.md) for API details.

**What encryption algorithm does Family Sync use?**
AES-256-GCM via the browser's native Web Crypto API. A fresh 96-bit random IV is generated for every encrypt operation. The 256-bit key is generated locally in your browser and encoded in the family code as a `base64url` string (43 characters).

---

## Vacation Planning

**How does HCP calculate working days?**
For each person, the app counts calendar days in the selected period, then subtracts weekends (Saturday + Sunday) and all applicable holidays (public holidays from the database plus any manually added holidays). The result is the net number of working days — useful when planning how many vacation days to request from your employer.

**Can I assign a leave period to multiple family members at once?**
Yes. When creating or editing a leave period, you can select multiple family members in the person selector. The leave bar is then shown for all selected members, and overlapping days are highlighted on the calendar.

**What is the striped pattern on some holidays?**
Solid colored blocks are holidays loaded from the built-in database. Striped blocks are holidays you added manually. This distinction makes it easy to see which entries come from official sources and which are your own additions.

**Can I switch between different calendar layouts?**
Yes. The toolbar includes layout presets (3×4, 2×6, 4×3, 6×2, 1×12, 12×1) so you can choose the view that best fits your screen — from a compact grid to a long vertical scroll.

---

*For sharing instructions, see the [Sharing Guide](./sharing-guide.md).*
*For technical implementation details, see the [Technical Architecture Guide](./technical-architecture.md).*
