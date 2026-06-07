import { snapshotBrowserTab } from "./browser-tab";

const POPUP_PAGE = "src/popup/index.html";
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 680;
const WINDOW_SESSION_KEY = "appWindowId";

export async function openOrFocusAppWindow(): Promise<void> {
  await snapshotBrowserTab();

  const stored = await chrome.storage.session.get(WINDOW_SESSION_KEY);
  const existingId = stored[WINDOW_SESSION_KEY] as number | undefined;

  if (existingId) {
    try {
      await chrome.windows.get(existingId);
      await chrome.windows.update(existingId, { focused: true });
      return;
    } catch {
      await chrome.storage.session.remove(WINDOW_SESSION_KEY);
    }
  }

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL(POPUP_PAGE),
    type: "popup",
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    focused: true,
  });

  if (created.id) {
    await chrome.storage.session.set({ [WINDOW_SESSION_KEY]: created.id });
  }
}

export function initAppWindowTracking(): void {
  chrome.windows.onRemoved.addListener((windowId) => {
    void chrome.storage.session.get(WINDOW_SESSION_KEY).then((stored) => {
      if (stored[WINDOW_SESSION_KEY] === windowId) {
        void chrome.storage.session.remove(WINDOW_SESSION_KEY);
      }
    });
  });
}

export async function isStandaloneWindow(): Promise<boolean> {
  try {
    const win = await chrome.windows.getCurrent();
    return win.type === "popup";
  } catch {
    return false;
  }
}
