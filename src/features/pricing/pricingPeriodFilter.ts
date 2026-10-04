import "./pricing-period-filter.css";

let observer: MutationObserver | null = null;
let scheduled = false;
let selectedYear: string | null = null;

const ALL_PERIODS = "all";

function yearsForPeriod(item: HTMLElement): number[] {
  const dates = item.querySelector<HTMLElement>(".pricing-period-summary-main strong");
  const raw = dates?.dataset.periodDates || dates?.textContent || "";
  const matches = raw.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  if (!matches.length) return [];

  const start = Number(matches[0]);
  const end = Number(matches[matches.length - 1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  const min = Math.min(start, end);
  const max = Math.max(start, end);
  const years: number[] = [];
  for (let year = min; year <= max; year += 1) years.push(year);
  return years;
}

function availableYears(items: HTMLElement[]) {
  const years = new Set<number>();
  items.forEach((item) => yearsForPeriod(item).forEach((year) => years.add(year)));
  return [...years].sort((a, b) => a - b);
}

function applyFilter(items: HTMLElement[]) {
  items.forEach((item) => {
    const visible = selectedYear === ALL_PERIODS
      || selectedYear === null
      || yearsForPeriod(item).includes(Number(selectedYear));
    item.hidden = !visible;
  });
}

function ensureYearFilter() {
  const panel = document.querySelector<HTMLElement>(".pricing-period-list-panel");
  if (!panel || panel.hidden) return;

  const heading = panel.querySelector<HTMLElement>(".panel-heading");
  const list = panel.querySelector<HTMLElement>(".pricing-period-list");
  if (!heading || !list) return;

  const items = Array.from(list.querySelectorAll<HTMLElement>(".pricing-period-item"));
  const years = availableYears(items);
  if (!years.length) return;

  const currentYear = String(new Date().getFullYear());
  const available = new Set(years.map(String));
  if (selectedYear === null || (selectedYear !== ALL_PERIODS && !available.has(selectedYear))) {
    selectedYear = available.has(currentYear) ? currentYear : ALL_PERIODS;
  }

  let control = heading.querySelector<HTMLElement>(".pricing-period-year-filter");
  let select = control?.querySelector<HTMLSelectElement>("select");

  if (!control || !select) {
    control = document.createElement("label");
    control.className = "pricing-period-year-filter";

    const caption = document.createElement("span");
    caption.textContent = "Períodos";

    select = document.createElement("select");
    select.setAttribute("aria-label", "Filtrar períodos por ano");
    select.addEventListener("change", () => {
      selectedYear = select!.value;
      applyFilter(Array.from(list.querySelectorAll<HTMLElement>(".pricing-period-item")));
    });

    control.append(caption, select);
    const count = heading.querySelector(".pricing-period-count");
    if (count) heading.insertBefore(control, count);
    else heading.appendChild(control);
  }

  const desiredOptions = [ALL_PERIODS, ...years.map(String)];
  const currentOptions = Array.from(select.options).map((option) => option.value);
  if (desiredOptions.join("|") !== currentOptions.join("|")) {
    select.replaceChildren();

    const all = document.createElement("option");
    all.value = ALL_PERIODS;
    all.textContent = "Todos os períodos";
    select.appendChild(all);

    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      select!.appendChild(option);
    });
  }

  select.value = selectedYear ?? ALL_PERIODS;
  applyFilter(items);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    observer?.disconnect();
    ensureYearFilter();
    observer?.observe(document.body, { childList: true, subtree: true });
  });
}

export function initPricingPeriodFilter() {
  if (!document.body || observer) return;
  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();
}
