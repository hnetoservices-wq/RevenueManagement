# Changelog

## Unreleased

### Added

- Historical snapshot reservation queries for both SQLite and browser preview repositories.
- Snapshot-to-snapshot pickup calculations for room nights, occupancy, revenue, reservations, ADR, and RevPAR.
- Snapshot comparison controls and pickup KPI cards on the Imports page.
- Dedicated Pace & Pickup page with all-snapshot booking-position timeline and consecutive pickup table.
- Snapshot-based days-before-arrival booking curve at D-180, D-90, D-60, D-30, D-14, D-7, D-3, and D-0.
- Lead-time curve coverage and average snapshot-lag indicators so sparse historical data is visible.
- Automated pickup and lead-time reconstruction regression coverage.

### Fixed

- Dashboard current-state metrics now use the complete newest `data_as_of` snapshot instead of carrying forward the newest known version of each reservation from older snapshots.
- Importing an older historical file after a newer file no longer changes the Dashboard's current booking position.

## 0.1.0 - 2026-09-21

### Added

- Tauri 2, React, TypeScript, Vite, and SQLite project foundation.
- Amenitiz XLSX/CSV parser based on the real 15 September 2026 export structure.
- Immutable import snapshots with file-hash duplicate protection.
- Privacy-focused reservation normalization.
- Configurable status mapping and canonical room-type validation.
- Core revenue management metrics and previous-year comparison.
- Dashboard, import review, validation issues, and import history.
- Automated parser and analytics tests.
