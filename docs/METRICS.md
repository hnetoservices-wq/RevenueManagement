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

## Comparisons

- Revenue, ADR, RevPAR, counts, lead time, and LOS show absolute and relative change where the comparison denominator is non-zero.
- Occupancy and cancellation rate show percentage-point change. Relative rate change may be shown secondarily.
