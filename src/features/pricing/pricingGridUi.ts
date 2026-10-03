import {
  calculateDiscountRateResults,
  calculatePeriodReferenceRates,
  defaultDiscountName,
  DISCOUNT_KIND_LABELS,
  validatePricePeriod,
} from "./pricing";
import { priceManagementStore } from "./store";
import type {
  PriceDiscountEntry,
  PriceDiscountKind,
  PriceManagementConfig,
  PricePeriod,
} from "./types";
import "./pricing-period-list.css";

const DISCOUNT_KINDS = Object.keys(DISCOUNT_KIND_LABELS) as PriceDiscountKind[];

let pricingGridObserver: MutationObserver | null = null;
let scheduled = false;
let persistenceBridgeInstalled = false;
let periodListSignature = "";
let periodListRequest = 0;
let periodCache: PricePeriod[] = [];
let periodBeingKeptOpen: string | null = null;

function isControlCell(cell: Element) {
  return cell.classList.contains("sheet-control-effective")
    || cell.classList.contains("sheet-control-positive")
    || cell.classList.contains("sheet-control-negative")
    || cell.classList.contains("sheet-control-neutral");
}

function reorderPricingGrid(table: HTMLTableElement) {
  const firstHeaderRow = table.tHead?.rows[0];
  const secondHeaderRow = table.tHead?.rows[1];

  if (firstHeaderRow) {
    const controlHead = firstHeaderRow.querySelector<HTMLTableCellElement>(".sheet-control-head");
    if (controlHead && firstHeaderRow.lastElementChild !== controlHead) {
      firstHeaderRow.appendChild(controlHead);
    }
  }

  if (secondHeaderRow) {
    const controlSubheads = Array.from(secondHeaderRow.querySelectorAll<HTMLTableCellElement>(".sheet-control-subhead"));
    controlSubheads.forEach((cell) => secondHeaderRow.appendChild(cell));
  }

  const body = table.tBodies[0];
  if (!body) return;

  Array.from(body.rows).forEach((row) => {
    if (row.classList.contains("sheet-last-minute-divider")) return;
    const controlCells = Array.from(row.children).filter(isControlCell) as HTMLTableCellElement[];
    controlCells.forEach((cell) => row.appendChild(cell));
  });

  const dateCell = body.querySelector<HTMLTableCellElement>(".sheet-dates-cell");
  if (dateCell) {
    const discountRows = Array.from(body.rows).filter((row) => row.querySelector(".sheet-discount-name")).length;
    dateCell.rowSpan = discountRows + 1;
  }
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function money(cents: number | null | undefined) {
  if (cents === null || cents === undefined || cents <= 0) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function compactMoney(cents: number | null | undefined) {
  if (cents === null || cents === undefined || cents <= 0) return "—";
  return `${(cents / 100).toFixed(2)}€`;
}

function inputMoney(cents: number) {
  return cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";
}

function parseMoney(value: string) {
  const parsed = Number(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
}

function percentage(value: number) {
  return `${value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`;
}

function percentageInput(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function parsePercentage(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function coefficient(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signedMoney(cents: number | null) {
  if (cents === null) return "—";
  if (cents === 0) return "0,00 €";
  const amount = new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return `${cents > 0 ? "+" : "−"}${amount}`;
}

function effectiveDiscount(baseCents: number | null | undefined, finalCents: number | null | undefined) {
  if (!baseCents || !finalCents || baseCents <= 0 || finalCents <= 0) return null;
  return Math.max(0, (1 - finalCents / baseCents) * 100);
}

function percentageLabel(value: number | null) {
  if (value === null) return "—";
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function discountLabel(discount: PriceDiscountEntry) {
  const explicit = discount.name?.trim();
  if (explicit) return explicit;
  return DISCOUNT_KIND_LABELS[discount.kind] ?? "Desconto";
}

function normalizedDiscount(discount: PriceDiscountEntry): PriceDiscountEntry {
  return {
    ...discount,
    name: discount.name.trim() || defaultDiscountName(discount.kind),
    active: true,
  };
}

function td(className?: string) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  return cell;
}

function setStatus(container: Element, text: string, tone: "saved" | "error" = "saved") {
  let status = container.querySelector<HTMLElement>(".pricing-period-save-status");
  if (!status) {
    status = document.createElement("span");
    status.className = "pricing-period-save-status";
    container.querySelector(".pricing-period-actions")?.appendChild(status);
  }
  status.dataset.tone = tone;
  status.textContent = text;
}

async function updateStoredPeriod(
  periodId: string,
  updater: (period: PricePeriod) => PricePeriod,
  source: Element,
) {
  const propertyId = document.querySelector<HTMLSelectElement>(".property-control select")?.value;
  if (!propertyId) return;

  try {
    const config = await priceManagementStore.get(propertyId);
    if (!config) return;
    const original = config.periods.find((item) => item.id === periodId);
    if (!original) return;

    const updated = updater({
      ...original,
      discounts: original.discounts.map((item) => ({ ...item })),
    });
    updated.discounts = updated.discounts.map(normalizedDiscount);

    const validation = validatePricePeriod(updated, config.periods);
    if (validation) {
      setStatus(source.closest(".pricing-period-body") ?? source, validation, "error");
      return;
    }

    const next: PriceManagementConfig = {
      ...config,
      periods: config.periods
        .map((item) => item.id === periodId ? updated : item)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
      updatedAt: new Date().toISOString(),
    };
    await priceManagementStore.save(next);
    periodCache = next.periods.map((item) => ({ ...item, discounts: item.discounts.map((discount) => ({ ...discount })) }));
    periodBeingKeptOpen = periodId;
    periodListSignature = "";
    schedulePeriodListRefresh(40);
  } catch (cause) {
    setStatus(
      source.closest(".pricing-period-body") ?? source,
      cause instanceof Error ? cause.message : String(cause),
      "error",
    );
  }
}

function controlValues(period: PricePeriod, discount: PriceDiscountEntry) {
  const rates = calculatePeriodReferenceRates(period);
  if (!rates) return { effective: null, bookingDelta: null, expediaDelta: null };
  const results = calculateDiscountRateResults(period, rates.otaFlexCents, rates.directNonRefundableCents);
  const result = results.find((item) => item.discountId === discount.id);
  if (!result) return { effective: null, bookingDelta: null, expediaDelta: null };

  if (discount.kind === "direct_last_minute") {
    return {
      effective: effectiveDiscount(rates.directNonRefundableCents, result.directCents),
      bookingDelta: null,
      expediaDelta: null,
    };
  }

  const directLastMinute = results.find((item) => item.kind === "direct_last_minute" && item.directCents)?.directCents ?? null;
  const finalOta = result.bookingFlexCents ?? result.expediaFlexCents;
  const comparableDirect = discount.kind === "ota_last_minute" && directLastMinute
    ? directLastMinute
    : rates.directFlexCents;

  return {
    effective: effectiveDiscount(rates.otaFlexCents, finalOta),
    bookingDelta: result.bookingFlexCents ? result.bookingFlexCents - comparableDirect : null,
    expediaDelta: result.expediaFlexCents ? result.expediaFlexCents - comparableDirect : null,
  };
}

function appendControlCells(row: HTMLTableRowElement, period: PricePeriod, discount?: PriceDiscountEntry) {
  const rates = calculatePeriodReferenceRates(period);
  const values = discount
    ? controlValues(period, discount)
    : {
        effective: rates ? 0 : null,
        bookingDelta: rates ? rates.otaFlexCents - rates.directFlexCents : null,
        expediaDelta: rates ? rates.otaFlexCents - rates.directFlexCents : null,
      };

  const effective = td("sheet-control-effective");
  effective.textContent = percentageLabel(values.effective);

  const bookingClass = values.bookingDelta === null
    ? "sheet-control-neutral"
    : values.bookingDelta >= 0 ? "sheet-control-positive" : "sheet-control-negative";
  const booking = td(bookingClass);
  booking.textContent = signedMoney(values.bookingDelta);

  const expediaClass = values.expediaDelta === null
    ? "sheet-control-neutral"
    : values.expediaDelta >= 0 ? "sheet-control-positive" : "sheet-control-negative";
  const expedia = td(expediaClass);
  expedia.textContent = signedMoney(values.expediaDelta);

  row.append(effective, booking, expedia);
}

function appendRateCells(row: HTMLTableRowElement, period: PricePeriod, discount: PriceDiscountEntry) {
  const rates = calculatePeriodReferenceRates(period);
  if (!rates) {
    for (let index = 0; index < 6; index += 1) row.appendChild(td("sheet-rate"));
    return;
  }
  const result = calculateDiscountRateResults(period, rates.otaFlexCents, rates.directNonRefundableCents)
    .find((item) => item.discountId === discount.id);

  if (discount.kind === "direct_last_minute") {
    const direct = td("sheet-rate sheet-rate-merged");
    direct.colSpan = 2;
    direct.textContent = money(result?.directCents);
    const booking = td();
    booking.colSpan = 2;
    const expedia = td();
    expedia.colSpan = 2;
    row.append(direct, booking, expedia);
    return;
  }

  if (discount.kind === "ota_last_minute") {
    const direct = td();
    direct.colSpan = 2;
    const booking = td("sheet-rate sheet-rate-merged");
    booking.colSpan = 2;
    booking.textContent = money(result?.bookingFlexCents);
    const expedia = td("sheet-rate sheet-rate-merged");
    expedia.colSpan = 2;
    expedia.textContent = money(result?.expediaFlexCents);
    row.append(direct, booking, expedia);
    return;
  }

  const values = [
    result?.directCents,
    null,
    result?.bookingFlexCents,
    result?.bookingNonRefundableCents,
    result?.expediaFlexCents,
    result?.expediaNonRefundableCents,
  ];
  values.forEach((value) => {
    const cell = td("sheet-rate");
    cell.textContent = money(value);
    row.appendChild(cell);
  });
}

function createDiscountKindSelect(period: PricePeriod, discount: PriceDiscountEntry, source: Element) {
  const select = document.createElement("select");
  DISCOUNT_KINDS.forEach((kind) => {
    const option = document.createElement("option");
    option.value = kind;
    option.textContent = kind === discount.kind ? discountLabel(discount) : DISCOUNT_KIND_LABELS[kind];
    select.appendChild(option);
  });
  select.value = discount.kind;
  select.addEventListener("change", () => {
    const kind = select.value as PriceDiscountKind;
    void updateStoredPeriod(period.id, (current) => ({
      ...current,
      discounts: current.discounts.map((item) => item.id === discount.id
        ? { ...item, kind, name: defaultDiscountName(kind), active: true }
        : item),
    }), source);
  });
  return select;
}

function appendDiscountRow(tbody: HTMLTableSectionElement, period: PricePeriod, discount: PriceDiscountEntry) {
  const row = document.createElement("tr");
  row.dataset.discountId = discount.id;

  const nameCell = td("sheet-discount-name");
  nameCell.colSpan = 2;
  const source = nameCell;

  if (discount.kind === "custom") {
    const custom = document.createElement("div");
    custom.className = "sheet-custom-discount";
    custom.appendChild(createDiscountKindSelect(period, discount, source));
    const name = document.createElement("input");
    name.value = discount.name;
    name.placeholder = "Nome do desconto";
    name.addEventListener("change", () => {
      void updateStoredPeriod(period.id, (current) => ({
        ...current,
        discounts: current.discounts.map((item) => item.id === discount.id
          ? { ...item, name: name.value, active: true }
          : item),
      }), source);
    });
    custom.appendChild(name);
    nameCell.appendChild(custom);
  } else {
    nameCell.appendChild(createDiscountKindSelect(period, discount, source));
  }

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "sheet-remove-row";
  remove.title = "Remover desconto";
  remove.textContent = "×";
  remove.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void updateStoredPeriod(period.id, (current) => ({
      ...current,
      discounts: current.discounts.filter((item) => item.id !== discount.id),
    }), source);
  });
  nameCell.appendChild(remove);
  row.appendChild(nameCell);

  const pct = td("sheet-percent-cell");
  const pctInput = document.createElement("input");
  pctInput.inputMode = "decimal";
  pctInput.value = percentageInput(discount.discountPct);
  pctInput.addEventListener("change", () => {
    void updateStoredPeriod(period.id, (current) => ({
      ...current,
      discounts: current.discounts.map((item) => item.id === discount.id
        ? { ...item, discountPct: parsePercentage(pctInput.value), active: true }
        : item),
    }), pct);
  });
  const pctSuffix = document.createElement("span");
  pctSuffix.textContent = "%";
  pct.append(pctInput, pctSuffix);
  row.appendChild(pct);

  appendRateCells(row, period, discount);
  appendControlCells(row, period, discount);
  tbody.appendChild(row);
}

function buildEditablePeriodTable(period: PricePeriod, config: PriceManagementConfig) {
  const referenceBaseCents = config.referenceRoomTypeId
    ? config.basePricesCents[config.referenceRoomTypeId] ?? 0
    : 0;
  const rates = calculatePeriodReferenceRates(period);
  const directCoefficient = rates && referenceBaseCents > 0 ? rates.directFlexCents / referenceBaseCents : null;
  const otaCoefficient = rates && referenceBaseCents > 0 ? rates.otaFlexCents / referenceBaseCents : null;

  const wrap = document.createElement("div");
  wrap.className = "pricing-period-table-wrap";
  const table = document.createElement("table");
  table.className = "pricing-sheet-grid pricing-sheet-grid-controls pricing-period-edit-table";
  table.dataset.periodId = period.id;
  table.innerHTML = `<thead>
    <tr>
      <th rowspan="2" class="sheet-dates-head">DATAS</th>
      <th colspan="2">Coeficiente</th>
      <th rowspan="2">Desconto</th>
      <th colspan="2" class="sheet-direct-head">Directas</th>
      <th colspan="2" class="sheet-booking-head">Booking</th>
      <th colspan="2" class="sheet-expedia-head">Expedia</th>
      <th colspan="3" class="sheet-control-head">Controlo</th>
    </tr>
    <tr>
      <th>Directa</th><th>OTA</th>
      <th>Flex</th><th>NR</th>
      <th>Flex</th><th>NR</th>
      <th>Flex</th><th>NR</th>
      <th class="sheet-control-subhead">Desc. efetivo</th>
      <th class="sheet-control-subhead">Δ Booking</th>
      <th class="sheet-control-subhead">Δ Expedia</th>
    </tr>
  </thead>`;

  const tbody = document.createElement("tbody");
  const baseRow = document.createElement("tr");
  baseRow.className = "sheet-base-row";

  const dates = td("sheet-dates-cell");
  dates.rowSpan = period.discounts.length + 1;
  const start = document.createElement("input");
  start.type = "date";
  start.value = period.startDate;
  const separator = document.createElement("span");
  separator.textContent = "A";
  const end = document.createElement("input");
  end.type = "date";
  end.value = period.endDate;
  start.addEventListener("change", () => {
    void updateStoredPeriod(period.id, (current) => ({ ...current, startDate: start.value as PricePeriod["startDate"] }), dates);
  });
  end.addEventListener("change", () => {
    void updateStoredPeriod(period.id, (current) => ({ ...current, endDate: end.value as PricePeriod["endDate"] }), dates);
  });
  dates.append(start, separator, end);
  baseRow.appendChild(dates);

  const directCoef = td();
  directCoef.textContent = coefficient(directCoefficient);
  const otaCoef = td();
  otaCoef.textContent = coefficient(otaCoefficient);
  baseRow.append(directCoef, otaCoef, td());

  const directFlex = td("sheet-money-input");
  const euroPrefix = document.createElement("span");
  euroPrefix.textContent = "€";
  const directInput = document.createElement("input");
  directInput.inputMode = "decimal";
  directInput.value = inputMoney(period.directFlexReferenceCents);
  directInput.addEventListener("change", () => {
    void updateStoredPeriod(period.id, (current) => ({ ...current, directFlexReferenceCents: parseMoney(directInput.value) }), directFlex);
  });
  directFlex.append(euroPrefix, directInput);
  baseRow.appendChild(directFlex);

  const directNr = td("sheet-rate");
  directNr.textContent = money(rates?.directNonRefundableCents);
  const bookingFlex = td("sheet-rate");
  bookingFlex.textContent = money(rates?.otaFlexCents);
  const bookingNr = td("sheet-rate");
  bookingNr.textContent = money(rates?.otaNonRefundableCents);
  const expediaFlex = td("sheet-rate");
  expediaFlex.textContent = money(rates?.otaFlexCents);
  const expediaNr = td("sheet-rate");
  expediaNr.textContent = money(rates?.otaNonRefundableCents);
  baseRow.append(directNr, bookingFlex, bookingNr, expediaFlex, expediaNr);
  appendControlCells(baseRow, period);
  tbody.appendChild(baseRow);

  period.discounts.forEach((discount) => appendDiscountRow(tbody, period, discount));
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildPeriodItem(period: PricePeriod, config: PriceManagementConfig, referenceRoomName: string) {
  const details = document.createElement("details");
  details.className = "pricing-period-item";
  details.dataset.periodId = period.id;

  const summary = document.createElement("summary");
  const main = document.createElement("div");
  main.className = "pricing-period-summary-main";
  const dates = document.createElement("strong");
  dates.textContent = `${formatDate(period.startDate)} → ${formatDate(period.endDate)}`;
  const meta = document.createElement("small");
  const count = period.discounts.length;
  meta.textContent = `OTA +${percentage(period.otaUpliftPct)} · NR ${percentage(period.nonRefundableDiscountPct)} · ${count} ${count === 1 ? "desconto" : "descontos"}`;
  main.append(dates, meta);

  const price = document.createElement("span");
  price.className = "pricing-period-summary-price";
  price.textContent = `Direct Flex ${money(period.directFlexReferenceCents)}`;
  summary.append(main, price);

  const body = document.createElement("div");
  body.className = "pricing-period-body";

  const referenceBaseCents = config.referenceRoomTypeId
    ? config.basePricesCents[config.referenceRoomTypeId] ?? 0
    : 0;
  const baseLine = document.createElement("div");
  baseLine.className = "pricing-period-base-line";
  baseLine.textContent = `Discounts applied to ${referenceRoomName} Base Price: ${compactMoney(referenceBaseCents)}`;
  body.appendChild(baseLine);
  body.appendChild(buildEditablePeriodTable(period, config));

  const actions = document.createElement("div");
  actions.className = "pricing-period-actions";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "secondary-button";
  add.textContent = "+ Adicionar entrada";
  add.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void updateStoredPeriod(period.id, (current) => ({
      ...current,
      discounts: [...current.discounts, {
        id: crypto.randomUUID(),
        kind: "custom",
        name: "Desconto",
        discountPct: 0,
        active: true,
      }],
    }), actions);
  });
  const status = document.createElement("span");
  status.className = "pricing-period-save-status";
  status.textContent = "As alterações são guardadas automaticamente.";
  actions.append(add, status);
  body.appendChild(actions);

  details.append(summary, body);
  return details;
}

function ensurePricingPeriodPanel() {
  const editor = document.querySelector(".pricing-sheet-panel");
  if (!editor) return null;

  let panel = document.querySelector<HTMLElement>(".pricing-period-list-panel");
  if (panel) return panel;

  panel = document.createElement("article");
  panel.className = "panel pricing-period-list-panel";
  editor.insertAdjacentElement("afterend", panel);
  return panel;
}

function renderPricingPeriodList(config: PriceManagementConfig) {
  const panel = ensurePricingPeriodPanel();
  if (!panel) return;

  const openIds = new Set(
    Array.from(panel.querySelectorAll<HTMLDetailsElement>(".pricing-period-item[open]"))
      .map((item) => item.dataset.periodId)
      .filter((id): id is string => Boolean(id)),
  );
  if (periodBeingKeptOpen) openIds.add(periodBeingKeptOpen);
  periodBeingKeptOpen = null;

  panel.replaceChildren();
  periodCache = config.periods.map((item) => ({ ...item, discounts: item.discounts.map((discount) => ({ ...discount })) }));

  const heading = document.createElement("div");
  heading.className = "panel-heading";
  const headingText = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "Períodos criados";
  const subtitle = document.createElement("p");
  subtitle.textContent = "Expanda um período para consultar e editar a respetiva tabela de descontos.";
  headingText.append(title, subtitle);
  const count = document.createElement("span");
  count.className = "pricing-period-count";
  count.textContent = `${config.periods.length} ${config.periods.length === 1 ? "período" : "períodos"}`;
  heading.append(headingText, count);
  panel.appendChild(heading);

  const list = document.createElement("div");
  list.className = "pricing-period-list";
  if (!config.periods.length) {
    const empty = document.createElement("p");
    empty.className = "pricing-period-empty";
    empty.textContent = "Ainda não existem períodos guardados.";
    list.appendChild(empty);
  } else {
    const referenceRoomName = document.querySelector<HTMLElement>(".pricing-sheet-title strong")?.textContent?.trim()
      || "Reference Room";
    [...config.periods]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .forEach((period) => {
        const item = buildPeriodItem(period, config, referenceRoomName);
        if (openIds.has(period.id)) item.open = true;
        list.appendChild(item);
      });
  }
  panel.appendChild(list);
}

async function refreshPricingPeriodList(force = false) {
  const propertySelect = document.querySelector<HTMLSelectElement>(".property-control select");
  const periodSelect = document.querySelector<HTMLSelectElement>(".pricing-sheet-controls select");
  const propertyId = propertySelect?.value;
  if (!propertyId || !periodSelect) return;

  const optionsSignature = Array.from(periodSelect.options)
    .map((option) => `${option.value}:${option.textContent ?? ""}`)
    .join("|");
  const referenceTitle = document.querySelector<HTMLElement>(".pricing-sheet-title")?.textContent ?? "";
  const signature = `${propertyId}|${optionsSignature}|${referenceTitle}`;
  if (!force && signature === periodListSignature) return;
  periodListSignature = signature;

  const request = ++periodListRequest;
  try {
    const config = await priceManagementStore.get(propertyId);
    if (request !== periodListRequest) return;
    if (config) renderPricingPeriodList(config);
  } catch {
    if (request !== periodListRequest) return;
  }
}

function schedulePeriodListRefresh(delay = 0) {
  window.setTimeout(() => void refreshPricingPeriodList(true), delay);
}

function applyPricingGridLayout() {
  document.querySelectorAll<HTMLTableElement>(".pricing-sheet-grid-controls").forEach(reorderPricingGrid);
  void refreshPricingPeriodList();
}

function persistPricingAfterPeriodAction(attempt = 0) {
  window.setTimeout(() => {
    const pricingPanel = document.querySelector(".pricing-sheet-panel");
    if (!pricingPanel || pricingPanel.querySelector(".pricing-period-error")) return;

    const saveButton = document.querySelector<HTMLButtonElement>(".pricing-heading .primary-button");
    if (!saveButton) return;

    if (!saveButton.disabled) {
      saveButton.click();
      schedulePeriodListRefresh(200);
      schedulePeriodListRefresh(650);
      return;
    }

    if (attempt < 10) persistPricingAfterPeriodAction(attempt + 1);
  }, attempt === 0 ? 0 : 25);
}

function installPricingPersistenceBridge() {
  if (persistenceBridgeInstalled) return;
  persistenceBridgeInstalled = true;

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const periodAction = target.closest(".pricing-sheet-actions .primary-button, .pricing-danger-button");
    if (!periodAction) return;

    persistPricingAfterPeriodAction();
  });

  document.addEventListener("change", (event) => {
    const target = event.target instanceof HTMLSelectElement ? event.target : null;
    if (!target || !target.closest(".property-control")) return;
    periodListSignature = "";
    periodCache = [];
    schedulePeriodListRefresh(150);
  });
}

function observe() {
  if (!document.body || pricingGridObserver) return;

  const run = () => {
    scheduled = false;
    pricingGridObserver?.disconnect();
    applyPricingGridLayout();
    pricingGridObserver?.observe(document.body, { childList: true, subtree: true });
  };

  pricingGridObserver = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  });

  pricingGridObserver.observe(document.body, { childList: true, subtree: true });
  requestAnimationFrame(run);
}

export function initPricingGridUi() {
  installPricingPersistenceBridge();
  if (document.body) observe();
  else window.addEventListener("DOMContentLoaded", observe, { once: true });
}
