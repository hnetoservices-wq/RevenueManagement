export type ThemePreference = "system" | "light" | "dark";

const THEME_KEY = "revenue-manager:theme";
const ZOOM_KEY = "revenue-manager:zoom";
const DEFAULT_ZOOM = 1.1;
export const MIN_ZOOM = 0.85;
export const MAX_ZOOM = 1.6;
export const ZOOM_STEP = 0.05;

let systemThemeListenerInstalled = false;
let controlsInstalled = false;

export function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 20) / 20));
}

export function getThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function getInterfaceZoom() {
  const stored = Number(localStorage.getItem(ZOOM_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampZoom(stored) : DEFAULT_ZOOM;
}

function resolvedTheme(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(preference = getThemePreference()) {
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.theme = resolvedTheme(preference);
}

export function setThemePreference(preference: ThemePreference) {
  localStorage.setItem(THEME_KEY, preference);
  applyTheme(preference);
  window.dispatchEvent(new CustomEvent("revenue-manager:preferences"));
}

export function applyInterfaceZoom(value = getInterfaceZoom()) {
  const zoom = clampZoom(value);
  document.documentElement.style.setProperty("--app-zoom", String(zoom));
  document.documentElement.dataset.zoom = String(Math.round(zoom * 100));
  return zoom;
}

export function setInterfaceZoom(value: number) {
  const zoom = clampZoom(value);
  localStorage.setItem(ZOOM_KEY, String(zoom));
  applyInterfaceZoom(zoom);
  window.dispatchEvent(new CustomEvent("revenue-manager:preferences"));
  return zoom;
}

export function resetInterfaceZoom() {
  return setInterfaceZoom(DEFAULT_ZOOM);
}

export function initUiPreferences() {
  applyTheme();
  applyInterfaceZoom();

  if (!systemThemeListenerInstalled) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", () => {
      if (getThemePreference() === "system") applyTheme("system");
    });
    systemThemeListenerInstalled = true;
  }

  if (controlsInstalled) return;

  window.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setInterfaceZoom(getInterfaceZoom() + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }, { passive: false, capture: true });

  window.addEventListener("keydown", (event) => {
    if (!event.ctrlKey) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setInterfaceZoom(getInterfaceZoom() + ZOOM_STEP);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setInterfaceZoom(getInterfaceZoom() - ZOOM_STEP);
    } else if (event.key === "0") {
      event.preventDefault();
      resetInterfaceZoom();
    }
  }, true);

  controlsInstalled = true;
}
