import { sendMessage } from "./messaging";

function isUsableUrl(url?: string): boolean {
  if (!url) return false;
  return !url.startsWith("chrome://") && !url.startsWith("chrome-extension://");
}

/** Active tab in the browser window that hosts the side panel. */
export async function getBrowserTab(): Promise<{ tabId?: number; tabUrl?: string }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && isUsableUrl(tab.url)) {
      return { tabId: tab.id, tabUrl: tab.url };
    }
  } catch {
    /* fall through to background resolver */
  }

  const result = await sendMessage<{
    success: boolean;
    tabId?: number;
    tabUrl?: string;
  }>({ action: "getBrowserTab" });

  return { tabId: result.tabId, tabUrl: result.tabUrl };
}
