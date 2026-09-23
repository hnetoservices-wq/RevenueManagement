import { useEffect, useMemo, useState } from "react";
import type { Property, Reservation } from "../../domain/models";
import { channelCommissionStore } from "./store";
import type { ChannelCommissionRule } from "./types";
import "./channels.css";

interface Props {
  property: Property;
  reservations: Reservation[];
  rules: ChannelCommissionRule[];
  onRulesChanged: () => Promise<void>;
}

function blankRule(propertyId: string, source = ""): ChannelCommissionRule {
  return {
    id: crypto.randomUUID(),
    propertyId,
    name: source,
    aliases: source,
    groupName: source,
    commissionRate: 0,
    validFrom: null,
    validTo: null,
    active: true,
  };
}

export function ChannelCommissionPanel({ property, reservations, rules, onRulesChanged }: Props) {
  const [draft, setDraft] = useState<ChannelCommissionRule>(() => blankRule(property.id));
  const [error, setError] = useState<string | null>(null);
  const sources = useMemo(() => Array.from(new Set(reservations.map((reservation) => reservation.source).filter(Boolean))).sort(), [reservations]);

  useEffect(() => {
    setDraft(blankRule(property.id));
    setError(null);
  }, [property.id]);

  async function save() {
    setError(null);
    try {
      await channelCommissionStore.save({
        ...draft,
        name: draft.name.trim(),
        aliases: draft.aliases.trim(),
        groupName: draft.groupName.trim() || draft.name.trim(),
      });
      setDraft(blankRule(property.id));
      await onRulesChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function remove(id: string) {
    await channelCommissionStore.delete(property.id, id);
    if (draft.id === id) setDraft(blankRule(property.id));
    await onRulesChanged();
  }

  function edit(rule: ChannelCommissionRule) {
    setDraft({ ...rule });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startFromSource(source: string) {
    setDraft(blankRule(property.id, source));
    setError(null);
  }

  return <>
    <div className="page-heading channel-settings-heading">
      <div>
        <p className="eyebrow">Custos de distribuição</p>
        <h1>Canais e comissões</h1>
        <p>Configure a comissão aplicada a cada origem de reserva e agrupe canais equivalentes para análise.</p>
      </div>
    </div>

    <div className="channel-help panel">
      <strong>Como é calculado</strong>
      <span>A comissão incide sobre a receita de quartos selecionada no filtro de receita. A regra é escolhida pela data de criação da reserva; quando essa data não existe, é usado o check-in. Canais sem regra ficam com comissão de 0% e são assinalados como não configurados.</span>
    </div>

    {sources.length > 0 && <section className="panel channel-detected">
      <div className="panel-heading"><div><h2>Origens encontradas nos dados</h2><p>Clique numa origem para criar uma regra rapidamente.</p></div></div>
      <div className="channel-source-chips">{sources.map((source) => <button type="button" key={source} onClick={() => startFromSource(source)}>{source}</button>)}</div>
    </section>}

    <section className="panel channel-rule-form">
      <div className="panel-heading"><div><h2>{rules.some((rule) => rule.id === draft.id) ? "Editar regra" : "Nova regra"}</h2><p>Os aliases aceitam vários nomes separados por vírgula ou ponto e vírgula.</p></div></div>
      {error && <div className="alert"><span>{error}</span></div>}
      <div className="channel-form-grid">
        <label><span>Canal</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ex.: Booking.com" /></label>
        <label><span>Grupo de análise</span><input value={draft.groupName} onChange={(event) => setDraft({ ...draft, groupName: event.target.value })} placeholder="Ex.: Booking.com ou Direto" /></label>
        <label className="channel-alias-field"><span>Aliases / nomes equivalentes</span><input value={draft.aliases} onChange={(event) => setDraft({ ...draft, aliases: event.target.value })} placeholder="Booking.com, Booking" /></label>
        <label><span>Comissão (%)</span><input type="number" min="0" max="100" step="0.01" value={draft.commissionRate} onChange={(event) => setDraft({ ...draft, commissionRate: Number(event.target.value) })} /></label>
        <label><span>Válida desde</span><input type="date" value={draft.validFrom ?? ""} onChange={(event) => setDraft({ ...draft, validFrom: event.target.value || null })} /></label>
        <label><span>Válida até</span><input type="date" value={draft.validTo ?? ""} onChange={(event) => setDraft({ ...draft, validTo: event.target.value || null })} /></label>
        <label className="channel-active-field"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>Regra ativa</span></label>
      </div>
      <div className="channel-form-actions">
        {rules.some((rule) => rule.id === draft.id) && <button className="secondary-button" type="button" onClick={() => setDraft(blankRule(property.id))}>Cancelar edição</button>}
        <button className="primary-button" type="button" onClick={() => void save()}>Guardar regra</button>
      </div>
    </section>

    <section className="panel channel-rules-table">
      <div className="panel-heading"><div><h2>Regras configuradas</h2><p>{rules.length} regra{rules.length === 1 ? "" : "s"}</p></div></div>
      {rules.length ? <div className="revenue-table-wrap"><table><thead><tr><th>Canal</th><th>Grupo</th><th>Comissão</th><th>Período</th><th>Estado</th><th>Ações</th></tr></thead><tbody>{rules.map((rule) => <tr key={rule.id}><td><strong>{rule.name}</strong><small className="channel-rule-aliases">{rule.aliases || "—"}</small></td><td>{rule.groupName || rule.name}</td><td>{rule.commissionRate.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%</td><td>{rule.validFrom || "Sem início"} → {rule.validTo || "Sem fim"}</td><td>{rule.active ? "Ativa" : "Inativa"}</td><td><div className="channel-row-actions"><button type="button" onClick={() => edit(rule)}>Editar</button><button type="button" onClick={() => void remove(rule.id)}>Remover</button></div></td></tr>)}</tbody></table></div> : <div className="table-empty">Ainda não existem regras de comissão.</div>}
    </section>
  </>;
}
