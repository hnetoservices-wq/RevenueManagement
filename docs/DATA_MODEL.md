# Data model

## Property ownership

Every persisted business record carries a `property_id`. Cross-property joins are never used for performance metrics.

## Tables

### `properties`

- `id`
- `name`
- `currency`
- `timezone`
- `created_at`

### `room_types`

- `id`
- `property_id`
- `canonical_name`
- `inventory_count`
- `active_from`
- `active_to`

The first Malmerendas configuration has six room types with one unit each.

### `status_mappings`

- `property_id`
- `source`
- `source_status`
- `normalized_status`

Initial mapping: `confirmed` and `modified` are active; `cancelled` is cancelled.

### `import_snapshots`

- `id`
- `property_id`
- `source`
- `original_filename`
- `imported_at`
- `data_as_of`
- `file_hash`
- row, valid, warning, and excluded counts

`property_id + file_hash` is unique.

### `reservation_snapshots`

- `snapshot_id`
- `property_id`
- `reservation_id`
- check-in, check-out, and booked date
- source, original status, normalized status, and country
- money fields stored as cents
- total room quantity

Primary key: `snapshot_id + reservation_id`.

### `reservation_room_snapshots`

- `snapshot_id`
- `property_id`
- `reservation_id`
- `room_type_id`
- `room_type_name`
- `quantity`

Primary key: `snapshot_id + reservation_id + room_type_name`.

## Current reservation state

The Dashboard's current reservation set is the complete reservation set from the property's newest snapshot by `data_as_of`. If several snapshots have the same `data_as_of`, the most recently imported one is used as the tie-breaker.

Older historical files may be imported later without replacing the current Dashboard because `imported_at` does not determine which booking position is current.

A reservation that existed in an older snapshot but is absent from the newest snapshot is not carried forward into current metrics. Historical copies remain preserved in their original snapshots for pickup, pace, cancellation, and audit analysis.

## Deferred inventory model

The first milestone uses each room type's configured inventory across the selected dates. A later `inventory_exceptions` table will override availability for closures and out-of-order rooms.
