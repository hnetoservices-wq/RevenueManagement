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

function applyPeriodStatuses() {
  const today = localIsoDate();

  document.querySelectorAll<HTMLElement>(".pricing-period-summary-main strong").forEach((dates) => {
    const rawText = dates.dataset.periodDates || dates.textContent || "";
    const cleanText = rawText.replace(/\s*✓\s*$/, "").trim();
    const [startText, endText] = cleanText.split("→").map((part) => part.trim());
    const start = ptDateToIso(startText || "");
    const end = ptDateToIso(endText || "");
    if (!start || !end) return;

    dates.dataset.periodDates = cleanText;
    dates.classList.remove("pricing-period-date-current", "pricing-period-date-future");

    if (today >= start && today <= end) {
      dates.classList.add("pricing-period-date-current");
      dates.textContent = `${cleanText} ✓`;
    } else {
      dates.textContent = cleanText;
      if (today < start) dates.classList.add("pricing-period-date-future");
    }
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
