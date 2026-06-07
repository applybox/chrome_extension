import type { AuthMeResponse, AuthState, LoginResponse, TenantMembership, User } from "@/types";
import { apiFetch } from "@/lib/api";

const STORAGE_KEYS = [
  "authToken",
  "currentUser",
  "activeTenantId",
  "memberships",
] as const;

export function getFrontendOrigin(): string {
  return import.meta.env.VITE_FRONTEND_URL ?? "https://app.applybox.co.uk";
}

export async function refreshAuthProfile(): Promise<AuthState> {
  const state = await getAuthState();
  if (!state.token) return state;

  try {
    const me = await apiFetch<AuthMeResponse>("/auth/me", { token: state.token });
    await storeSession(state.token, me.user, me.memberships, state.activeTenantId);
    return getAuthState();
  } catch {
    return state;
  }
}

export async function getAuthState(): Promise<AuthState> {
  const result = await chrome.storage.local.get(STORAGE_KEYS);
  return {
    isLoggedIn: !!result.authToken,
    user: result.currentUser ?? null,
    token: result.authToken ?? null,
    activeTenantId: result.activeTenantId ?? null,
    memberships: result.memberships ?? [],
  };
}

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove([...STORAGE_KEYS]);
}

export async function storeSession(
  token: string,
  user: User,
  memberships: TenantMembership[],
  activeTenantId?: string | null
): Promise<void> {
  await chrome.storage.local.set({
    authToken: token,
    currentUser: {
      id: user.id,
      name: user.name,
      email: user.email,
      headshot_url: user.headshot_url ?? null,
    },
    memberships,
    activeTenantId: activeTenantId ?? null,
  });
}

export async function loginWithPassword(
  email: string,
  password: string
): Promise<AuthState> {
  const data = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const me = await apiFetch<AuthMeResponse>("/auth/me", {
    token: data.token,
  });

  let activeTenantId: string | null = null;
  if (me.memberships.length === 1) {
    activeTenantId = me.memberships[0].tenant.id;
    await apiFetch("/auth/active-tenant", {
      method: "POST",
      token: data.token,
      body: JSON.stringify({ tenant_id: activeTenantId }),
    });
  }

  await storeSession(data.token, me.user, me.memberships, activeTenantId);

  return {
    isLoggedIn: true,
    user: me.user,
    token: data.token,
    activeTenantId,
    memberships: me.memberships,
  };
}

export async function requestOtp(
  identifier: string,
  type: "email" | "sms"
): Promise<{ expires_in?: number }> {
  return apiFetch("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ identifier, type }),
  });
}

export async function loginWithOtp(
  identifier: string,
  code: string,
  type: "email" | "sms"
): Promise<AuthState> {
  const data = await apiFetch<LoginResponse>("/auth/login-otp", {
    method: "POST",
    body: JSON.stringify({ identifier, code, type }),
  });

  const me = await apiFetch<AuthMeResponse>("/auth/me", {
    token: data.token,
  });

  let activeTenantId: string | null = null;
  if (me.memberships.length === 1) {
    activeTenantId = me.memberships[0].tenant.id;
    await apiFetch("/auth/active-tenant", {
      method: "POST",
      token: data.token,
      body: JSON.stringify({ tenant_id: activeTenantId }),
    });
  }

  await storeSession(data.token, me.user, me.memberships, activeTenantId);

  return {
    isLoggedIn: true,
    user: me.user,
    token: data.token,
    activeTenantId,
    memberships: me.memberships,
  };
}

export async function completeTokenLogin(token: string): Promise<AuthState> {
  const me = await apiFetch<AuthMeResponse>("/auth/me", { token });

  let activeTenantId: string | null = null;
  if (me.memberships.length === 1) {
    activeTenantId = me.memberships[0].tenant.id;
    await apiFetch("/auth/active-tenant", {
      method: "POST",
      token,
      body: JSON.stringify({ tenant_id: activeTenantId }),
    });
  }

  await storeSession(token, me.user, me.memberships, activeTenantId);

  return {
    isLoggedIn: true,
    user: me.user,
    token,
    activeTenantId,
    memberships: me.memberships,
  };
}

export async function setActiveTenant(tenantId: string): Promise<void> {
  const { authToken } = await chrome.storage.local.get(["authToken"]);
  if (!authToken) throw new Error("Not authenticated");

  await apiFetch("/auth/active-tenant", {
    method: "POST",
    token: authToken,
    body: JSON.stringify({ tenant_id: tenantId }),
  });

  await chrome.storage.local.set({ activeTenantId: tenantId });
}

export function getSSOUrl(provider: "google" | "microsoft"): string {
  // Use the same web app /callback URL as the frontend — avoids chrome.identity
  // and chrome-extension://invalid/ issues on unpacked extensions.
  const callbackUrl = `${getFrontendOrigin()}/callback`;
  const origin =
    import.meta.env.VITE_API_URL?.replace(/\/api$/, "") ?? "https://api.applybox.co.uk";
  return `${origin}/api/auth/${provider}/redirect?callback=${encodeURIComponent(callbackUrl)}`;
}

function isCallbackUrl(url: string, frontendOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    const origin = new URL(frontendOrigin).origin;
    return parsed.origin === origin && parsed.pathname === "/callback";
  } catch {
    return false;
  }
}

export async function loginWithSSO(
  provider: "google" | "microsoft"
): Promise<AuthState> {
  const ssoUrl = getSSOUrl(provider);
  const frontendOrigin = getFrontendOrigin();

  const tab = await chrome.tabs.create({ url: ssoUrl, active: true });
  if (!tab.id) throw new Error("Failed to open sign-in tab");

  return new Promise<AuthState>((resolve, reject) => {
    let completed = false;

    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };

    const timeout = setTimeout(() => {
      if (completed) return;
      completed = true;
      cleanup();
      chrome.tabs.remove(tab.id!).catch(() => {});
      reject(new Error("Sign in timed out. Please try again."));
    }, 5 * 60 * 1000);

    const onRemoved = (tabId: number) => {
      if (tabId !== tab.id || completed) return;
      completed = true;
      clearTimeout(timeout);
      cleanup();
      reject(new Error("Sign in was cancelled"));
    };

    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (tabId !== tab.id || completed || !changeInfo.url) return;
      if (!isCallbackUrl(changeInfo.url, frontendOrigin)) return;

      const params = new URL(changeInfo.url).searchParams;
      const error = params.get("error");

      if (error) {
        completed = true;
        clearTimeout(timeout);
        cleanup();
        chrome.tabs.remove(tabId).catch(() => {});
        if (error === "user_not_found") {
          reject(new Error("Account not found. Please sign up on Applybox first."));
        } else {
          reject(new Error(`Authentication failed: ${error}`));
        }
        return;
      }

      const token = params.get("token");
      const success = params.get("success");
      if (token && success === "1") {
        completed = true;
        clearTimeout(timeout);
        cleanup();
        chrome.tabs.remove(tabId).catch(() => {});
        completeTokenLogin(token).then(resolve).catch(reject);
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}
