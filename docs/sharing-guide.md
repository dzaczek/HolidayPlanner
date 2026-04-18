# HolidayPlanner — How to share your calendar

HolidayPlanner offers two ways to share your calendar with family and friends. Depending on whether you want to work together on the same calendar or just show someone a quick snapshot, you can choose between **Family Sync** and **Copy Link**.

---

## 🔒 Family Sync (E2EE)
**Best for: ongoing family collaboration**

Family Sync creates a persistent, secure connection between multiple devices. Everyone with the family code can view and edit the same calendar.

### How it works
1. **Create:** One person starts a "Family Sync" and gets a unique **Family Code**.
2. **Share:** You send this code to your family members (e.g., via Signal, WhatsApp, or email).
3. **Join:** They paste the code into their app, and instantly see your calendar.
4. **Sync:** Any changes made by anyone are merged and shared with everyone else.

### Security
Your data is **End-to-End Encrypted (E2EE)**. This means the calendar is locked with a secret key *before* it leaves your browser. The server only sees encrypted "blobs" and has no way to read your plans.

### Step-by-Step Flow
```mermaid
sequenceDiagram
    participant A as Person A (Creator)
    participant S as Server (sees only 🔒 blobs)
    participant B as Person B (Joiner)

    A->>A: Click "Family Sync" → Create
    A->>A: App generates Key + Calendar ID
    A->>A: Encrypts calendar data with Key
    A->>S: Uploads encrypted blob 🔒
    A->>B: Shares family code (hcp_xxxxx_xxxxx)

    B->>B: Click "Family Sync" → Join
    B->>B: Pastes family code
    B->>S: Downloads encrypted blob 🔒
    B->>B: Decrypts with Key from family code
    B->>B: Merges with own data
    B->>S: Uploads merged encrypted blob 🔒
```

### Understanding the Family Code
The Family Code is the "key" to your data. It contains two parts:
```mermaid
mindmap
  root((Family Code))
    ID(hcp_CalendarID)
      ::icon(fa fa-map-marker)
      Address
      (Where the data is stored)
    Key(EncryptionKey)
      ::icon(fa fa-key)
      Secret
      (How to unlock it - share carefully!)
```

---

## 📋 Copy Link (Clipboard Share)
**Best for: quickly showing someone your current state**

Clipboard Share is a one-time "snapshot" of your calendar. It's like taking a photo and sending it to someone.

### How it works
1. **Copy:** You click "Share" → "Copy Link".
2. **Send:** You send the long URL to someone.
3. **Import:** When they open the link, the app imports your data into their browser.

### Key difference
There is **no ongoing connection**. If you change your calendar later, the other person won't see the updates unless you send a new link. Also, this method is **not encrypted** — the data is packed directly into the URL.

### Step-by-Step Flow
```mermaid
sequenceDiagram
    participant A as Person A (Sender)
    participant B as Person B (Recipient)

    A->>A: Click "Share" → Copy Link
    A->>A: App compresses calendar data into URL
    A->>B: Sends URL via email/chat
    B->>B: Opens URL in browser
    B->>B: App imports data (one time only)
    Note over B: No ongoing connection — just a snapshot!
```

---

## Comparison Table

| Feature | Family Sync (E2EE) | Copy Link (Clipboard) |
| :--- | :--- | :--- |
| **Encryption** | ✅ AES-256 (Private) | ❌ None (Public link) |
| **Ongoing Connection** | ✅ Yes | ❌ No (One-time import) |
| **Both can edit** | ✅ Yes | ❌ No |
| **Server stores data** | ✅ 180 days | ❌ Never |
| **How to share** | Family code (`hcp_...`) | URL link |
| **Who can see data** | Only people with the key | Anyone with the link |
| **Best for** | Family collaboration | Quick snapshot share |

---

## FAQ

**Can the server read my calendar?**
No. When using Family Sync, all data is encrypted on your device before it is sent to the server. The server never sees your names, holidays, or dates.

**What if I lose the family code?**
If the Family Sync status screen is still open, copy the code from there. If the app was closed and you have no saved copy, access cannot be recovered — we do not hold a copy of your encryption key. In that case, start a new Family Sync and share the new code with your family. Always save the code somewhere safe (a password manager, a secure note).

**What happens after 180 days?**
If no device syncs for 180 consecutive days, the server deletes the encrypted backup. Your local browser data is unaffected. To keep the sync alive, simply click **Sync** or **Push** once in a while — even without making changes.

**Is the "Copy Link" safe to share publicly?**
No. The link contains your calendar data in a compressed but unencrypted form. Anyone with the link can read it. Only share it with people you trust. For private sharing, always use **Family Sync**.

**Can I revoke access after sharing the family code?**
Not directly. To cut off access, click **Leave** in the Family Sync screen, create a new Family Sync (which generates a new key and ID), and share the new code only with the people you still want to include.

**What if two people edit the calendar at the same time?**
Family Sync handles this automatically using optimistic locking. If two devices push simultaneously, the second one detects a conflict (HTTP 409), re-fetches the latest version, merges changes locally, and pushes again — all without any action from you.

**How many people can join a Family Sync?**
There is no limit. Anyone who has the family code can join and sync.

---

*For more answers, see the full [FAQ](./faq.md).*
*For technical implementation details, see the [Technical Architecture Guide](./technical-architecture.md).*
