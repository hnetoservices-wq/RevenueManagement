let observer: MutationObserver | null = null;
let scheduled = false;

function activeSidebarLabel() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".sidebar nav button"));
  const active = buttons.find((button) => button.classList.contains("active") || button.getAttribute("aria-current") === "page");
  return active?.textContent?.trim() ?? "";
}

function syncPricingPeriodPanelScope() {
  const editor = document.querySelector<HTMLElement>(".pricing-sheet-panel");
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".pricing-period-list-panel"));
  const activeLabel = activeSidebarLabel();
  const onPriceManager = activeLabel
    ? activeLabel.includes("Gestão de Preços")
    : Boolean(editor);

  // Keep the injected panel mounted so the pricing renderer does not lose it during
  // React page transitions. Hide it everywhere except Gestão de Preços.
  if (!onPriceManager) {
    panels.forEach((panel) => { panel.style.display = "none"; });
    return;
  }

  panels.forEach((panel) => { panel.style.display = ""; });

  if (!editor) return;

  const panel = panels[0];
  panels.slice(1).forEach((duplicate) => duplicate.remove());
  if (!panel) return;

  // Always keep the saved-period list directly below the complete period editor.
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
    observer?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-current"],
    });
  });
}

export function initPricingPeriodPanelScope() {
  if (!document.body || observer) return;
  observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "aria-current"],
  });
  scheduleSync();
}
