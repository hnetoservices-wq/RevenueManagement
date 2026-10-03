let initialized = false;

function resetEditorAfterSuccessfulCreate(attempt = 0) {
  window.setTimeout(() => {
    const panel = document.querySelector(".pricing-sheet-panel");
    if (!panel) return;

    // If validation failed, keep the user's draft intact so it can be corrected.
    if (panel.querySelector(".pricing-period-error")) return;

    const actionButton = panel.querySelector<HTMLButtonElement>(".pricing-sheet-actions .primary-button");
    const periodSelect = panel.querySelector<HTMLSelectElement>(".pricing-sheet-controls select");
    const newPeriodButton = Array.from(panel.querySelectorAll<HTMLButtonElement>(".pricing-sheet-controls .secondary-button"))
      .find((button) => button.textContent?.includes("Novo período"));

    // A successful create switches the editor from "Adicionar período" to edit mode.
    // Only then reset it, so validation failures never lose the user's work.
    const createdSuccessfully = Boolean(periodSelect?.value)
      && Boolean(actionButton?.textContent?.includes("Aplicar alterações"));

    if (createdSuccessfully) {
      newPeriodButton?.click();
      return;
    }

    if (attempt < 12) resetEditorAfterSuccessfulCreate(attempt + 1);
  }, attempt === 0 ? 0 : 30);
}

export function initPricingPeriodResetUi() {
  if (initialized) return;
  initialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const actionButton = target?.closest<HTMLButtonElement>(".pricing-sheet-actions .primary-button");
    if (!actionButton) return;

    // Editing an existing period should remain on that period. Only reset after
    // creating a brand-new one.
    if (!actionButton.textContent?.includes("Adicionar período")) return;
    resetEditorAfterSuccessfulCreate();
  });
}
