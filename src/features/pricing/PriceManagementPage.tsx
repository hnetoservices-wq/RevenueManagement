import { useEffect, useMemo, useState } from "react";
import type { Property } from "../../domain/models";
import { averageConfiguredBasePrice, buildRoomBasePriceRows, configuredBasePriceRange } from "./pricing";
import { priceManagementStore } from "./store";
import type { PriceManagementConfig } from "./types";
import "./pricing.css";

function euro(cents: number | null, currency: string) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function toInputValue(cents: number) {
  return cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

function toCents(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

export function PriceManagementPage({ property }: { property: Property }) {
  const roomTypes = property.roomTypes.filter((room) => room.inventoryCount > 0);
  const [config, setConfig] = useState<PriceManagementConfig>({ propertyId: property.id, referenceRoomTypeId: roomTypes[0]?.id ?? null, basePricesCents: {}, updatedAt: "" });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);
    void priceManagementStore.get(property.id).then((saved) => {
      if (cancelled) return;
      const validReference = saved?.referenceRoomTypeId && roomTypes.some((room) => room.id === saved.referenceRoomTypeId)
        ? saved.referenceRoomTypeId
        : roomTypes[0]?.id ?? null;
      const next: PriceManagementConfig = saved
        ? { ...saved, referenceRoomTypeId: validReference }
        : { propertyId: property.id, referenceRoomTypeId: validReference, basePricesCents: {}, updatedAt: "" };
      setConfig(next);
      setInputs(Object.fromEntries(roomTypes.map((room) => [room.id, toInputValue(next.basePricesCents[room.id] ?? 0)])));
      setDirty(false);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [property.id]);

  const draftConfig = useMemo<PriceManagementConfig>(() => ({
    ...config,
    propertyId: property.id,
    basePricesCents: Object.fromEntries(roomTypes.map((room) => [room.id, toCents(inputs[room.id] ?? "")])),
  }), [config, inputs, property.id, roomTypes]);

  const rows = useMemo(() => buildRoomBasePriceRows(roomTypes, draftConfig), [roomTypes, draftConfig]);
  const average = useMemo(() => averageConfiguredBasePrice(roomTypes, draftConfig.basePricesCents), [roomTypes, draftConfig.basePricesCents]);
  const range = useMemo(() => configuredBasePriceRange(roomTypes, draftConfig.basePricesCents), [roomTypes, draftConfig.basePricesCents]);
  const configuredCount = rows.filter((row) => row.basePriceCents > 0).length;
  const referenceRoom = roomTypes.find((room) => room.id === draftConfig.referenceRoomTypeId);
  const referencePrice = referenceRoom ? draftConfig.basePricesCents[referenceRoom.id] ?? 0 : 0;

  function updatePrice(roomTypeId: string, value: string) {
    setInputs((current) => ({ ...current, [roomTypeId]: value }));
    setDirty(true);
    setMessage(null);
  }

  function updateReference(roomTypeId: string) {
    setConfig((current) => ({ ...current, referenceRoomTypeId: roomTypeId || null }));
    setDirty(true);
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = { ...draftConfig, updatedAt: new Date().toISOString() };
      await priceManagementStore.save(next);
      setConfig(next);
      setDirty(false);
      setMessage("Preços base guardados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="pricing-loading">A carregar configuração de preços…</div>;

  return <>
    <div className="page-heading pricing-heading">
      <div>
        <p className="eyebrow">Gestão de preços</p>
        <h1>Price Manager</h1>
        <p>Defina a estrutura base de preços da propriedade. Estes valores serão a fundação para períodos, canais e promoções.</p>
      </div>
      <button className="primary-button" disabled={!dirty || saving || !roomTypes.length} onClick={() => void save()}>{saving ? "A guardar…" : "Guardar preços base"}</button>
    </div>

    {error && <div className="alert"><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}
    {message && <div className="pricing-success">{message}</div>}

    <section className="pricing-kpis">
      <article className="kpi-card"><div className="kpi-label">Quartos configurados</div><strong>{configuredCount}/{roomTypes.length}</strong><span className="neutral">Tipos de quarto com preço base</span></article>
      <article className="kpi-card"><div className="kpi-label">Quarto de referência</div><strong className="pricing-kpi-name">{referenceRoom?.canonicalName ?? "—"}</strong><span className="neutral">Coeficiente 1,000</span></article>
      <article className="kpi-card"><div className="kpi-label">Preço base de referência</div><strong>{referencePrice > 0 ? euro(referencePrice, property.currency) : "—"}</strong><span className="neutral">Âncora da estrutura de preços</span></article>
      <article className="kpi-card"><div className="kpi-label">Média dos preços base</div><strong>{euro(average, property.currency)}</strong><span className="neutral">Média entre tipos configurados</span></article>
      <article className="kpi-card"><div className="kpi-label">Amplitude base</div><strong>{range ? `${euro(range.minCents, property.currency)} – ${euro(range.maxCents, property.currency)}` : "—"}</strong><span className="neutral">Preço mínimo e máximo</span></article>
    </section>

    <div className="pricing-layout">
      <article className="panel pricing-reference-panel">
        <div className="panel-heading"><div><h2>Quarto de referência</h2><p>Todos os coeficientes são calculados em relação a este quarto.</p></div></div>
        <label className="pricing-reference-select">Quarto<select value={draftConfig.referenceRoomTypeId ?? ""} onChange={(event) => updateReference(event.target.value)}>{roomTypes.map((room) => <option key={room.id} value={room.id}>{room.canonicalName}</option>)}</select></label>
        <div className="pricing-logic-note"><strong>Lógica de Sheet1</strong><span>Coeficiente do quarto = preço base do quarto ÷ preço base do quarto de referência.</span><span>Quando alterarmos o preço alvo da referência, os restantes quartos poderão acompanhar esta proporção automaticamente.</span></div>
      </article>

      <article className="panel pricing-base-panel">
        <div className="panel-heading"><div><h2>Preços base por quarto</h2><p>Defina o preço estrutural de cada tipo de quarto.</p></div><span className="pricing-unsaved">{dirty ? "Alterações por guardar" : config.updatedAt ? "Guardado" : "Ainda não configurado"}</span></div>
        {roomTypes.length ? <div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Tipo de quarto</th><th>Inventário</th><th>Preço base</th><th>Diferença</th><th>Coeficiente</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.roomTypeId} className={row.isReference ? "pricing-reference-row" : ""}>
            <td><strong>{row.roomName}</strong>{row.isReference && <span className="pricing-reference-badge">Referência</span>}</td>
            <td>{row.inventoryCount}</td>
            <td><div className="pricing-price-input"><span>€</span><input inputMode="decimal" placeholder="0,00" value={inputs[row.roomTypeId] ?? ""} onChange={(event) => updatePrice(row.roomTypeId, event.target.value)} /></div></td>
            <td>{row.differenceFromReferenceCents === null ? "—" : row.differenceFromReferenceCents === 0 ? "—" : `${row.differenceFromReferenceCents > 0 ? "+" : "−"}${euro(Math.abs(row.differenceFromReferenceCents), property.currency)}`}</td>
            <td><strong>{row.coefficient === null ? "—" : row.coefficient.toLocaleString("pt-PT", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</strong></td>
          </tr>)}
        </tbody></table></div> : <p className="cost-empty">A propriedade não tem tipos de quarto configurados.</p>}
      </article>
    </div>
  </>;
}
