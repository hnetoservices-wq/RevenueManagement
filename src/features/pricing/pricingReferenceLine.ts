function parseEuroInput(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatEuro(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function currentReferenceRoom(): { name: string; basePrice: number | null } | null {
  const select = document.querySelector<HTMLSelectElement>(".pricing-reference-select select");
  if (!select) return null;

  const selectedOption = select.options[select.selectedIndex];
  const name = selectedOption?.textContent?.trim();
  if (!name) return null;

  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>(".pricing-base-panel .pricing-table tbody tr"));
  const matchingRow = rows.find((row) => row.querySelector("td:first-child strong")?.textContent?.trim() === name);
  const priceInput = matchingRow?.querySelector<HTMLInputElement>(".pricing-price-input input");

  return {
    name,
    basePrice: priceInput ? parseEuroInput(priceInput.value) : null,
  };
}

function refreshReferenceLines() {
  const reference = currentReferenceRoom();
  if (!reference) return;

  const text = `Descontos aplicados ao preço base do ${reference.name}: ${formatEuro(reference.basePrice)}`;
  document.querySelectorAll<HTMLElement>(".pricing-period-base-line").forEach((line) => {
    if (line.textContent !== text) line.textContent = text;
  });
}

let observer: MutationObserver | null = null;
let scheduled = false;

function scheduleRefresh() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    refreshReferenceLines();
  });
}

function installListeners() {
  document.addEventListener("change", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.matches(".pricing-reference-select select") || target.matches(".pricing-price-input input")) {
      scheduleRefresh();
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.matches(".pricing-price-input input")) scheduleRefresh();
  });
}

function startObserver() {
  if (observer || !document.body) return;
  observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleRefresh();
}

export function initPricingReferenceLine() {
  installListeners();
  if (document.body) startObserver();
  else window.addEventListener("DOMContentLoaded", startObserver, { once: true });
}
