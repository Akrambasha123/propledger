# PropLedger — Personal Building Rental Cashbook

A simple, mobile-first, 100% browser-based rental tracker built with HTML5, CSS3, and Vanilla JavaScript for **one building with 7 fixed units and 6 electricity meters**.

## Structure

- **7 Independent Rental Units**: House 1, House 2, House 3, House 4, Shop, Bachelor Room 1, Bachelor Room 2.
- **6 Physical Electricity Meters**:
  - Meters 1–5: Individual meters for House 1, House 2, House 3, House 4, and Shop (with optional contributions from other units).
  - Meter 6: Shared physical meter for Bachelor Room 1 and Bachelor Room 2, while keeping both rooms' electricity shares, payments, rents, advances, water bills, and histories completely independent.
- **4 Main Sections**: Dashboard, Properties, Payments & Bills, History (plus Settings for JSON backup/restore & basic preferences).

## Project Files

```text
rental/
├── index.html
├── README.md
└── assets/
    ├── css/
    │   └── style.css
    └── js/
        ├── helpers.js
        ├── storage.js
        ├── engine.js
        ├── modals.js
        ├── views.js
        └── app.js
```

## Running Locally & GitHub Pages

1. Open `index.html` directly in any modern browser — no server or build step needed.
2. To host on GitHub Pages, push `index.html`, `README.md`, and `assets/` to `main`, then enable **Settings → Pages → Deploy from branch (`main`, `/ (root)`)**.
3. Data auto-saves in `localStorage` & `IndexedDB`. Use **Settings → Export JSON Backup** to download a local backup file.
