import { isTauri } from "@tauri-apps/api/core";
import { BrowserRepository } from "./browserRepository";
import type { Repository } from "./repository";
import { TauriRepository } from "./tauriRepository";

export function createRepository(): Repository {
  return isTauri() ? new TauriRepository() : new BrowserRepository();
}
