DROP VIEW IF EXISTS current_reservations;

CREATE VIEW current_reservations AS
SELECT rs.*
FROM reservation_snapshots rs
JOIN import_snapshots i ON i.id = rs.snapshot_id
WHERE i.id = (
  SELECT latest.id
  FROM import_snapshots latest
  WHERE latest.property_id = rs.property_id
  ORDER BY latest.data_as_of DESC, latest.imported_at DESC, latest.rowid DESC
  LIMIT 1
);
