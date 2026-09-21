# Local Revenue Manager

A private, local-first revenue management desktop application for accommodation properties. The first working milestone imports Amenitiz XLSX/CSV reservation reports, validates and normalizes them, stores immutable snapshots in SQLite, and calculates the initial dashboard KPIs.

## Current milestone

- Malmerendas Boutique Lodging is created as the initial property without hardcoding analytics to it.
- Amenitiz XLSX and CSV imports are supported.
- Header detection handles the two title rows in the real Amenitiz export.
- Portuguese-formatted money is converted to integer cents.
- Multi-room reservation strings are normalized into room allocations.
- Guest names, email, phone, address, comments, and requests are not persisted.
- Each import is stored as an immutable snapshot and protected by a SHA-256 file hash.
- The dashboard calculates occupancy, ADR, RevPAR, revenue, room nights, reservations, lead time, and length of stay.
- Browser preview mode uses local browser storage. The installed Tauri application uses SQLite.

## Windows prerequisites

Install these once:

1. Node.js LTS.
2. Rust using `rustup` with the stable MSVC toolchain.
3. Microsoft C++ Build Tools with **Desktop development with C++**.
4. Microsoft Edge WebView2 Runtime (already included on current Windows 10/11 installations).

Tauri's official prerequisites guide is: <https://v2.tauri.app/start/prerequisites/>

## Run in browser preview mode

```powershell
npm install
npm run dev
```

This mode is useful for interface work. Data stays in the browser profile rather than SQLite.

## Run as the desktop application

```powershell
npm install
npm run tauri dev
```

## Tests and production build

```powershell
npm run test:run
npm run build
npm run tauri build
```

The final command creates a Windows installer under `src-tauri\target\release\bundle`.

## Importing a report

1. Confirm the selected property in the top bar.
2. Select **Import report**.
3. Choose the Amenitiz `.xlsx` or `.csv` file.
4. Review the inferred **Data as of** date and validation summary.
5. Confirm the import.

The application never uploads the report. Raw guest details are parsed only long enough to identify the fields required for analytics and are then discarded.

## Project documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Metrics](docs/METRICS.md)
- [Backlog](BACKLOG.md)
- [Changelog](CHANGELOG.md)
