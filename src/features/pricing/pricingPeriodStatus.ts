import "./pricing-period-status.css";

let observer: MutationObserver | null = null;
let scheduled = false;

function localIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ptDateToIso(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function periodsOverlap(a: { start: string; end: string }, b: { start: string; end: string }) {
  return a.start <= b.end && b.start <= a.end;
}

function applyPeriodStatuses() {
  const today = localIsoDate();
  const periods = Array.from(document.querySelectorAll<HTMLElement>(".pricing-period-summary-main strong"))
    .map((dates) => {
      const rawText = dates.dataset.periodDates || dates.textContent || "";
      const cleanText = rawText.replace(/\s*(?:✓|⚠️?)\s*$/, "").trim();
      const [startText, endText] = cleanText.split("→").map((part) => part.trim());
      const start = ptDateToIso(startText || "");
      const end = ptDateToIso(endText || "");
      if (!start || !end) return null;
      dates.dataset.periodDates = cleanText;
      return { dates, cleanText, start, end };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const overlapping = new Set<HTMLElement>();
  periods.forEach((period, index) => {
    for (let otherIndex = index + 1; otherIndex < periods.length; otherIndex += 1) {
      const other = periods[otherIndex];
      if (periodsOverlap(period, other)) {
        overlapping.add(period.dates);
        overlapping.add(other.dates);
      }
    }
  });

  periods.forEach(({ dates, cleanText, start, end }) => {
    dates.classList.remove(
      "pricing-period-date-current",
      "pricing-period-date-future",
      "pricing-period-date-overlap",
    );

    if (overlapping.has(dates)) {
      dates.classList.add("pricing-period-date-overlap");
      dates.textContent = `${cleanText} ⚠️`;
      return;
    }

    if (today >= start && today <= end) {
      dates.classList.add("pricing-period-date-current");
      dates.textContent = `${cleanText} ✓`;
      return;
    }

    dates.textContent = cleanText;
    if (today < start) dates.classList.add("pricing-period-date-future");
  });
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    observer?.disconnect();
    applyPeriodStatuses();
    observer?.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

export function initPricingPeriodStatus() {
  if (!document.body || observer) return;
  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  schedule();
}
