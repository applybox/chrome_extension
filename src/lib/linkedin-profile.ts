/**
 * Fetch LinkedIn profile headline via Voyager API using the user's session.
 * Injectable function must be fully self-contained (no outer references).
 */

export async function linkedInVoyagerHeadlineFetch(): Promise<string> {
  const match = window.location.href.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match) return "";

  const vanity = decodeURIComponent(match[1]);
  const csrf =
    document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1]?.replace(/"/g, "") || "";

  const encoded = encodeURIComponent(vanity);
  const paths = [
    `/voyager/api/identity/profiles/${encoded}/profileView`,
    `/voyager/api/identity/profiles/${encoded}/overview`,
    `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encoded}`,
    `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${encoded}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-16`,
  ];

  for (const path of paths) {
    try {
      const res = await fetch(`https://www.linkedin.com${path}`, {
        method: "GET",
        credentials: "include",
        headers: {
          accept: "application/vnd.linkedin.normalized+json+2.1",
          "csrf-token": csrf,
          "x-restli-protocol-version": "2.0.0",
          "x-li-lang": "en_US",
        },
      });
      if (!res.ok) continue;
      const headline = parseHeadlinePayload(await res.json());
      if (headline) return headline;
    } catch {
      /* try next */
    }
  }

  return "";
}

function parseHeadlinePayload(data: unknown): string {
  let headline = "";

  function readHeadlineValue(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text.trim();
    if (typeof record.localized === "string") return record.localized.trim();
    return "";
  }

  function walk(obj: unknown): void {
    if (!obj || typeof obj !== "object" || headline) return;

    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }

    const record = obj as Record<string, unknown>;

    if (!headline) headline = readHeadlineValue(record.headline);
    if (!headline && typeof record.occupation === "string") headline = record.occupation.trim();
    if (!headline) headline = readHeadlineValue(record.multiLocaleHeadline);

    if (Array.isArray(record.included)) {
      record.included.forEach(walk);
    }

    Object.values(record).forEach(walk);
  }

  walk(data);
  return headline;
}

function getVanityName(profileUrl: string): string | null {
  const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

export async function fetchLinkedInHeadlineFromTab(
  tabId: number,
  tabUrl: string
): Promise<string> {
  if (!getVanityName(tabUrl)) return "";

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: linkedInVoyagerHeadlineFetch,
    });
    const value = (result?.result as string | undefined)?.trim();
    if (value) return value;
  } catch {
    /* fall through */
  }

  try {
    const vanity = getVanityName(tabUrl)!;
    const cookieMap = new Map<string, string>();
    for (const domain of ["linkedin.com", ".linkedin.com", "www.linkedin.com"]) {
      const list = await chrome.cookies.getAll({ domain });
      list.forEach((c) => cookieMap.set(c.name, c.value));
    }
    if (!cookieMap.size) return "";

    const cookieHeader = [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const csrfToken = (cookieMap.get("JSESSIONID") || "").replace(/"/g, "");

    const url = `https://www.linkedin.com/voyager/api/identity/profiles/${encodeURIComponent(vanity)}/profileView`;
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "csrf-token": csrfToken,
        "x-restli-protocol-version": "2.0.0",
        Cookie: cookieHeader,
      },
    });
    if (!response.ok) return "";
    return parseHeadlinePayload(await response.json());
  } catch {
    return "";
  }
}
