import type { Property, Reservation } from "../../domain/models";
import {
  ALL_CHANNELS,
  ALL_ROOM_TYPES,
  DEFAULT_ANALYSIS_FILTERS,
  analysisChannels,
  analysisRoomTypes,
  hasActiveAnalysisFilters,
  type AnalysisFilters,
} from "./analysisFilters";
import "./analysisFilters.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  filters: AnalysisFilters;
  setFilters: (filters: AnalysisFilters) => void;
  roomTypeRevenueEstimated: boolean;
  estimatedReservationCount: number;
}

export function AnalysisFilterBar({
  property,
  reservations,
  filters,
  setFilters,
  roomTypeRevenueEstimated,
  estimatedReservationCount,
}: Props) {
  const channels = analysisChannels(reservations);
  const roomTypes = analysisRoomTypes(property);
  const active = hasActiveAnalysisFilters(filters);

  return <div className="analysis-filter-bar">
    <div className="analysis-filter-title">
      <span>Analysis filters</span>
      <small>Shared across analytical pages</small>
    </div>
    <label>Channel<select value={filters.channel} onChange={(event) => setFilters({ ...filters, channel: event.target.value })}><option value={ALL_CHANNELS}>All channels</option>{channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></label>
    <label>Room type<select value={filters.roomType} onChange={(event) => setFilters({ ...filters, roomType: event.target.value })}><option value={ALL_ROOM_TYPES}>All room types</option>{roomTypes.map((roomType) => <option key={roomType} value={roomType}>{roomType}</option>)}</select></label>
    <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as AnalysisFilters["status"] })}><option value="all">All statuses</option><option value="active">Active only</option><option value="cancelled">Cancelled only</option></select></label>
    {active && <button className="analysis-filter-reset" onClick={() => setFilters(DEFAULT_ANALYSIS_FILTERS)}>Reset</button>}
    {roomTypeRevenueEstimated && <div className="analysis-estimate-note"><strong>Estimated room-type revenue</strong><span>{estimatedReservationCount} mixed multi-room reservation{estimatedReservationCount === 1 ? "" : "s"} require proportional revenue allocation. Room-night and occupancy counts remain exact.</span></div>}
  </div>;
}
