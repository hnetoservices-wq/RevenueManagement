PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  timezone TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_types (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  inventory_count INTEGER NOT NULL CHECK (inventory_count >= 0),
  active_from TEXT,
  active_to TEXT,
  UNIQUE(property_id, canonical_name)
);

CREATE TABLE IF NOT EXISTS status_mappings (
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_status TEXT NOT NULL,
  normalized_status TEXT NOT NULL CHECK (normalized_status IN ('active', 'cancelled', 'ignored')),
  PRIMARY KEY(property_id, source, source_status)
);

CREATE TABLE IF NOT EXISTS import_snapshots (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  source TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  data_as_of TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  valid_row_count INTEGER NOT NULL,
  warning_count INTEGER NOT NULL,
  excluded_row_count INTEGER NOT NULL,
  UNIQUE(property_id, file_hash)
);

CREATE TABLE IF NOT EXISTS reservation_snapshots (
  snapshot_id TEXT NOT NULL REFERENCES import_snapshots(id) ON DELETE RESTRICT,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  reservation_id TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT NOT NULL,
  booked_at TEXT,
  source TEXT NOT NULL,
  source_status TEXT NOT NULL,
  normalized_status TEXT NOT NULL CHECK (normalized_status IN ('active', 'cancelled', 'ignored')),
  country TEXT,
  room_quantity INTEGER NOT NULL CHECK (room_quantity > 0),
  tourist_tax_cents INTEGER NOT NULL,
  extra_revenue_excl_cents INTEGER NOT NULL,
  extra_revenue_incl_cents INTEGER NOT NULL,
  room_revenue_excl_cents INTEGER NOT NULL,
  room_revenue_incl_cents INTEGER NOT NULL,
  total_booking_value_cents INTEGER NOT NULL,
  amount_due_cents INTEGER NOT NULL,
  PRIMARY KEY(snapshot_id, reservation_id)
);

CREATE INDEX IF NOT EXISTS idx_reservation_property_dates
ON reservation_snapshots(property_id, check_in, check_out);

CREATE INDEX IF NOT EXISTS idx_reservation_property_id
ON reservation_snapshots(property_id, reservation_id);

CREATE TABLE IF NOT EXISTS reservation_room_snapshots (
  snapshot_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  room_type_id TEXT NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  room_type_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY(snapshot_id, reservation_id, room_type_name),
  FOREIGN KEY(snapshot_id, reservation_id) REFERENCES reservation_snapshots(snapshot_id, reservation_id) ON DELETE RESTRICT
);

CREATE VIEW IF NOT EXISTS current_reservations AS
SELECT ranked.* FROM (
  SELECT rs.*,
         ROW_NUMBER() OVER (
           PARTITION BY rs.property_id, rs.reservation_id
           ORDER BY i.imported_at DESC, i.rowid DESC
         ) AS version_rank
  FROM reservation_snapshots rs
  JOIN import_snapshots i ON i.id = rs.snapshot_id
) ranked
WHERE ranked.version_rank = 1;

INSERT OR IGNORE INTO properties (id, name, currency, timezone)
VALUES ('malmerendas', 'Malmerendas Boutique Lodging', 'EUR', 'Europe/Lisbon');

INSERT OR IGNORE INTO room_types (id, property_id, canonical_name, inventory_count) VALUES
('malmerendas-room-1', 'malmerendas', 'Superior King Studio', 1),
('malmerendas-room-2', 'malmerendas', 'Deluxe Suite', 1),
('malmerendas-room-3', 'malmerendas', 'Junior Suite', 1),
('malmerendas-room-4', 'malmerendas', 'Attic Loft', 1),
('malmerendas-room-5', 'malmerendas', 'Terrace Loft', 1),
('malmerendas-room-6', 'malmerendas', 'Garden Studio', 1);

INSERT OR IGNORE INTO status_mappings (property_id, source, source_status, normalized_status) VALUES
('malmerendas', 'Amenitiz', 'confirmed', 'active'),
('malmerendas', 'Amenitiz', 'modified', 'active'),
('malmerendas', 'Amenitiz', 'cancelled', 'cancelled');
