# Metric definitions

All stay-date ranges are inclusive of the selected start and end dates. Check-out dates do not count as occupied nights.

| Metric | Definition |
| --- | --- |
| Room nights sold | Sum of active booked room quantities for every occupied stay night in the selected period. |
| Available room nights | Configured active inventory multiplied by available dates in the selected period. Inventory exceptions are deferred. |
| Occupancy | Room nights sold divided by available room nights. |
| Room revenue | Reservation room revenue allocated to the selected stay nights, excluding cancelled reservations. |
| ADR | Room revenue divided by room nights sold. |
| RevPAR | Room revenue divided by available room nights. |
| Reservations | Distinct active reservation IDs with at least one occupied night in the selected period. |
| Average length of stay | Arithmetic mean of full reservation nights for active reservations intersecting the period. |
| Median length of stay | Median of full reservation nights for active reservations intersecting the period. |
| Lead time | Calendar days from booked date to check-in. Negative values are flagged. |
| Cancellation rate | Cancelled reservations divided by active plus cancelled reservations whose stays intersect the period. |
| Total revenue | Allocated room revenue plus allocated extra revenue plus tourist tax. |

## Revenue basis

The dashboard can use tax-inclusive or tax-exclusive room and extra revenue. Tourist tax is always kept separate and never enters ADR or RevPAR.

## Partial-period allocation

Amenitiz supplies revenue at reservation level, not nightly rate detail. When a selected period includes only part of a stay, the first milestone allocates reservation revenue evenly per occupied room-night. This is an explicit estimate. A full-stay selection reproduces the exact reservation total.

## Multi-room limitation

The property-level revenue total is reliable. Exact revenue and ADR by room type are not shown for multi-room reservations because the export does not identify the rate for each room. Occupancy by room type remains calculable from quantities.

## Historical snapshots and pickup

Each Amenitiz import is an immutable booking-position snapshot identified by its `data_as_of` date. The current Dashboard uses the complete snapshot with the newest `data_as_of` date for the property. Historical pickup compares the same stay-date period between snapshots; it does not merge missing reservations forward from older snapshots.

## Days-before-arrival booking curve

The Pace & Pickup lead-time curve uses the standard points D-180, D-90, D-60, D-30, D-14, D-7, D-3, and D-0.

For each selected stay date and each D-point:

1. Calculate the target observation date as `stay date - D`.
2. Use the most recent imported snapshot whose `data_as_of` date is on or before that target date.
3. Never use a later snapshot to backfill an earlier D-point.
4. Exclude the observation when the selected snapshot is more than 14 days older than the target date.
5. Aggregate only covered stay dates and show coverage explicitly as `covered stay dates / selected stay dates`.

The curve is therefore snapshot-based historical booking position, not a reconstruction from the reservation `booked_at` field. Occupancy, room nights, room revenue, ADR, and RevPAR at a D-point are calculated only from covered stay dates. The average snapshot lag is displayed so sparse historical data is visible rather than silently treated as exact.

### Coverage quality

Lead-time observations use three coverage classes:

- **Reliable:** at least 80% of selected stay dates are covered. These points are shown as the normal solid booking curve and may be used for same-time-last-year percentage-point comparisons.
- **Partial:** at least 50% but less than 80% of selected stay dates are covered. These observations may be shown as dashed points/segments but are not used for headline STLY deltas.
- **Insufficient:** less than 50% coverage. Raw diagnostic values remain visible in the table, but the occupancy point is not plotted.

This prevents a small surviving subset of stay dates from visually appearing comparable with a near-complete period.

## Same-time-last-year pace

Same-time-last-year (STLY) pace compares the selected stay period with the equivalent stay dates one year earlier on the same D-180 to D-0 lead-time axis.

For example, D-30 for October 2026 is compared with D-30 for October 2025, not with October 2025's final booking position. Both sides are reconstructed independently from the immutable historical snapshots using the same 14-day maximum snapshot lag.

An occupancy percentage-point delta is only calculated when both the current period and prior-year period are **Reliable** at that D-point. Partial or insufficient coverage remains visible but does not generate a precise STLY delta.

If no prior-year snapshots exist around the equivalent lead dates, the application reports that prior-year booking-position coverage is unavailable rather than substituting final/latest data.

## Comparisons

- Revenue, ADR, RevPAR, counts, lead time, and LOS show absolute and relative change where the comparison denominator is non-zero.
- Occupancy and cancellation rate show percentage-point change. Relative rate change may be shown secondarily.
