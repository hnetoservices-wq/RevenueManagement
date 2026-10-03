let pricingGridObserver: MutationObserver | null = null;
let scheduled = false;
let persistenceBridgeInstalled = false;

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

function applyPricingGridLayout() {
  document.querySelectorAll<HTMLTableElement>(".pricing-sheet-grid-controls").forEach(reorderPricingGrid);
}

function persistPricingAfterPeriodAction(attempt = 0) {
  window.setTimeout(() => {
    const pricingPanel = document.querySelector(".pricing-sheet-panel");
    if (!pricingPanel || pricingPanel.querySelector(".pricing-period-error")) return;

    const saveButton = document.querySelector<HTMLButtonElement>(".pricing-heading .primary-button");
    if (!saveButton) return;

    if (!saveButton.disabled) {
      saveButton.click();
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
