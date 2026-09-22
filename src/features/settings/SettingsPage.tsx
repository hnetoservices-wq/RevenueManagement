import { useEffect, useMemo, useState } from "react";
import { validateInventoryClosure } from "../../domain/inventory";
import type { InventoryClosure, IsoDate, Property } from "../../domain/models";
import {
  getInterfaceZoom,
  getThemePreference,
  resetInterfaceZoom,
  setInterfaceZoom,
  setThemePreference,
  ZOOM_STEP,
  type ThemePreference,
} from "../../ui/preferences";
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
  onSaveClosure: (closure: InventoryClosure) => Promise<void>;
  onDeleteClosure: (closureId: string) => Promise<void>;
}

function makePropertyId() {
  return `property-${crypto.randomUUID()}`;
}

function makeRoomId(propertyId: string) {
  return `${propertyId}-room-${crypto.randomUUID()}`;
}

function today(): IsoDate {
  return new Date().toISOString().slice(0, 10) as IsoDate;
}

function blankClosure(property: Property): InventoryClosure {
  const roomType = property.roomTypes.find((room) => room.inventoryCount > 0 && room.activeTo === null) ?? property.roomTypes[0];
  const date = today();
  return {
    id: crypto.randomUUID(),
    propertyId: property.id,
    roomTypeId: roomType?.id ?? "",
    startDate: date,
    endDate: date,
    quantity: 1,
    reason: "",
  };
}

function formatDate(value: IsoDate) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-PT").format(new Date(year, month - 1, day));
}

function closureRoomNights(closure: InventoryClosure) {
  const start = new Date(`${closure.startDate}T00:00:00`);
  const end = new Date(`${closure.endDate}T00:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(0, days) * closure.quantity;
}

export function SettingsPage({ property, importCount, onSave, onSaveClosure, onDeleteClosure }: Props) {
  const [draft, setDraft] = useState<PropertyDraft>(() => propertyToDraft(property));
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());
  const [interfaceZoom, setZoom] = useState(() => getInterfaceZoom());
  const [closureDraft, setClosureDraft] = useState<InventoryClosure>(() => blankClosure(property));
  const [editingClosure, setEditingClosure] = useState(false);
  const [savingClosure, setSavingClosure] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    setDraft(propertyToDraft(property));
    setSaveError(null);
  }, [property, isNew]);

  useEffect(() => {
    if (editingClosure) return;
    setClosureDraft(blankClosure(property));
    setClosureError(null);
  }, [property, editingClosure]);

  useEffect(() => {
    const syncPreferences = () => {
      setTheme(getThemePreference());
      setZoom(getInterfaceZoom());
    };
    window.addEventListener("revenue-manager:preferences", syncPreferences);
    return () => window.removeEventListener("revenue-manager:preferences", syncPreferences);
  }, []);

  const issues = useMemo(() => validatePropertyDraft(draft), [draft]);
  const configured = configuredRoomCount(draft);
  const balanced = configured === draft.totalRooms;
  const activeRoomTypes = useMemo(
    () => property.roomTypes.filter((room) => room.inventoryCount > 0 && room.activeTo === null),
    [property.roomTypes],
  );
  const closures = property.inventoryClosures ?? [];
  const closureIssues = useMemo(
    () => validateInventoryClosure(property, closureDraft, closures),
    [property, closureDraft, closures],
  );
  const unavailableRoomNights = useMemo(
    () => closures.reduce((sum, closure) => sum + closureRoomNights(closure), 0),
    [closures],
  );

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

  function editClosure(closure: InventoryClosure) {
    setClosureDraft({ ...closure });
    setEditingClosure(true);
    setClosureError(null);
  }

  function duplicateClosure(closure: InventoryClosure) {
    setClosureDraft({ ...closure, id: crypto.randomUUID() });
    setEditingClosure(false);
    setClosureError(null);
    window.setTimeout(() => {
      document.querySelector(".settings-closure-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function resetClosure() {
    setClosureDraft(blankClosure(property));
    setEditingClosure(false);
    setClosureError(null);
  }

  async function saveClosure() {
    if (closureIssues.length) return;
    setSavingClosure(true);
    setClosureError(null);
    try {
      await onSaveClosure({ ...closureDraft, reason: closureDraft.reason.trim() });
      resetClosure();
    } catch (cause) {
      setClosureError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingClosure(false);
    }
  }

  async function deleteClosure(closure: InventoryClosure) {
    const room = property.roomTypes.find((item) => item.id === closure.roomTypeId)?.canonicalName ?? "quarto";
    if (!window.confirm(`Remover a indisponibilidade de ${room} entre ${formatDate(closure.startDate)} e ${formatDate(closure.endDate)}?`)) return;
    setClosureError(null);
    try {
      await onDeleteClosure(closure.id);
      if (closureDraft.id === closure.id) resetClosure();
    } catch (cause) {
      setClosureError(cause instanceof Error ? cause.message : String(cause));
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

    <article className="panel settings-appearance-panel">
      <div className="panel-heading"><div><h2>Aparência e legibilidade</h2><p>Estas preferências aplicam-se a toda a aplicação e ficam guardadas neste computador.</p></div></div>
      <div className="settings-preferences-grid">
        <label className="settings-preference-field">
          <span>Tema</span>
          <select value={theme} onChange={(event) => { const next = event.target.value as ThemePreference; setTheme(next); setThemePreference(next); }}>
            <option value="system">Seguir o sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
        </label>
        <div className="settings-preference-field">
          <span>Tamanho da interface</span>
          <div className="settings-zoom-controls">
            <button type="button" aria-label="Diminuir tamanho" onClick={() => setZoom(setInterfaceZoom(interfaceZoom - ZOOM_STEP))}>−</button>
            <output>{Math.round(interfaceZoom * 100)}%</output>
            <button type="button" aria-label="Aumentar tamanho" onClick={() => setZoom(setInterfaceZoom(interfaceZoom + ZOOM_STEP))}>+</button>
            <button type="button" onClick={() => setZoom(resetInterfaceZoom())}>Repor</button>
          </div>
          <small className="settings-zoom-help">Também pode usar Ctrl + roda do rato, Ctrl + +, Ctrl + − e Ctrl + 0. Intervalo disponível: 85% a 160%.</small>
        </div>
      </div>
    </article>

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

    {!isNew && <article className="panel settings-closures-panel">
      <div className="panel-heading settings-closures-heading">
        <div><p className="eyebrow">Inventário vendável</p><h2>Indisponibilidades de quartos</h2><p>Retire quartos do inventário disponível em períodos de manutenção, bloqueios operacionais ou outras indisponibilidades.</p></div>
        <div className="settings-closure-summary"><strong>{unavailableRoomNights}</strong><span>noites-quarto indisponíveis registadas</span></div>
      </div>

      <div className="settings-closure-form">
        <label className="settings-field"><span>Tipo de quarto</span><select value={closureDraft.roomTypeId} onChange={(event) => setClosureDraft({ ...closureDraft, roomTypeId: event.target.value })}>{activeRoomTypes.map((room) => <option key={room.id} value={room.id}>{room.canonicalName}</option>)}</select></label>
        <label className="settings-field"><span>Quantidade indisponível</span><input type="number" min={1} step={1} value={closureDraft.quantity} onChange={(event) => setClosureDraft({ ...closureDraft, quantity: Number(event.target.value) })} /></label>
        <label className="settings-field"><span>De</span><input type="date" value={closureDraft.startDate} onChange={(event) => setClosureDraft({ ...closureDraft, startDate: event.target.value as IsoDate })} /></label>
        <label className="settings-field"><span>Até, inclusive</span><input type="date" value={closureDraft.endDate} onChange={(event) => setClosureDraft({ ...closureDraft, endDate: event.target.value as IsoDate })} /></label>
        <label className="settings-field settings-closure-reason"><span>Motivo</span><input value={closureDraft.reason} onChange={(event) => setClosureDraft({ ...closureDraft, reason: event.target.value })} placeholder="Manutenção, bloqueio operacional…" /></label>
        <div className="settings-closure-actions">
          {editingClosure && <button className="secondary-button" onClick={resetClosure}>Cancelar edição</button>}
          <button className="primary-button" disabled={savingClosure || closureIssues.length > 0 || activeRoomTypes.length === 0} onClick={() => void saveClosure()}>{savingClosure ? "A guardar…" : editingClosure ? "Guardar alteração" : "Adicionar indisponibilidade"}</button>
        </div>
      </div>

      {closureError && <div className="settings-closure-error">{closureError}</div>}
      {closureIssues.length > 0 && <div className="settings-closure-validation">{closureIssues[0]}</div>}

      <div className="settings-closure-list">
        {closures.length === 0 ? <div className="settings-closure-empty">Não existem indisponibilidades registadas. Todo o inventário configurado é considerado vendável.</div> : <table>
          <thead><tr><th>Tipo de quarto</th><th>Quantidade</th><th>Período</th><th>Noites-quarto</th><th>Motivo</th><th /></tr></thead>
          <tbody>{[...closures].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((closure) => {
            const room = property.roomTypes.find((item) => item.id === closure.roomTypeId);
            return <tr key={closure.id}>
              <td><strong>{room?.canonicalName ?? "Tipo de quarto removido"}</strong></td>
              <td>{closure.quantity}</td>
              <td>{formatDate(closure.startDate)} → {formatDate(closure.endDate)}</td>
              <td>{closureRoomNights(closure)}</td>
              <td>{closure.reason || "—"}</td>
              <td><div className="settings-closure-row-actions"><button className="secondary-button" onClick={() => editClosure(closure)}>Editar</button><button className="secondary-button" onClick={() => duplicateClosure(closure)}>Duplicar</button><button className="settings-delete-closure" onClick={() => void deleteClosure(closure)}>Remover</button></div></td>
            </tr>;
          })}</tbody>
        </table>}
      </div>
      <p className="settings-closure-note">Estas datas representam noites de inventário indisponível e são inclusivas. A ocupação e a receita por quarto disponível passam a usar apenas o inventário efetivamente vendável.</p>
    </article>}

    {issues.length > 0 && <article className="settings-validation"><strong>Setup needs attention</strong><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></article>}
  </>;
}
