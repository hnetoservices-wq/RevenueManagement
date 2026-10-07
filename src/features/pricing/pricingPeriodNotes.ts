import { priceManagementStore } from "./store";
import "./pricing-period-notes.css";

let observer: MutationObserver | null = null;
let scheduled = false;
let renderRequest = 0;
let saveQueue = Promise.resolve();

function propertyId() {
  return document.querySelector<HTMLSelectElement>(".property-control select")?.value ?? "";
}

async function saveNote(periodId: string, note: string) {
  const id = propertyId();
  if (!id) return;
  const trimmed = note.trim().slice(0, 30);

  saveQueue = saveQueue.then(async () => {
    const config = await priceManagementStore.get(id);
    if (!config) return;
    const period = config.periods.find((item) => item.id === periodId);
    if (!period || (period.note ?? "") === trimmed) return;

    await priceManagementStore.save({
      ...config,
      periods: config.periods.map((item) => item.id === periodId ? { ...item, note: trimmed } : item),
      updatedAt: new Date().toISOString(),
    });
  }).catch(() => undefined);

  await saveQueue;
}

function makeNoteInput(periodId: string, value: string) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "pricing-period-note-input";
  input.placeholder = "Adicione uma nota";
  input.maxLength = 30;
  input.value = value.slice(0, 30);
  input.dataset.savedValue = input.value;
  input.setAttribute("aria-label", "Nota do período");
  input.title = "Máximo de 30 caracteres";

  // A click inside <summary> triggers its native <details> toggle even when
  // propagation is stopped. Cancel that default action for the note only.
  input.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  ["mousedown", "pointerdown", "dblclick"].forEach((eventName) => {
    input.addEventListener(eventName, (event) => event.stopPropagation());
  });

  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") input.blur();
    if (event.key === "Escape") {
      input.value = input.dataset.savedValue ?? "";
      input.blur();
    }
  });

  input.addEventListener("blur", () => {
    const next = input.value.trim().slice(0, 30);
    input.value = next;
    if (next === (input.dataset.savedValue ?? "")) return;
    input.dataset.savedValue = next;
    void saveNote(periodId, next);
  });

  return input;
}

async function applyNotes() {
  const id = propertyId();
  if (!id) return;
  const request = ++renderRequest;
  const config = await priceManagementStore.get(id);
  if (!config || request !== renderRequest) return;
  const notes = new Map(config.periods.map((period) => [period.id, period.note ?? ""]));

  document.querySelectorAll<HTMLDetailsElement>(".pricing-period-item[data-period-id]").forEach((item) => {
    const periodId = item.dataset.periodId;
    const summary = item.querySelector(":scope > summary");
    if (!periodId || !summary) return;

    const value = notes.get(periodId) ?? "";
    const existing = summary.querySelector<HTMLInputElement>(".pricing-period-note-input");
    if (existing) {
      if (document.activeElement !== existing && existing.dataset.savedValue !== value) {
        existing.value = value;
        existing.dataset.savedValue = value;
      }
      return;
    }

    const input = makeNoteInput(periodId, value);
    const price = summary.querySelector(".pricing-period-summary-price");
    summary.insertBefore(input, price ?? summary.lastElementChild);
  });
}

async function captureAndRestoreNotes() {
  const id = propertyId();
  if (!id) return;
  const before = await priceManagementStore.get(id);
  if (!before) return;
  const notes = new Map(before.periods.map((period) => [period.id, period.note ?? ""]));

  window.setTimeout(async () => {
    const latest = await priceManagementStore.get(id);
    if (!latest) return;
    let changed = false;
    const periods = latest.periods.map((period) => {
      const note = notes.get(period.id);
      if (note === undefined || note === (period.note ?? "")) return period;
      changed = true;
      return { ...period, note };
    });
    if (changed) {
      await priceManagementStore.save({ ...latest, periods, updatedAt: new Date().toISOString() });
    }
    schedule();
  }, 900);
}

function installSaveProtection() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const button = target.closest<HTMLButtonElement>(".pricing-heading .primary-button, .pricing-sheet-actions .primary-button");
    if (!button) return;
    void captureAndRestoreNotes();
  }, true);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    observer?.disconnect();
    void applyNotes().finally(() => {
      observer?.observe(document.body, { childList: true, subtree: true });
    });
  });
}

export function initPricingPeriodNotes() {
  if (!document.body || observer) return;
  installSaveProtection();
  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();
}
