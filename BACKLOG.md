# Backlog

Items here are intentionally deferred until the first end-to-end workflow is stable.

## Next

- Import and validate historical unavailable-room periods from the 2024/2025 workbook calendars so historical occupancy denominators match the source workbook.
- Make days-before-arrival points configurable after the fixed D-180 / D-90 / D-60 / D-30 / D-14 / D-7 / D-3 / D-0 model is validated with real data.

## Property and commercial configuration

- Version room-inventory quantity changes by effective date so post-import inventory edits never rewrite historical occupancy denominators.
- Version inventory-closure knowledge by booking-position date if historical pace analysis later needs to reproduce exactly what inventory was considered sellable at each historical snapshot.
- Add channel classification / grouping so direct channels such as Amenitiz and manual reservations can optionally be rolled into one Direct category.
- Add channel commission settings and net revenue after distribution cost.
- Verify the native Windows installer on Hudson's computer.

## Later analytics

- Channels dashboard.
- Room dashboard with explicit estimated allocation labels for multi-room revenue.
- Cancellations dashboard.
- Lead-time and length-of-stay histograms.
- Count preserved legacy room-move segments as one logical reservation in reservation-count and stay-length statistics while keeping their per-room occupancy exact.
- Deterministic insight engine.
- Budget and target input workflow.

## Historical data recovery

- Historical 2024/2025 reservation history is normalized and supported through the dedicated legacy final-data import path. Remaining historical recovery work is limited to inventory closures and any future source corrections.

## Exports

- CSV export for filtered normalized data.
- XLSX management report.
- Professionally laid-out PDF report.

## Import adapters

- Booking.com.
- Expedia.
- Airbnb.
