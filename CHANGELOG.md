# Changelog

## Unreleased

### Added

- Historical snapshot reservation queries for both SQLite and browser preview repositories.
- Snapshot-to-snapshot pickup calculations for room nights, occupancy, revenue, reservations, ADR, and RevPAR.
- Snapshot comparison controls and pickup KPI cards on the Imports page.
- Dedicated Pace & Pickup page with all-snapshot booking-position timeline and consecutive pickup table.
- Snapshot-based days-before-arrival booking curve at D-180, D-90, D-60, D-30, D-14, D-7, D-3, and D-0.
- Lead-time curve coverage and average snapshot-lag indicators so sparse historical data is visible.
- Coverage-quality rules: reliable at 80%+, partial at 50–79.9%, and insufficient below 50%.
- Same-time-last-year lead-time pace comparison using equivalent prior-year stay dates and D-points.
- Coverage-gated STLY occupancy percentage-point deltas that require reliable coverage in both periods.
- Pickup decomposition into new bookings, cancellations, modifications, and reservations removed from a later report.
- Reservation-level pickup drilldown with changed fields, before/after stay dates, room-night delta, and room-revenue delta.
- Dedicated Performance dashboard with occupancy, ADR, RevPAR, revenue, room-night, reservation, LOS, and lead-time KPIs.
- Performance comparison modes for previous year, immediately preceding equal-length period, or no comparison.
- Automatic daily, weekly, and monthly Performance trend granularity based on the selected stay-date range.
- Monthly Performance table with occupancy, ADR, RevPAR, room nights, room revenue, and comparison deltas.
- Performance data-coverage indicators and monthly comparison-coverage diagnostics.
- Shared Channel, Room Type, and Status analysis filters across Dashboard, Performance, and Pace & Pickup.
- Room-type inventory projection so filtered occupancy uses the selected room type's actual available-room denominator.
- Explicit estimated-revenue notice for mixed multi-room reservations when a room-type filter requires proportional allocation.
- Automated pickup, decomposition, lead-time reconstruction, coverage-quality, STLY pace, Performance-period, incomplete-history, and analysis-filter regression coverage.

### Fixed

- Dashboard current-state metrics now use the complete newest `data_as_of` snapshot instead of carrying forward the newest known version of each reservation from older snapshots.
- Importing an older historical file after a newer file no longer changes the Dashboard's current booking position.
- Low-coverage lead-time observations no longer appear as directly comparable full-period booking-curve points.
- Performance previous-year/previous-period comparisons no longer treat unavailable historical dates as zero occupancy or zero revenue.
- Aggregate Performance comparison deltas are suppressed when fewer than 80% of the requested comparison dates are covered.

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
