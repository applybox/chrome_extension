export interface ExtensionSession {
  authToken: string;
  activeTenantId: string;
}

export async function getExtensionSession(): Promise<ExtensionSession> {
  const stored = await chrome.storage.local.get([
    "authToken",
    "activeTenantId",
    "memberships",
  ]);

  if (!stored.authToken) {
    throw new Error("Not authenticated. Please log in first.");
  }

  let activeTenantId = stored.activeTenantId as string | null | undefined;
  const memberships = (stored.memberships ?? []) as Array<{ tenant: { id: string } }>;

  if (!activeTenantId && memberships.length === 1) {
    activeTenantId = memberships[0].tenant.id;
    await chrome.storage.local.set({ activeTenantId });
  }

  if (!activeTenantId) {
    throw new Error("Please select a tenant before continuing.");
  }

  return {
    authToken: stored.authToken as string,
    activeTenantId,
  };
}
