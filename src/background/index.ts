import type { Candidate } from "@/types";
import {
  clearAuth,
  completeTokenLogin,
  getAuthState,
  refreshAuthProfile,
  loginWithSSO,
  loginWithOtp,
  loginWithPassword,
  requestOtp,
  setActiveTenant,
} from "@/lib/auth";
import { handlePageUrlChanged, initBrowserTabTracking, resolveBrowserTab } from "@/lib/browser-tab";
import { submitCandidateWithPdf } from "@/lib/candidate-submit";
import { getExtensionSession } from "@/lib/extension-session";
import { fetchCandidateFromTab } from "@/lib/candidate-fetch";
import { initAppWindowTracking, openOrFocusAppWindow } from "@/lib/popup-window";

initBrowserTabTracking();
initAppWindowTracking();

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "pageUrlChanged" && sender.tab?.id && message.tabUrl) {
    void handlePageUrlChanged(sender.tab.id, message.tabUrl as string);
    sendResponse({ success: true });
    return true;
  }

  handleMessage(message)
    .then(sendResponse)
    .catch((err: Error) => sendResponse({ success: false, error: err.message }));
  return true;
});

async function handleMessage(message: { action: string; [key: string]: unknown }) {
  switch (message.action) {
    case "checkAuth": {
      const state = await ensureActiveTenant(await refreshAuthProfile());
      return { success: true, ...state };
    }

    case "login":
      return {
        success: true,
        ...(await loginWithPassword(
          (message.credentials as { email: string; password: string }).email,
          (message.credentials as { email: string; password: string }).password
        )),
      };

    case "requestOtp":
      return {
        success: true,
        ...(await requestOtp(
          (message.data as { identifier: string; type: "email" | "sms" }).identifier,
          (message.data as { identifier: string; type: "email" | "sms" }).type
        )),
      };

    case "loginOtp":
      return {
        success: true,
        ...(await loginWithOtp(
          (message.data as { identifier: string; code: string; type: "email" | "sms" }).identifier,
          (message.data as { identifier: string; code: string; type: "email" | "sms" }).code,
          (message.data as { identifier: string; code: string; type: "email" | "sms" }).type
        )),
      };

    case "initiateSSO": {
      const provider = message.provider as "google" | "microsoft";
      return {
        success: true,
        ...(await loginWithSSO(provider)),
      };
    }

    case "completeSSOLogin":
      return {
        success: true,
        ...(await completeTokenLogin(message.token as string)),
      };

    case "setActiveTenant":
      await setActiveTenant(message.tenantId as string);
      return { success: true, ...(await getAuthState()) };

    case "logout":
      await clearAuth();
      return { success: true };

    case "openInWindow":
      await openOrFocusAppWindow();
      return { success: true };

    case "getBrowserTab":
      return { success: true, ...(await resolveBrowserTab()) };

    case "fetchCandidate": {
      let tabId = message.tabId as number | undefined;
      let tabUrl = message.tabUrl as string | undefined;
      if (!tabId || !tabUrl) {
        const resolved = await resolveBrowserTab();
        tabId = resolved.tabId;
        tabUrl = resolved.tabUrl;
      }
      if (!tabId || !tabUrl) {
        return {
          success: false,
          error: "No browser tab found. Open a candidate profile in Chrome first.",
        };
      }
      return {
        success: true,
        ...(await fetchCandidateFromTab(tabId, tabUrl)),
      };
    }

    case "submitCandidate":
      return handleCandidateSubmission(
        message.candidate as Candidate,
        message.tabId as number | undefined,
        message.tabUrl as string | undefined,
        message.attachPdf as boolean | undefined
      );

    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

async function ensureActiveTenant(state: Awaited<ReturnType<typeof getAuthState>>) {
  if (state.activeTenantId || state.memberships.length !== 1) {
    return state;
  }

  const tenantId = state.memberships[0]?.tenant?.id;
  if (!tenantId) return state;

  await setActiveTenant(tenantId);
  return getAuthState();
}

async function handleCandidateSubmission(
  candidate: Candidate,
  tabId?: number,
  tabUrl?: string,
  attachPdf = true
) {
  const { authToken, activeTenantId } = await getExtensionSession();

  let resolvedTabUrl = tabUrl;
  if (tabId && !resolvedTabUrl) {
    try {
      const tab = await chrome.tabs.get(tabId);
      resolvedTabUrl = tab.url;
    } catch {
      /* ignore */
    }
  }

  const result = await submitCandidateWithPdf(candidate, {
    authToken,
    activeTenantId,
    tabId,
    tabUrl: resolvedTabUrl,
    attachPdf,
  });

  return {
    success: true,
    data: result.candidate,
    pdfUploaded: result.pdfUploaded,
    alreadyExists: result.alreadyExists,
    profileUrl: result.profileUrl,
    message: result.message,
    pdfError: result.pdfError,
  };
}
