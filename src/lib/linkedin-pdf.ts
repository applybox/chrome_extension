/**
 * Fetch LinkedIn's native "Save to PDF" export.
 * Injectable functions must be fully self-contained (no outer references).
 */

function getVanityName(profileUrl: string): string | null {
  const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function base64ToPdfBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "application/pdf" });
}

async function isPdfBlob(blob: Blob): Promise<boolean> {
  const header = await blob.slice(0, 4).text();
  return header.startsWith("%PDF");
}

async function downloadPdfFromUrl(pdfUrl: string, cookieHeader: string): Promise<Blob | null> {
  const response = await fetch(pdfUrl, {
    headers: {
      Cookie: cookieHeader,
      accept: "application/pdf,*/*",
      referer: "https://www.linkedin.com/",
    },
  });

  if (!response.ok) return null;

  const blob = await response.blob();
  if (blob.size < 500) return null;
  if (!(await isPdfBlob(blob))) return null;

  return blob.type ? blob : new Blob([blob], { type: "application/pdf" });
}

async function getLinkedInCookieHeader(): Promise<string> {
  const cookieMap = new Map<string, string>();
  for (const domain of ["linkedin.com", ".linkedin.com", "www.linkedin.com"]) {
    const list = await chrome.cookies.getAll({ domain });
    list.forEach((c) => cookieMap.set(c.name, c.value));
  }
  return [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Runs entirely inside the LinkedIn page (MAIN world).
 * Returns base64 PDF bytes from LinkedIn's Save to PDF, or null.
 */
export async function linkedInFetchSaveToPdfBase64(): Promise<string | null> {
  function normalizePdfUrl(url: string): string {
    const cleaned = url.replace(/\\u0026/g, "&").replace(/\\\//g, "/").trim();
    if (cleaned.startsWith("http")) return cleaned;
    if (cleaned.startsWith("/")) return `https://www.linkedin.com${cleaned}`;
    return `https://www.linkedin.com/${cleaned}`;
  }

  function findSaveToPdfUrl(data: unknown): string | null {
    let found: string | null = null;

    function consider(candidate: unknown): void {
      if (found || typeof candidate !== "string") return;
      if (candidate.includes("profile/pdf")) found = normalizePdfUrl(candidate);
    }

    function walk(obj: unknown): void {
      if (!obj || typeof obj !== "object" || found) return;
      if (Array.isArray(obj)) {
        obj.forEach(walk);
        return;
      }
      const record = obj as Record<string, unknown>;
      consider(record.requestUrl);
      const type = String(record.$type || record.actionType || "");
      if (type.includes("SaveToPdf")) consider(record.requestUrl);
      if (record.action && typeof record.action === "object") {
        consider((record.action as Record<string, unknown>).requestUrl);
      }
      Object.values(record).forEach(walk);
    }

    walk(data);
    return found;
  }

  function findPdfUrlInPageHtml(): string | null {
    const html = document.documentElement.innerHTML;
    const match =
      html.match(/https?:\/\/www\.linkedin\.com\/profile\/pdf[^"'\\]+/) ||
      html.match(/\/profile\/pdf\?[^"'\\]+/);
    return match ? normalizePdfUrl(match[0]) : null;
  }

  function getHeaders(): Record<string, string> {
    const csrf =
      document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1]?.replace(/"/g, "") || "";
    const headers: Record<string, string> = {
      accept: "application/vnd.linkedin.normalized+json+2.1",
      "csrf-token": csrf,
      "x-restli-protocol-version": "2.0.0",
      "x-li-lang": "en_US",
    };
    const pageInstance = document
      .querySelector('meta[name="pageInstance"]')
      ?.getAttribute("content");
    if (pageInstance) headers["x-li-page-instance"] = pageInstance;
    return headers;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function pdfUrlFromMoreMenu(): Promise<string | null> {
    const buttons = [
      ...document.querySelectorAll('button, [role="button"], a'),
    ] as HTMLElement[];

    const moreButton =
      buttons.find((el) => {
        const label = (
          el.getAttribute("aria-label") ||
          el.textContent ||
          ""
        ).toLowerCase();
        return (
          label.includes("more actions") ||
          label === "more" ||
          label.startsWith("more ")
        );
      }) || buttons.find((el) => (el.textContent || "").trim() === "More");

    if (!moreButton) return null;

    moreButton.click();
    await sleep(500);

    const menuItems = [
      ...document.querySelectorAll(
        '[role="menuitem"], [role="menu"] button, [role="menu"] a, .artdeco-dropdown__content a, .artdeco-dropdown__content button'
      ),
    ] as HTMLElement[];

    for (const item of menuItems) {
      const text = (item.textContent || "").toLowerCase();
      if (!text.includes("save") || !text.includes("pdf")) continue;

      const href =
        item.getAttribute("href") ||
        item.querySelector("a")?.getAttribute("href") ||
        item.getAttribute("data-request-url");

      if (href?.includes("profile/pdf")) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return normalizePdfUrl(href);
      }
    }

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return null;
  }

  async function fetchPdfBase64(pdfUrl: string): Promise<string | null> {
    try {
      const res = await fetch(pdfUrl, { credentials: "include" });
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength < 500) return null;
      if (!new TextDecoder().decode(new Uint8Array(buffer, 0, 4)).startsWith("%PDF")) {
        return null;
      }
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    } catch {
      return null;
    }
  }

  async function discoverPdfUrl(): Promise<string | null> {
    const match = window.location.href.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (!match) return null;

    const vanity = decodeURIComponent(match[1]);
    const headers = getHeaders();
    const paths = [
      `/voyager/api/identity/profiles/${encodeURIComponent(vanity)}/profileActions`,
      `/voyager/api/identity/dash/profiles/${encodeURIComponent(vanity)}/profileActions`,
    ];

    for (const path of paths) {
      try {
        const res = await fetch(`https://www.linkedin.com${path}`, {
          method: "GET",
          credentials: "include",
          headers,
        });
        if (!res.ok) continue;
        const pdfUrl = findSaveToPdfUrl(await res.json());
        if (pdfUrl) return pdfUrl;
      } catch {
        /* try next */
      }
    }

    const embedded = findPdfUrlInPageHtml();
    if (embedded) return embedded;

    return pdfUrlFromMoreMenu();
  }

  async function clickSaveToPdf(): Promise<string | null> {
    const buttons = [
      ...document.querySelectorAll('button, [role="button"], a'),
    ] as HTMLElement[];

    const moreButton =
      buttons.find((el) => {
        const label = (
          el.getAttribute("aria-label") ||
          el.textContent ||
          ""
        ).toLowerCase();
        return (
          label.includes("more actions") ||
          label === "more" ||
          label.startsWith("more ")
        );
      }) || buttons.find((el) => (el.textContent || "").trim() === "More");

    if (!moreButton) return null;

    moreButton.click();
    await sleep(500);

    const saveItem = [
      ...document.querySelectorAll(
        '[role="menuitem"], [role="menu"] button, [role="menu"] a, .artdeco-dropdown__content a, .artdeco-dropdown__content button'
      ),
    ].find((el) => /save\s+to\s+pdf/i.test(el.textContent || "")) as HTMLElement | undefined;

    if (!saveItem) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return null;
    }

    const href =
      saveItem.getAttribute("href") || saveItem.querySelector("a")?.getAttribute("href");

    if (href?.includes("profile/pdf")) {
      const base64 = await fetchPdfBase64(normalizePdfUrl(href));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return base64;
    }

    saveItem.click();
    await sleep(2500);

    if (window.location.href.includes("profile/pdf")) {
      return fetchPdfBase64(window.location.href);
    }

    return null;
  }

  const pdfUrl = await discoverPdfUrl();
  if (pdfUrl) {
    const base64 = await fetchPdfBase64(pdfUrl);
    if (base64) return base64;
  }

  return clickSaveToPdf();
}

async function runPagePdfScript(tabId: number): Promise<string | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: linkedInFetchSaveToPdfBase64,
    });
    return (result?.result as string | null | undefined) ?? null;
  } catch {
    return null;
  }
}

async function waitForPdfDownload(timeoutMs: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.downloads.onCreated.removeListener(onCreated);
      resolve(blob);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    const onCreated = (item: chrome.downloads.DownloadItem) => {
      if (!item.url?.includes("profile/pdf")) return;
      void (async () => {
        try {
          const cookieHeader = await getLinkedInCookieHeader();
          const blob = await downloadPdfFromUrl(item.url, cookieHeader);
          if (blob) {
            try {
              await chrome.downloads.cancel(item.id);
            } catch {
              /* ignore */
            }
            finish(blob);
          }
        } catch {
          finish(null);
        }
      })();
    };

    chrome.downloads.onCreated.addListener(onCreated);
  });
}

export async function fetchLinkedInPdfFromTab(
  tabId: number,
  tabUrl: string
): Promise<Blob | null> {
  if (!getVanityName(tabUrl)) return null;

  const downloadPromise = waitForPdfDownload(12000);
  const base64 = await runPagePdfScript(tabId);
  const downloadBlob = await downloadPromise;

  if (downloadBlob) return downloadBlob;
  if (base64) return base64ToPdfBlob(base64);

  return null;
}
