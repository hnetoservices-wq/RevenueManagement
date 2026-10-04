let observer: MutationObserver | null = null;
let scheduled = false;

function syncPricingPeriodPanelScope() {
  const editor = document.querySelector<HTMLElement>(".pricing-sheet-panel");
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".pricing-period-list-panel"));

  if (!editor) {
    panels.forEach((panel) => panel.remove());
    return;
  }

  const panel = panels[0];
  panels.slice(1).forEach((duplicate) => duplicate.remove());
  if (!panel) return;

  // The saved-period list belongs only to Gestão de Preços and must always sit
  // immediately below the complete period-creation/editor panel.
  if (editor.nextElementSibling !== panel) {
    editor.insertAdjacentElement("afterend", panel);
  }
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    observer?.disconnect();
    syncPricingPeriodPanelScope();
    observer?.observe(document.body, { childList: true, subtree: true });
  });
}

export function initPricingPeriodPanelScope() {
  if (!document.body || observer) return;
  observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleSync();
}
