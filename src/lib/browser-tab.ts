/** Tracks and resolves the active tab in a normal browser window (not the extension UI). */

import { getProfileKey } from "./profile-url";

const SESSION_KEY = "lastBrowserTab";

let lastBrowserTabId: number | undefined;
let lastBrowserTabUrl: string | undefined;

function isUsableTab(tab: chrome.tabs.Tab): boolean {
  if (!tab.id || !tab.url) return false;
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
    return false;
  }
  return true;
}

async function persistLastBrowserTab(tabId: number, tabUrl?: string): Promise<void> {
  lastBrowserTabId = tabId;
  lastBrowserTabUrl = tabUrl;
  await chrome.storage.session.set({
    [SESSION_KEY]: { tabId, tabUrl },
  });
}

function broadcastTabUrlChange(tabId: number, tabUrl?: string): void {
  if (!tabUrl || !isUsableTab({ id: tabId, url: tabUrl } as chrome.tabs.Tab)) return;

  void chrome.runtime
    .sendMessage({
      action: "tabUrlChanged",
      tabId,
      tabUrl,
      profileKey: getProfileKey(tabUrl),
    })
    .catch(() => {
      /* side panel may be closed */
    });
}

export async function handlePageUrlChanged(
  tabId: number,
  tabUrl: string
): Promise<void> {
  if (!isUsableTab({ id: tabId, url: tabUrl } as chrome.tabs.Tab)) return;

  if (tabId === lastBrowserTabId) {
    lastBrowserTabUrl = tabUrl;
    await chrome.storage.session.set({
      [SESSION_KEY]: { tabId, tabUrl },
    });
    broadcastTabUrlChange(tabId, tabUrl);
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active || !tab.windowId) return;

    const win = await chrome.windows.get(tab.windowId);
    if (win.type !== "normal" || !win.focused) return;

    await persistLastBrowserTab(tabId, tabUrl);
    broadcastTabUrlChange(tabId, tabUrl);
  } catch {
    /* tab may have closed */
  }
}

async function loadPersistedTab(): Promise<void> {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  const saved = stored[SESSION_KEY] as { tabId?: number; tabUrl?: string } | undefined;
  if (!saved?.tabId) return;

  try {
    const tab = await chrome.tabs.get(saved.tabId);
    if (isUsableTab(tab)) {
      lastBrowserTabId = tab.id;
      lastBrowserTabUrl = tab.url;
    }
  } catch {
    await chrome.storage.session.remove(SESSION_KEY);
  }
}

async function pickBestBrowserTab(): Promise<{ tabId: number; tabUrl: string } | null> {
  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const focusedNormal = windows.find((w) => w.focused);

  if (focusedNormal?.id) {
    const activeTabs = await chrome.tabs.query({ active: true, windowId: focusedNormal.id });
    const active = activeTabs.find(isUsableTab);
    if (active?.id && active.url) {
      return { tabId: active.id, tabUrl: active.url };
    }
  }

  const allTabs = await chrome.tabs.query({ windowType: "normal" });
  const best = allTabs
    .filter(isUsableTab)
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];

  if (best?.id && best.url) {
    return { tabId: best.id, tabUrl: best.url };
  }

  return null;
}

/** Call before opening the extension window so we keep the tab the user was on. */
export async function snapshotBrowserTab(): Promise<void> {
  const picked = await pickBestBrowserTab();
  if (picked) {
    await persistLastBrowserTab(picked.tabId, picked.tabUrl);
  }
}

export async function resolveBrowserTab(): Promise<{ tabId?: number; tabUrl?: string }> {
  await loadPersistedTab();

  if (lastBrowserTabId) {
    try {
      const tab = await chrome.tabs.get(lastBrowserTabId);
      if (isUsableTab(tab) && tab.url) {
        return { tabId: tab.id, tabUrl: tab.url };
      }
    } catch {
      lastBrowserTabId = undefined;
      lastBrowserTabUrl = undefined;
    }
  }

  const picked = await pickBestBrowserTab();
  if (picked) {
    await persistLastBrowserTab(picked.tabId, picked.tabUrl);
    return picked;
  }

  return {};
}

async function updateFromWindow(windowId: number): Promise<void> {
  try {
    const win = await chrome.windows.get(windowId);
    if (win.type !== "normal" || !win.id) return;

    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    const tab = tabs.find(isUsableTab);
    if (tab?.id) {
      await persistLastBrowserTab(tab.id, tab.url);
    }
  } catch {
    /* window may have closed */
  }
}

export function initBrowserTabTracking(): void {
  void loadPersistedTab().then(() => snapshotBrowserTab());

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    void (async () => {
      try {
        const win = await chrome.windows.get(windowId);
        if (win.type !== "normal") return;
        const tab = await chrome.tabs.get(tabId);
        if (!isUsableTab(tab)) return;
        await persistLastBrowserTab(tabId, tab.url);
        broadcastTabUrlChange(tabId, tab.url);
      } catch {
        /* ignore */
      }
    })();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const nextUrl = changeInfo.url ?? tab.url;
    if (!nextUrl) return;

    if (tabId === lastBrowserTabId) {
      lastBrowserTabUrl = nextUrl;
      void chrome.storage.session.set({
        [SESSION_KEY]: { tabId, tabUrl: nextUrl },
      });
      if (changeInfo.url) {
        broadcastTabUrlChange(tabId, nextUrl);
      }
      return;
    }

    if (changeInfo.url && tab.active) {
      void handlePageUrlChanged(tabId, nextUrl);
    }
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;
    void updateFromWindow(windowId);
  });
}

/** @deprecated Use resolveBrowserTab() — kept for sync callers during migration */
export function getLastBrowserTab(): { tabId?: number; tabUrl?: string } {
  return { tabId: lastBrowserTabId, tabUrl: lastBrowserTabUrl };
}
