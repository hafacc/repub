import { clearProgress, showFailed, showProgress } from "./icon";
import type { Spot } from "./progress";

// store active state for navigation
const activeTabs = new Map<number, Tab>();

class Tab {
  #tabId: number;
  nav: boolean = false;
  precount: number = 1;
  count: number = 1;

  constructor(tabId: number) {
    this.#tabId = tabId;
  }

  init(): void {
    showProgress(this.#tabId, { progress: 0, upto: 0 });
  }

  progress(spot: Spot): void {
    showProgress(this.#tabId, spot);
  }

  complete(): void {
    showProgress(this.#tabId, { progress: 1, upto: 1 });
  }

  async error(): Promise<void> {
    try {
      await showFailed(this.#tabId);
    } catch {
      // ignore
    }
  }

  async done(): Promise<void> {
    this.precount -= 1;
    if (!this.precount && this.nav) {
      try {
        await clearProgress(this.#tabId);
      } catch {
        // ignore
      }
    }
  }

  async drop(): Promise<void> {
    this.count -= 1;
    if (!this.count) {
      activeTabs.delete(this.#tabId);
      if (this.nav) {
        try {
          await clearProgress(this.#tabId);
        } catch {
          // ignore
        }
      }
    }
  }
}

export function getTab(tabId: number): Tab {
  const tab = activeTabs.get(tabId);
  if (tab) {
    tab.nav = false;
    tab.count += 1;
    tab.precount += 1;
    return tab;
  } else {
    const newTab = new Tab(tabId);
    activeTabs.set(tabId, newTab);
    return newTab;
  }
}

// watch for navigation
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId }) => {
  if (frameId === 0) {
    // only care about root navigation
    const active = activeTabs.get(tabId);
    if (active?.precount) {
      active.nav = true;
    } else {
      clearProgress(tabId).catch((ex: unknown) => {
        const message = ex instanceof Error ? ex.message : "unknown error";
        console.error(`error clearing the toolbar icon: ${message}`);
      });
    }
  }
});
