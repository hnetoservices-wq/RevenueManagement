import { useEffect, useMemo, useState } from "react";
import type { IsoDate, Property } from "../../domain/models";
import {
  DEFAULT_OTA_PRICING_SETTINGS,
  averageConfiguredBasePrice,
  buildRoomBasePriceRows,
  calculatePeriodReferenceRates,
  configuredBasePriceRange,
  projectPeriodRoomRateRows,
  validateOtaPricingSettings,
  validatePricePeriod,
} from "./pricing";
import { priceManagementStore } from "./store";
import type { OtaPricingSettings, PriceManagementConfig, PricePeriod } from "./types";
import "./pricing.css";

function euro(cents: number | null, currency: string) {
  if (cents === null || cents <= 0) return "—";
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

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function percentageInput(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function parsePercentage(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PriceManagementPage({ property }: { property: Property }) {
  const roomTypes = property.roomTypes.filter((room) => room.inventoryCount > 0);
  const emptyConfig = (): PriceManagementConfig => ({
    propertyId: property.id,
    referenceRoomTypeId: roomTypes[0]?.id ?? null,
    basePricesCents: {},
    otaSettings: { ...DEFAULT_OTA_PRICING_SETTINGS },
    periods: [],
    updatedAt: "",
  });
  const [config, setConfig] = useState<PriceManagementConfig>(emptyConfig);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [otaInputs, setOtaInputs] = useState<Record<keyof OtaPricingSettings, string>>({
    upliftPct: "20",
    loyaltyDiscountPct: "15",
    basicDealDiscountPct: "20",
    nonRefundableDiscountPct: "10",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [periodPrice, setPeriodPrice] = useState("");
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [matrixPeriodId, setMatrixPeriodId] = useState("");

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
        ? { ...saved, referenceRoomTypeId: validReference, otaSettings: saved.otaSettings ?? { ...DEFAULT_OTA_PRICING_SETTINGS }, periods: saved.periods ?? [] }
        : { ...emptyConfig(), referenceRoomTypeId: validReference };
      setConfig(next);
      setInputs(Object.fromEntries(roomTypes.map((room) => [room.id, toInputValue(next.basePricesCents[room.id] ?? 0)])));
      setOtaInputs({
        upliftPct: percentageInput(next.otaSettings.upliftPct),
        loyaltyDiscountPct: percentageInput(next.otaSettings.loyaltyDiscountPct),
        basicDealDiscountPct: percentageInput(next.otaSettings.basicDealDiscountPct),
        nonRefundableDiscountPct: percentageInput(next.otaSettings.nonRefundableDiscountPct),
      });
      setDirty(false);
      setPeriodStart("");
      setPeriodEnd("");
      setPeriodPrice("");
      setEditingPeriodId(null);
      setPeriodError(null);
      setMatrixPeriodId(next.periods?.[0]?.id ?? "");
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [property.id]);

  const draftOtaSettings = useMemo<OtaPricingSettings>(() => ({
    upliftPct: parsePercentage(otaInputs.upliftPct),
    loyaltyDiscountPct: parsePercentage(otaInputs.loyaltyDiscountPct),
    basicDealDiscountPct: parsePercentage(otaInputs.basicDealDiscountPct),
    nonRefundableDiscountPct: parsePercentage(otaInputs.nonRefundableDiscountPct),
  }), [otaInputs]);

  const draftConfig = useMemo<PriceManagementConfig>(() => ({
    ...config,
    propertyId: property.id,
    basePricesCents: Object.fromEntries(roomTypes.map((room) => [room.id, toCents(inputs[room.id] ?? "")])),
    otaSettings: draftOtaSettings,
    periods: config.periods ?? [],
  }), [config, draftOtaSettings, inputs, property.id, roomTypes]);

  const rows = useMemo(() => buildRoomBasePriceRows(roomTypes, draftConfig), [roomTypes, draftConfig]);
  const average = useMemo(() => averageConfiguredBasePrice(roomTypes, draftConfig.basePricesCents), [roomTypes, draftConfig.basePricesCents]);
  const range = useMemo(() => configuredBasePriceRange(roomTypes, draftConfig.basePricesCents), [roomTypes, draftConfig.basePricesCents]);
  const configuredCount = rows.filter((row) => row.basePriceCents > 0).length;
  const referenceRoom = roomTypes.find((room) => room.id === draftConfig.referenceRoomTypeId);
  const referencePrice = referenceRoom ? draftConfig.basePricesCents[referenceRoom.id] ?? 0 : 0;
  const periods = [...(draftConfig.periods ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const otaSettingsError = validateOtaPricingSettings(draftOtaSettings);
  const matrixPeriod = periods.find((period) => period.id === matrixPeriodId) ?? periods[0] ?? null;
  const matrixRows = matrixPeriod ? projectPeriodRoomRateRows(roomTypes, draftConfig, matrixPeriod) : [];

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

  function updateOtaInput(key: keyof OtaPricingSettings, value: string) {
    setOtaInputs((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage(null);
  }

  function resetPeriodForm() {
    setPeriodStart("");
    setPeriodEnd("");
    setPeriodPrice("");
    setEditingPeriodId(null);
    setPeriodError(null);
  }

  function savePeriodDraft() {
    if (!referenceRoom || referencePrice <= 0) {
      setPeriodError("Defina primeiro o quarto de referência e o respetivo preço base.");
      return;
    }
    const period: PricePeriod = {
      id: editingPeriodId ?? crypto.randomUUID(),
      startDate: periodStart as IsoDate,
      endDate: periodEnd as IsoDate,
      directFlexReferenceCents: toCents(periodPrice),
    };
    const validation = validatePricePeriod(period, draftConfig.periods ?? []);
    if (validation) {
      setPeriodError(validation);
      return;
    }
    setConfig((current) => ({
      ...current,
      periods: [...(current.periods ?? []).filter((item) => item.id !== period.id), period].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    }));
    if (!matrixPeriodId) setMatrixPeriodId(period.id);
    setDirty(true);
    setMessage(null);
    resetPeriodForm();
  }

  function editPeriod(period: PricePeriod) {
    setEditingPeriodId(period.id);
    setPeriodStart(period.startDate);
    setPeriodEnd(period.endDate);
    setPeriodPrice(toInputValue(period.directFlexReferenceCents));
    setPeriodError(null);
  }

  function removePeriod(id: string) {
    const remaining = (draftConfig.periods ?? []).filter((item) => item.id !== id).sort((a, b) => a.startDate.localeCompare(b.startDate));
    setConfig((current) => ({ ...current, periods: remaining }));
    if (editingPeriodId === id) resetPeriodForm();
    if (matrixPeriodId === id) setMatrixPeriodId(remaining[0]?.id ?? "");
    setDirty(true);
    setMessage(null);
  }

  async function save() {
    const otaValidation = validateOtaPricingSettings(draftOtaSettings);
    if (otaValidation) {
      setError(otaValidation);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = { ...draftConfig, updatedAt: new Date().toISOString() };
      await priceManagementStore.save(next);
      setConfig(next);
      setDirty(false);
      setMessage("Configuração de preços guardada.");
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
        <p>Defina a estrutura base, os períodos Direct Flex e a construção do preço público OTA.</p>
      </div>
      <button className="primary-button" disabled={!dirty || saving || !roomTypes.length || Boolean(otaSettingsError)} onClick={() => void save()}>{saving ? "A guardar…" : "Guardar configuração"}</button>
    </div>

    {error && <div className="alert"><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}
    {message && <div className="pricing-success">{message}</div>}

    <section className="pricing-kpis">
      <article className="kpi-card"><div className="kpi-label">Quartos configurados</div><strong>{configuredCount}/{roomTypes.length}</strong><span className="neutral">Tipos de quarto com preço base</span></article>
      <article className="kpi-card"><div className="kpi-label">Quarto de referência</div><strong className="pricing-kpi-name">{referenceRoom?.canonicalName ?? "—"}</strong><span className="neutral">Quarto usado para definir cada período</span></article>
      <article className="kpi-card"><div className="kpi-label">Preço base de referência</div><strong>{referencePrice > 0 ? euro(referencePrice, property.currency) : "—"}</strong><span className="neutral">Base estrutural do quarto de referência</span></article>
      <article className="kpi-card"><div className="kpi-label">Incremento OTA</div><strong>{draftOtaSettings.upliftPct.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</strong><span className="neutral">Margem pretendida antes dos descontos base</span></article>
      <article className="kpi-card"><div className="kpi-label">Períodos definidos</div><strong>{periods.length}</strong><span className="neutral">Intervalos de preço configurados</span></article>
    </section>

    <div className="pricing-layout">
      <article className="panel pricing-reference-panel">
        <div className="panel-heading"><div><h2>Quarto de referência</h2><p>Escolha o quarto cujo preço Direct Flex será introduzido em cada período.</p></div></div>
        <label className="pricing-reference-select">Quarto<select value={draftConfig.referenceRoomTypeId ?? ""} onChange={(event) => updateReference(event.target.value)}>{roomTypes.map((room) => <option key={room.id} value={room.id}>{room.canonicalName}</option>)}</select></label>
        <div className="pricing-logic-note"><strong>Lógica de Sheet1</strong><span>Os preços base definem a estrutura da propriedade.</span><span>Em cada período introduz apenas o Direct Flex do quarto de referência. A relação entre os preços base é aplicada internamente aos restantes quartos.</span></div>
      </article>

      <article className="panel pricing-base-panel">
        <div className="panel-heading"><div><h2>Preços base por quarto</h2><p>Defina o preço estrutural de cada tipo de quarto.</p></div><span className="pricing-unsaved">{dirty ? "Alterações por guardar" : config.updatedAt ? "Guardado" : "Ainda não configurado"}</span></div>
        {roomTypes.length ? <div className="pricing-table-wrap"><table className="pricing-table"><thead><tr><th>Tipo de quarto</th><th>Inventário</th><th>Preço base</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.roomTypeId} className={row.isReference ? "pricing-reference-row" : ""}>
            <td><strong>{row.roomName}</strong>{row.isReference && <span className="pricing-reference-badge">Referência</span>}</td>
            <td>{row.inventoryCount}</td>
            <td><div className="pricing-price-input"><span>€</span><input inputMode="decimal" placeholder="0,00" value={inputs[row.roomTypeId] ?? ""} onChange={(event) => updatePrice(row.roomTypeId, event.target.value)} /></div></td>
          </tr>)}
        </tbody></table></div> : <p className="cost-empty">A propriedade não tem tipos de quarto configurados.</p>}
        {range && <div className="pricing-base-footer">Média: <strong>{euro(average, property.currency)}</strong> · Amplitude: <strong>{euro(range.minCents, property.currency)} – {euro(range.maxCents, property.currency)}</strong></div>}
      </article>
    </div>

    <article className="panel pricing-ota-panel">
      <div className="panel-heading"><div><h2>Construção do preço OTA</h2><p>Parâmetros usados em Sheet1 para transformar o Direct Flex no preço público OTA.</p></div></div>
      <div className="pricing-ota-grid">
        <label>Incremento OTA<span>Aplicado ao Direct Flex antes de absorver descontos.</span><div className="pricing-percent-input"><input inputMode="decimal" value={otaInputs.upliftPct} onChange={(event) => updateOtaInput("upliftPct", event.target.value)} /><b>%</b></div></label>
        <label>Fidelização<span>Desconto absorvido na construção do preço público OTA.</span><div className="pricing-percent-input"><input inputMode="decimal" value={otaInputs.loyaltyDiscountPct} onChange={(event) => updateOtaInput("loyaltyDiscountPct", event.target.value)} /><b>%</b></div></label>
        <label>Basic Deal<span>Segundo desconto absorvido no preço público OTA.</span><div className="pricing-percent-input"><input inputMode="decimal" value={otaInputs.basicDealDiscountPct} onChange={(event) => updateOtaInput("basicDealDiscountPct", event.target.value)} /><b>%</b></div></label>
        <label>Não reembolsável<span>Redução aplicada separadamente às tarifas Flex.</span><div className="pricing-percent-input"><input inputMode="decimal" value={otaInputs.nonRefundableDiscountPct} onChange={(event) => updateOtaInput("nonRefundableDiscountPct", event.target.value)} /><b>%</b></div></label>
      </div>
      {otaSettingsError ? <div className="pricing-period-error pricing-ota-error">{otaSettingsError}</div> : <div className="pricing-formula-note"><strong>Fórmula base</strong><span>OTA Flex público = Direct Flex × (1 + incremento OTA) ÷ [(1 − Fidelização) × (1 − Basic Deal)]</span><small>As restantes campanhas e regras de acumulação serão adicionadas na camada de promoções.</small></div>}
    </article>

    <article className="panel pricing-period-panel">
      <div className="panel-heading"><div><h2>Períodos de preço</h2><p>Defina intervalos de estadia e o preço Direct Flex do quarto de referência.</p></div></div>
      <div className="pricing-period-form">
        <label>De<input type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); setPeriodError(null); }} /></label>
        <label>Até<input type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); setPeriodError(null); }} /></label>
        <label>Direct Flex · {referenceRoom?.canonicalName ?? "Referência"}<div className="pricing-period-price"><span>€</span><input inputMode="decimal" placeholder="0,00" value={periodPrice} onChange={(event) => { setPeriodPrice(event.target.value); setPeriodError(null); }} /></div></label>
        <button type="button" className="primary-button" onClick={savePeriodDraft}>{editingPeriodId ? "Atualizar período" : "+ Adicionar período"}</button>
        {editingPeriodId && <button type="button" className="secondary-button" onClick={resetPeriodForm}>Cancelar</button>}
      </div>
      {periodError && <div className="pricing-period-error">{periodError}</div>}

      {periods.length ? <div className="pricing-period-table-wrap"><table className="pricing-period-table pricing-period-summary"><thead><tr><th>Período</th><th>Direct Flex</th><th>Direct NR</th><th>OTA Flex público</th><th>OTA NR público</th><th>OTA após descontos base</th><th></th></tr></thead><tbody>
        {periods.map((period) => {
          const rates = calculatePeriodReferenceRates(period, draftOtaSettings);
          return <tr key={period.id}>
            <td><strong>{formatDate(period.startDate)}</strong><span> → {formatDate(period.endDate)}</span></td>
            <td><strong>{euro(rates?.directFlexCents ?? null, property.currency)}</strong></td>
            <td>{euro(rates?.directNonRefundableCents ?? null, property.currency)}</td>
            <td><strong>{euro(rates?.otaFlexCents ?? null, property.currency)}</strong></td>
            <td>{euro(rates?.otaNonRefundableCents ?? null, property.currency)}</td>
            <td>{euro(rates?.otaAfterBaseDiscountsCents ?? null, property.currency)}</td>
            <td className="pricing-period-actions"><button type="button" onClick={() => { editPeriod(period); setMatrixPeriodId(period.id); }}>Editar</button><button type="button" onClick={() => removePeriod(period.id)}>Remover</button></td>
          </tr>;
        })}
      </tbody></table></div> : <div className="pricing-period-empty">Ainda não existem períodos de preço. Adicione o primeiro período acima.</div>}
    </article>

    {matrixPeriod && <article className="panel pricing-matrix-panel">
      <div className="pricing-matrix-header"><div><h2>Matriz de preços por quarto</h2><p>Veja os preços calculados para todos os quartos sem expor coeficientes internos.</p></div><label>Período<select value={matrixPeriod.id} onChange={(event) => setMatrixPeriodId(event.target.value)}>{periods.map((period) => <option key={period.id} value={period.id}>{formatDate(period.startDate)} → {formatDate(period.endDate)}</option>)}</select></label></div>
      <div className="pricing-period-table-wrap"><table className="pricing-period-table pricing-room-matrix"><thead><tr><th>Tipo de quarto</th><th>Preço base</th><th>Direct Flex</th><th>Direct NR</th><th>OTA Flex público</th><th>OTA NR público</th><th>OTA após Fidelização + Basic</th></tr></thead><tbody>
        {matrixRows.map((row) => <tr key={row.roomTypeId} className={row.isReference ? "pricing-reference-row" : ""}>
          <td><strong>{row.roomName}</strong>{row.isReference && <span className="pricing-reference-badge">Referência</span>}</td>
          <td>{euro(row.basePriceCents, property.currency)}</td>
          <td><strong>{euro(row.directFlexCents, property.currency)}</strong></td>
          <td>{euro(row.directNonRefundableCents, property.currency)}</td>
          <td><strong>{euro(row.otaFlexCents, property.currency)}</strong></td>
          <td>{euro(row.otaNonRefundableCents, property.currency)}</td>
          <td>{euro(row.otaAfterBaseDiscountsCents, property.currency)}</td>
        </tr>)}
      </tbody></table></div>
      <div className="pricing-matrix-footnote">“OTA após Fidelização + Basic” mostra o resultado apenas dos dois descontos usados para construir o preço público. Ainda não inclui Móveis, campanhas, Limited Time Deal ou Last Minute.</div>
    </article>}
  </>;
}
