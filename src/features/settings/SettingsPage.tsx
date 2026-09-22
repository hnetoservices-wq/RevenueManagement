import { useEffect, useMemo, useState } from "react";
import type { Property } from "../../domain/models";
import {
  blankPropertyDraft,
  configuredRoomCount,
  draftToProperty,
  propertyToDraft,
  validatePropertyDraft,
  type PropertyDraft,
} from "./propertySetup";
import "./settings.css";

interface Props {
  property: Property;
  importCount: number;
  onSave: (property: Property) => Promise<void>;
}

function makePropertyId() {
  return `property-${crypto.randomUUID()}`;
}

function makeRoomId(propertyId: string) {
  return `${propertyId}-room-${crypto.randomUUID()}`;
}

export function SettingsPage({ property, importCount, onSave }: Props) {
  const [draft, setDraft] = useState<PropertyDraft>(() => propertyToDraft(property));
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    setDraft(propertyToDraft(property));
    setSaveError(null);
  }, [property, isNew]);

  const issues = useMemo(() => validatePropertyDraft(draft), [draft]);
  const configured = configuredRoomCount(draft);
  const balanced = configured === draft.totalRooms;

  function startNew() {
    const propertyId = makePropertyId();
    setDraft(blankPropertyDraft(propertyId, makeRoomId(propertyId)));
    setIsNew(true);
    setSaveError(null);
  }

  function cancelNew() {
    setDraft(propertyToDraft(property));
    setIsNew(false);
    setSaveError(null);
  }

  function updateRoom(index: number, patch: Partial<PropertyDraft["rooms"][number]>) {
    setDraft((current) => ({
      ...current,
      rooms: current.rooms.map((room, roomIndex) => roomIndex === index ? { ...room, ...patch } : room),
    }));
  }

  function addRoomType() {
    setDraft((current) => ({
      ...current,
      rooms: [...current.rooms, { id: makeRoomId(current.id), name: "", quantity: 1 }],
    }));
  }

  function removeRoomType(index: number) {
    setDraft((current) => ({ ...current, rooms: current.rooms.filter((_, roomIndex) => roomIndex !== index) }));
  }

  async function save() {
    if (issues.length) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draftToProperty(draft));
      setIsNew(false);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="page-heading settings-heading">
      <div>
        <p className="eyebrow">Property setup</p>
        <h1>{isNew ? "Add property" : "Settings"}</h1>
        <p>Configure the property and the exact room names used by Amenitiz before importing reservation reports.</p>
      </div>
      <div className="settings-heading-actions">
        {isNew ? <button className="secondary-button" onClick={cancelNew}>Cancel</button> : <button className="secondary-button" onClick={startNew}>+ Add property</button>}
        <button className="primary-button" onClick={() => void save()} disabled={saving || issues.length > 0}>{saving ? "Saving…" : isNew ? "Create property" : "Save changes"}</button>
      </div>
    </div>

    {saveError && <div className="alert"><span>{saveError}</span></div>}

    {importCount > 0 && !isNew && <div className="settings-history-warning"><strong>This property already has historical imports.</strong><span>Changing room names after imports can affect room-type historical analysis. If the Amenitiz room names have not changed, keep the existing names exactly as they are.</span></div>}

    <section className="settings-grid">
      <article className="panel settings-general-panel">
        <div className="panel-heading"><div><h2>General property information</h2><p>Used throughout all dashboards and imports.</p></div></div>
        <div className="settings-form-grid">
          <label className="settings-field wide"><span>Property name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Fonte Santa" /></label>
          <label className="settings-field"><span>Currency</span><input value={draft.currency} onChange={(event) => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} maxLength={3} placeholder="EUR" /></label>
          <label className="settings-field"><span>Timezone</span><input value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} placeholder="Europe/Lisbon" /></label>
          <label className="settings-field"><span>Number of rooms</span><input type="number" min={1} step={1} value={draft.totalRooms} onChange={(event) => setDraft({ ...draft, totalRooms: Number(event.target.value) })} /></label>
          <div className="settings-source"><span>Import source</span><strong>Amenitiz reservation report</strong><small>More import adapters can be added later without changing this property setup.</small></div>
        </div>
      </article>

      <article className="panel settings-match-panel">
        <div className="panel-heading"><div><h2>CSV room matching</h2><p>The names below must match the room names in Amenitiz exactly.</p></div></div>
        <div className={`room-balance ${balanced ? "balanced" : "unbalanced"}`}>
          <div><span>Configured inventory</span><strong>{configured} / {draft.totalRooms}</strong></div>
          <p>{balanced ? "Room quantities match the declared property inventory." : `Adjust the room quantities so they total ${draft.totalRooms}.`}</p>
        </div>
        <div className="settings-help">
          <strong>Example</strong>
          <span>Casa da Estufa — 2</span>
          <span>Suite Conselheiro — 1</span>
          <span>Quarto Junior — 2</span>
        </div>
      </article>
    </section>

    <article className="panel settings-rooms-panel">
      <div className="panel-heading settings-rooms-heading"><div><h2>Room types</h2><p>Use one row per room type. Quantity is the number of sellable rooms of that exact type.</p></div><button className="secondary-button" onClick={addRoomType}>+ Add room type</button></div>
      <div className="settings-room-list">
        <div className="settings-room-list-head"><span>Room name in Amenitiz</span><span>Quantity</span><span /></div>
        {draft.rooms.map((room, index) => <div className="settings-room-row" key={room.id}>
          <input value={room.name} onChange={(event) => updateRoom(index, { name: event.target.value })} placeholder={`Room type ${index + 1}`} />
          <input type="number" min={1} step={1} value={room.quantity} onChange={(event) => updateRoom(index, { quantity: Number(event.target.value) })} />
          <button className="settings-remove-room" onClick={() => removeRoomType(index)} disabled={draft.rooms.length === 1} aria-label={`Remove ${room.name || `room type ${index + 1}`}`}>×</button>
        </div>)}
      </div>
    </article>

    {issues.length > 0 && <article className="settings-validation"><strong>Setup needs attention</strong><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></article>}
  </>;
}
