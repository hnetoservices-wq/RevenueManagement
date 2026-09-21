# Architecture

## Goals

The application is local-first, private, testable, and expandable without tying the analytics layer to Tauri or React.

## Layers

1. **Import adapter** reads an Amenitiz file and produces source rows.
2. **Normalization and validation** converts source rows into typed, privacy-safe reservations and room allocations.
3. **Repository** persists properties and immutable snapshots. Tauri uses SQLite; browser preview uses local storage.
4. **Analytics** transforms normalized reservations into room nights and KPIs. It contains no UI or database code.
5. **React UI** coordinates imports, filters, comparisons, and presentation.

Dependencies point inward: UI and repositories may depend on the domain layer; the domain layer never depends on the UI or persistence implementation.

## Important decisions

### Integer cents

Every monetary value is normalized to integer cents. This avoids binary floating-point errors in stored revenue. Formatting to euros happens only in the UI.

### Immutable snapshots

An import creates one `import_snapshots` row and versioned reservation rows linked to it. Existing snapshots are never updated. The current state of a reservation is the row belonging to its newest snapshot.

### Privacy boundary

The adapter sees the full workbook row, but normalization retains only the reservation ID, dates, source, status, country, rooms, and financial fields. Guest identity and contact fields never cross into the normalized model or database.

### Room-night calculation

Room nights are generated conceptually by iterating from check-in up to, but not including, check-out and multiplying by booked room quantity. They are calculated on demand instead of materialized in the first milestone.

### Multi-room revenue

The export contains reservation-level revenue, not an exact price for each room. Property-level metrics remain exact for the reservation total. Room-type revenue is not presented as exact until an explicit allocation method is implemented.

### Portable frontend

The `Repository` interface isolates SQLite. Browser preview mode exercises the same importer and analytics with local storage, keeping a future web build possible.

## Import transaction

1. Read the selected file locally.
2. Calculate SHA-256.
3. Detect the header row and parse the first sheet.
4. Normalize every source row.
5. Classify issues as warnings or errors.
6. Let the user review and edit the data-as-of date.
7. Reject duplicate file hashes for the same property.
8. Save the snapshot, reservations, and reservation-room rows in one SQLite transaction.

## Security

- No network calls, telemetry, or authentication.
- File access is initiated through the operating-system picker.
- SQLite is stored in the Tauri application data directory.
- Tauri capabilities grant only dialog, selected-file read, and required SQL operations.
