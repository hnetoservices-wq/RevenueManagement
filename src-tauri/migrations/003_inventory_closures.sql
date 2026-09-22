PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inventory_closures (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_type_id TEXT NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_inventory_closures_property_dates
ON inventory_closures(property_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_inventory_closures_room_dates
ON inventory_closures(room_type_id, start_date, end_date);
