import { useEffect, useMemo, useState } from "react";
import { calculatePickupDecomposition } from "../../domain/analytics";
import type {
  DashboardFilters,
  ImportSnapshotSummary,
  PickupChangeType,
  PickupDecompositionResult,
  Property,
  Reservation,
} from "../../domain/models";

interface Props {
  imports: ImportSnapshotSummary[];
  property: Property;
  filters: DashboardFilters;
  loadSnapshotReservations: (snapshotId: string) => Promise<Reservation[]>;
}

const CHANGE_LABELS: Record<PickupChangeType, string> = {
  new: "New bookings",
  cancelled: "Cancellations",
  modified: "Modifications",
  removed: "Removed from report",
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function signedMoney(cents: number, currency: string) {
  const formatted = money(Math.abs(cents), currency);
  return cents > 0 ? `+${formatted}` : cents < 0 ? `−${formatted}` : formatted;
}

function signedNumber(value: number) {
  const formatted = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Math.abs(value));
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}

function tone(value: number) {
  return value === 0 ? "neutral" : value > 0 ? "positive" : "negative";
}

function stayLabel(checkIn: string | null, checkOut: string | null) {
  return checkIn && checkOut ? `${checkIn} → ${checkOut}` : "—";
}

export function PickupDecompositionPanel({ imports, property, filters, loadSnapshotReservations }: Props) {
  const orderedImports = useMemo(
    () => [...imports].sort((a, b) => a.dataAsOf.localeCompare(b.dataAsOf) || a.importedAt.localeCompare(b.importedAt)),
    [imports],
  );
  const [baselineId, setBaselineId] = useState("");
  const [currentId, setCurrentId] = useState("");
  const [result, setResult] = useState<PickupDecompositionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orderedImports.length < 2) return;
    const ids = new Set(orderedImports.map((item) => item.id));
    if (!ids.has(currentId)) setCurrentId(orderedImports[orderedImports.length - 1].id);
    if (!ids.has(baselineId)) setBaselineId(orderedImports[orderedImports.length - 2].id);
  }, [orderedImports, baselineId, currentId]);

  const baselineIndex = orderedImports.findIndex((item) => item.id === baselineId);
  const currentIndex = orderedImports.findIndex((item) => item.id === currentId);
  const validOrder = baselineIndex >= 0 && currentIndex > baselineIndex;
  const baseline = orderedImports[baselineIndex];
  const current = orderedImports[currentIndex];

  useEffect(() => {
    if (!baselineId || !currentId || !validOrder) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      loadSnapshotReservations(baselineId),
      loadSnapshotReservations(currentId),
    ]).then(([baselineReservations, currentReservations]) => {
      if (!cancelled) {
        setResult(calculatePickupDecomposition(property, baselineReservations, currentReservations, filters));
      }
    }).catch((cause) => {
      if (!cancelled) setError(`Could not decompose pickup: ${String(cause)}`);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [baselineId, currentId, validOrder, property, filters, loadSnapshotReservations]);

  if (imports.length < 2) return null;

  return <article className="panel pickup-decomposition-panel">
    <div className="pickup-decomposition-heading">
      <div>
        <p className="eyebrow">What changed</p>
        <h2>Pickup decomposition</h2>
        <p>Explain net pickup by matching reservation IDs between two booking-position snapshots.</p>
      </div>
      <div className="pickup-selectors">
        <label>Earlier snapshot<select value={baselineId} onChange={(event) => setBaselineId(event.target.value)}>{orderedImports.map((item) => <option key={item.id} value={item.id}>{item.dataAsOf}</option>)}</select></label>
        <span>→</span>
        <label>Later snapshot<select value={currentId} onChange={(event) => setCurrentId(event.target.value)}>{orderedImports.map((item) => <option key={item.id} value={item.id}>{item.dataAsOf}</option>)}</select></label>
      </div>
    </div>

    {!validOrder && baselineId && currentId ? <div className="pickup-order-warning">Choose a later snapshot after the earlier snapshot.</div> : error ? <div className="alert"><span>{error}</span></div> : loading ? <div className="pickup-loading">Matching reservations and reconciling pickup…</div> : result ? <>
      <div className="pickup-period-line">{baseline?.dataAsOf} → {current?.dataAsOf} · stay dates {filters.startDate} → {filters.endDate}</div>
      <section className="pickup-category-grid">
        {result.categories.map((category) => <div className={`pickup-category-card pickup-${category.type}`} key={category.type}>
          <span>{CHANGE_LABELS[category.type]}</span>
          <strong>{category.reservations}</strong>
          <small>{signedNumber(category.roomNightsDelta)} room nights · {signedMoney(category.roomRevenueCentsDelta, property.currency)}</small>
        </div>)}
      </section>

      <div className="pickup-reconciliation">
        <span>Net pickup</span>
        <strong className={tone(result.net.roomNightsDelta)}>{signedNumber(result.net.roomNightsDelta)} room nights</strong>
        <strong className={tone(result.net.roomRevenueCentsDelta)}>{signedMoney(result.net.roomRevenueCentsDelta, property.currency)} room revenue</strong>
        <small>Category totals reconcile to the selected snapshot pair.</small>
      </div>

      <div className="pace-table-wrap pickup-entry-table"><table><thead><tr><th>Reservation</th><th>Change</th><th>Stay before</th><th>Stay after</th><th>Changed fields</th><th>RN Δ</th><th>Revenue Δ</th></tr></thead><tbody>{result.entries.length ? result.entries.map((entry) => <tr key={`${entry.reservationId}-${entry.type}`}><td><strong>{entry.reservationId}</strong></td><td><span className={`pickup-change-badge pickup-${entry.type}`}>{CHANGE_LABELS[entry.type]}</span></td><td>{stayLabel(entry.beforeCheckIn, entry.beforeCheckOut)}</td><td>{stayLabel(entry.afterCheckIn, entry.afterCheckOut)}</td><td>{entry.changedFields.join(", ")}</td><td className={tone(entry.roomNightsDelta)}>{signedNumber(entry.roomNightsDelta)}</td><td className={tone(entry.roomRevenueCentsDelta)}>{signedMoney(entry.roomRevenueCentsDelta, property.currency)}</td></tr>) : <tr><td colSpan={7} className="pickup-no-changes">No reservation-level changes affected the selected stay period.</td></tr>}</tbody></table></div>
    </> : null}
  </article>;
}
