import { calculatePeriodReferenceRates, DISCOUNT_KIND_LABELS } from "./pricing";
import { priceManagementStore } from "./store";
import type { PricePeriod } from "./types";
import "./pricing-period-list.css";

let pricingGridObserver: MutationObserver | null = null;
let scheduled = false;
let persistenceBridgeInstalled = false;
let periodListSignature = "";
let periodListRequest = 0;

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

function percentage(value: number) {
  return `${value.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`;
}

function discountLabel(discount: PricePeriod["discounts"][number]) {
  const explicit = discount.name?.trim();
  if (explicit) return explicit;
  return DISCOUNT_KIND_LABELS[discount.kind] ?? "Desconto";
}

function metric(label: string, value: string) {
  const box = document.createElement("div");
  box.className = "pricing-period-metric";
  const name = document.createElement("span");
  name.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  box.append(name, content);
  return box;
}

function buildPeriodItem(period: PricePeriod) {
  const details = document.createElement("details");
  details.className = "pricing-period-item";

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
  const rates = calculatePeriodReferenceRates(period);
  const metrics = document.createElement("div");
  metrics.className = "pricing-period-metrics";
  metrics.append(
    metric("Direct Flex", money(rates?.directFlexCents)),
    metric("Direct NR", money(rates?.directNonRefundableCents)),
    metric("OTA Flex", money(rates?.otaFlexCents)),
    metric("OTA NR", money(rates?.otaNonRefundableCents)),
  );
  body.appendChild(metrics);

  const discounts = document.createElement("div");
  discounts.className = "pricing-period-discounts";
  const discountsTitle = document.createElement("strong");
  discountsTitle.textContent = "Descontos";
  discounts.appendChild(discountsTitle);

  if (period.discounts.length) {
    const list = document.createElement("div");
    list.className = "pricing-period-discount-list";
    period.discounts.forEach((discount) => {
      const row = document.createElement("div");
      row.className = "pricing-period-discount-row";
      const label = document.createElement("span");
      label.textContent = discountLabel(discount);
      const value = document.createElement("b");
      value.textContent = percentage(discount.discountPct);
      row.append(label, value);
      list.appendChild(row);
    });
    discounts.appendChild(list);
  } else {
    const empty = document.createElement("p");
    empty.className = "pricing-period-no-discounts";
    empty.textContent = "Sem descontos configurados neste período.";
    discounts.appendChild(empty);
  }

  body.appendChild(discounts);
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

function renderPricingPeriodList(periods: PricePeriod[]) {
  const panel = ensurePricingPeriodPanel();
  if (!panel) return;
  panel.replaceChildren();

  const heading = document.createElement("div");
  heading.className = "panel-heading";
  const headingText = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = "Períodos criados";
  const subtitle = document.createElement("p");
  subtitle.textContent = "Expanda um período para consultar os preços e descontos guardados.";
  headingText.append(title, subtitle);
  const count = document.createElement("span");
  count.className = "pricing-period-count";
  count.textContent = `${periods.length} ${periods.length === 1 ? "período" : "períodos"}`;
  heading.append(headingText, count);
  panel.appendChild(heading);

  const list = document.createElement("div");
  list.className = "pricing-period-list";
  if (!periods.length) {
    const empty = document.createElement("p");
    empty.className = "pricing-period-empty";
    empty.textContent = "Ainda não existem períodos guardados.";
    list.appendChild(empty);
  } else {
    [...periods]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .forEach((period) => list.appendChild(buildPeriodItem(period)));
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
  const signature = `${propertyId}|${optionsSignature}`;
  if (!force && signature === periodListSignature) return;
  periodListSignature = signature;

  const request = ++periodListRequest;
  try {
    const config = await priceManagementStore.get(propertyId);
    if (request !== periodListRequest) return;
    renderPricingPeriodList(config?.periods ?? []);
  } catch {
    if (request !== periodListRequest) return;
    renderPricingPeriodList([]);
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

    // React batches the period update. Give it a few frames to enable Guardar tudo,
    // then persist the new/edited/removed period automatically.
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
