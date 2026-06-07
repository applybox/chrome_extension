/** Fetch profile headshot image for upload and preview. */

export interface HeadshotData {
  base64: string;
  mime: string;
  filename: string;
}

export interface HeadshotImagePayload {
  base64: string;
  mime: string;
}

function buildHeadshotFilename(name: { firstName: string; lastName: string }, mime: string): string {
  const slug = [name.firstName, name.lastName]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const ext = extensionFromMime(mime);
  return `${slug || "candidate"}-headshot.${ext}`;
}

function extensionFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

function detectMimeFromBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

function resolveMime(blobMime: string, bytes: Uint8Array): string {
  if (blobMime.startsWith("image/")) return blobMime;
  return detectMimeFromBytes(bytes);
}

/** Generic branding/OG images — not a candidate headshot. */
export function isGenericHeadshotUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /share-image|indeed-share|default-avatar|placeholder|logo|icon|sprite|favicon|1x1|pixel|blank\.(gif|png|jpg|webp)/i.test(
      lower
    ) || /contentstack\.io\/.*share/i.test(lower)
  );
}

function payloadToHeadshotData(
  payload: HeadshotImagePayload,
  name: { firstName: string; lastName: string }
): HeadshotData {
  const mime = payload.mime.startsWith("image/") ? payload.mime : "image/jpeg";
  return {
    base64: payload.base64,
    mime,
    filename: buildHeadshotFilename(name, mime),
  };
}

async function blobToBase64Payload(blob: Blob, mime: string): Promise<HeadshotImagePayload> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return { base64: btoa(binary), mime };
}

/** Apply EXIF orientation — outputs upright JPEG without rotation metadata. */
async function orientBlobToPayload(blob: Blob): Promise<HeadshotImagePayload | null> {
  if (blob.size < 80) return null;

  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const oriented = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    return blobToBase64Payload(oriented, "image/jpeg");
  } catch {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = resolveMime(blob.type, bytes);
    if (!mime.startsWith("image/")) return null;
    return blobToBase64Payload(blob, mime);
  }
}

/**
 * Self-contained — injected into the page via chrome.scripting.executeScript.
 * Must not reference module-level symbols.
 */
export async function fetchImageBase64FromPage(imageUrl: string): Promise<HeadshotImagePayload | null> {
  function normalizeImageUrl(url: string): string | null {
    const trimmed = (url || "").trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("data:image/")) return trimmed;
    if (trimmed.startsWith("blob:")) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return `${window.location.origin}${trimmed}`;
    if (trimmed.startsWith("http")) return trimmed;
    return null;
  }

  function payloadFromDataUrl(dataUrl: string): HeadshotImagePayload | null {
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match?.[2] || match[2].length < 100) return null;
    return { mime: match[1], base64: match[2] };
  }

  async function orientBlob(blob: Blob): Promise<HeadshotImagePayload | null> {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!match?.[2] || match[2].length < 100) return null;
      return { mime: "image/jpeg", base64: match[2] };
    } catch {
      return null;
    }
  }

  try {
    const normalized = normalizeImageUrl(imageUrl);
    if (!normalized) return null;

    if (normalized.startsWith("data:image/")) {
      const parsed = payloadFromDataUrl(normalized);
      if (!parsed) return null;
      const bytes = Uint8Array.from(atob(parsed.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: parsed.mime });
      return (await orientBlob(blob)) || parsed;
    }

    let credentials: RequestCredentials = "omit";
    try {
      const target = new URL(normalized);
      const page = new URL(document.location.href);
      if (target.origin === page.origin) credentials = "include";
      else if (/cvlibrary\.co\.uk|cv-library\.co\.uk/i.test(target.hostname)) credentials = "include";
    } catch {
      /* omit */
    }

    const res = await fetch(normalized, {
      credentials,
      referrer: document.location.href,
      referrerPolicy: "strict-origin-when-cross-origin",
      headers: { Accept: "image/*,*/*" },
    });
    if (!res.ok) return null;

    const blob = await res.blob();
    return orientBlob(blob);
  } catch {
    return null;
  }
}

/**
 * Self-contained — finds CV-Library candidate photo URL (e.g. photo.cvlibrary.co.uk).
 */
export function findCvLibraryPhotoUrl(): string {
  function upgrade(url: string): string {
    return url.replace(/candidate-photo-\d+x\d+/i, "candidate-photo-480x480");
  }

  const prioritySelectors = [
    "#imageModal img",
    ".cand-image-modal img",
    ".image-modal img",
    ".cvl-modal.image-modal img",
    'img[src*="photo.cvlibrary.co.uk"]',
    'img[src*="candidate-photo"]',
  ];

  for (const selector of prioritySelectors) {
    const img = document.querySelector(selector);
    if (!(img instanceof HTMLImageElement)) continue;
    const src = img.currentSrc || img.src || img.getAttribute("src") || "";
    if (src.includes("photo.cvlibrary.co.uk") || src.includes("candidate-photo")) {
      const normalized = src.startsWith("http") ? src : src.startsWith("//") ? `https:${src}` : "";
      if (normalized) return upgrade(normalized);
    }
  }

  const embedded = document.documentElement.innerHTML.match(
    /https?:\/\/photo\.cvlibrary\.co\.uk\/candidate-photo[^"'\\s<]+/i
  );
  if (embedded?.[0]) return upgrade(embedded[0]);

  return "";
}

/**
 * Self-contained — injected into the page via chrome.scripting.executeScript.
 */
export async function captureHeadshotFromPage(): Promise<HeadshotImagePayload | null> {
  const selectors = [
    "#imageModal img",
    ".cand-image-modal img",
    ".image-modal img",
    ".cvl-modal.image-modal img",
    'img[src*="photo.cvlibrary.co.uk"]',
    'img[src*="candidate-photo"]',
    'img[data-testid*="profile"]',
    'img[data-testid*="avatar"]',
    'img[data-testid*="headshot"]',
    'img[data-testid*="photo"]',
    "[class*='resume-photo'] img",
    "[class*='applicant-photo'] img",
    "[data-view-name='profile-top-card-member-photo'] img",
    "img.pv-top-card-profile-picture__image",
    "button.pv-top-card-profile-picture img",
    ".pv-top-card-profile-picture__container img",
    ".candidate-photo img",
    ".profile-image img",
    ".cv-photo img",
    "[data-testid='candidate-photo'] img",
    "img[class*='profile-picture']",
    "img[class*='profile-photo']",
    "img[class*='avatar']",
    "img[class*='photo']",
    "img[class*='headshot']",
  ];

  function normalizeImageUrl(url: string): string | null {
    const trimmed = (url || "").trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("data:image/")) return trimmed;
    if (trimmed.startsWith("blob:")) return trimmed;
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("/")) return `${window.location.origin}${trimmed}`;
    if (trimmed.startsWith("http")) return trimmed;
    return null;
  }

  function resolveProfileImageSrc(img: HTMLImageElement): string | null {
    const candidates = [
      img.currentSrc,
      img.src,
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("data-original"),
    ].filter(Boolean) as string[];

    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const parts = srcset
        .split(",")
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean);
      if (parts.length) candidates.push(parts[parts.length - 1]);
    }

    for (const candidate of candidates) {
      const normalized = normalizeImageUrl(candidate);
      if (normalized) return normalized;
    }
    return null;
  }

  function isBadImage(url: string, img: HTMLImageElement): boolean {
    if (url.includes("photo.cvlibrary.co.uk") || url.includes("candidate-photo")) {
      return false;
    }
    const lower = url.toLowerCase();
    if (
      /logo|icon|sprite|placeholder|blank|spacer|1x1|pixel|default-avatar|share-image|indeed-share/i.test(
        lower
      ) ||
      /contentstack\.io\/.*share/i.test(lower)
    ) {
      return true;
    }
    if (img.width > 0 && img.width < 24 && img.height > 0 && img.height < 24) return true;
    return false;
  }

  function shouldIncludeCredentialsForUrl(url: string): boolean {
    try {
      const target = new URL(url);
      const page = new URL(window.location.href);
      if (target.origin === page.origin) return true;
      if (/cvlibrary\.co\.uk|cv-library\.co\.uk/i.test(target.hostname)) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function payloadFromDataUrl(dataUrl: string): HeadshotImagePayload | null {
    const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match?.[2] || match[2].length < 100) return null;
    return { mime: match[1], base64: match[2] };
  }

  async function orientBlob(blob: Blob): Promise<HeadshotImagePayload | null> {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!match?.[2] || match[2].length < 100) return null;
      return { mime: "image/jpeg", base64: match[2] };
    } catch {
      return null;
    }
  }

  async function waitForImage(img: HTMLImageElement): Promise<void> {
    if (img.complete && img.naturalWidth > 0) return;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("timeout")), 4000);
      img.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("error"));
      };
    });
  }

  /** Capture pixels as shown in the browser (correct on-screen orientation). */
  async function captureFromRenderedImg(img: HTMLImageElement): Promise<HeadshotImagePayload | null> {
    try {
      await waitForImage(img);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w < 24 || h < 24) return null;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!match?.[2] || match[2].length < 100) return null;
      return { mime: "image/jpeg", base64: match[2] };
    } catch {
      return null;
    }
  }

  async function fetchUrl(imageUrl: string): Promise<HeadshotImagePayload | null> {
    try {
      const normalized = normalizeImageUrl(imageUrl);
      if (!normalized) return null;
      if (normalized.startsWith("data:image/")) {
        const parsed = payloadFromDataUrl(normalized);
        if (!parsed) return null;
        const bytes = Uint8Array.from(atob(parsed.base64), (c) => c.charCodeAt(0));
        return orientBlob(new Blob([bytes], { type: parsed.mime }));
      }

      const res = await fetch(normalized, {
        credentials: shouldIncludeCredentialsForUrl(normalized) ? "include" : "omit",
        referrer: window.location.href,
        referrerPolicy: "strict-origin-when-cross-origin",
        headers: { Accept: "image/*,*/*" },
      });
      if (!res.ok) return null;

      const blob = await res.blob();
      return orientBlob(blob);
    } catch {
      return null;
    }
  }

  function resolveCvLibraryPhotoUrl(): string {
    function upgrade(url: string): string {
      return url.replace(/candidate-photo-\d+x\d+/i, "candidate-photo-480x480");
    }

    const prioritySelectors = [
      "#imageModal img",
      ".cand-image-modal img",
      ".image-modal img",
      ".cvl-modal.image-modal img",
      'img[src*="photo.cvlibrary.co.uk"]',
      'img[src*="candidate-photo"]',
    ];

    for (const selector of prioritySelectors) {
      const img = document.querySelector(selector);
      if (!(img instanceof HTMLImageElement)) continue;
      const src = img.currentSrc || img.src || img.getAttribute("src") || "";
      if (src.includes("photo.cvlibrary.co.uk") || src.includes("candidate-photo")) {
        const normalized = src.startsWith("http")
          ? src
          : src.startsWith("//")
            ? `https:${src}`
            : "";
        if (normalized) return upgrade(normalized);
      }
    }

    const embedded = document.documentElement.innerHTML.match(
      /https?:\/\/photo\.cvlibrary\.co\.uk\/candidate-photo[^"'\\s<]+/i
    );
    if (embedded?.[0]) return upgrade(embedded[0]);

    return "";
  }

  const cvPrioritySelectors = [
    "#imageModal img",
    ".cand-image-modal img",
    ".image-modal img",
    ".cvl-modal.image-modal img",
    'img[src*="photo.cvlibrary.co.uk"]',
    'img[src*="candidate-photo"]',
  ];

  for (const selector of cvPrioritySelectors) {
    const img = document.querySelector(selector);
    if (img instanceof HTMLImageElement) {
      const rendered = await captureFromRenderedImg(img);
      if (rendered) return rendered;
    }
  }

  const cvPhotoUrl = resolveCvLibraryPhotoUrl();
  if (cvPhotoUrl) {
    const payload = await fetchUrl(cvPhotoUrl);
    if (payload) return payload;
  }

  const seen = new Set<string>();

  for (const selector of selectors) {
    for (const img of document.querySelectorAll(selector)) {
      if (!(img instanceof HTMLImageElement)) continue;

      const src = resolveProfileImageSrc(img);
      if (!src || seen.has(src) || isBadImage(src, img)) continue;
      seen.add(src);

      const rendered = await captureFromRenderedImg(img);
      if (rendered) return rendered;

      const payload = await fetchUrl(src);
      if (payload) return payload;
    }
  }

  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
  const ogNormalized = normalizeImageUrl(ogImage);
  if (ogNormalized && !seen.has(ogNormalized)) {
    return fetchUrl(ogNormalized);
  }

  return null;
}

export function headshotDataToFile(data: HeadshotData): File | null {
  if (!data.base64) return null;

  const binary = atob(data.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (bytes.length < 80) return null;

  const mime = data.mime.startsWith("image/") ? data.mime : detectMimeFromBytes(bytes);
  const filename = data.filename.replace(/\.[^.]+$/, `.${extensionFromMime(mime)}`);

  return new File([bytes], filename, { type: mime });
}

export function headshotDataToPreviewUrl(data: HeadshotData): string {
  return `data:${data.mime};base64,${data.base64}`;
}

async function getCvLibraryCookieHeader(): Promise<string> {
  const cookieMap = new Map<string, string>();
  for (const domain of [
    "cv-library.co.uk",
    ".cv-library.co.uk",
    "cvlibrary.co.uk",
    ".cvlibrary.co.uk",
    "photo.cvlibrary.co.uk",
  ]) {
    try {
      const list = await chrome.cookies.getAll({ domain });
      list.forEach((cookie) => cookieMap.set(cookie.name, cookie.value));
    } catch {
      /* ignore */
    }
  }
  return [...cookieMap.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function fetchViaExtension(
  imageUrl: string,
  name: { firstName: string; lastName: string },
  referer = "https://www.cv-library.co.uk/"
): Promise<HeadshotData | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "image/*,*/*",
      Referer: referer,
    };
    if (imageUrl.includes("cvlibrary.co.uk")) {
      const cookieHeader = await getCvLibraryCookieHeader();
      if (cookieHeader) headers.Cookie = cookieHeader;
    }

    const useCredentials =
      imageUrl.includes("cvlibrary.co.uk") || imageUrl.includes("cv-library.co.uk");
    const res = await fetch(imageUrl, {
      credentials: useCredentials ? "include" : "omit",
      headers,
    });
    if (!res.ok) return null;

    const blob = await res.blob();
    const oriented = await orientBlobToPayload(blob);
    if (!oriented) return null;

    return payloadToHeadshotData(oriented, name);
  } catch {
    return null;
  }
}

async function captureFromDom(tabId: number): Promise<HeadshotImagePayload | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: captureHeadshotFromPage,
    });
    return (result?.result as HeadshotImagePayload | null | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function fetchHeadshotData(
  tabId: number,
  imageUrl: string,
  name: { firstName: string; lastName: string }
): Promise<HeadshotData | null> {
  const trimmed = imageUrl?.trim();
  if (trimmed) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: fetchImageBase64FromPage,
        args: [trimmed],
      });
      const payload = result?.result as HeadshotImagePayload | null | undefined;
      if (payload?.base64) {
        return payloadToHeadshotData(payload, name);
      }
    } catch {
      /* fall through */
    }

    const normalized =
      trimmed.startsWith("http") || trimmed.startsWith("data:")
        ? trimmed
        : trimmed.startsWith("//")
          ? `https:${trimmed}`
          : null;
    if (normalized) {
      const viaExtension = await fetchViaExtension(normalized, name);
      if (viaExtension) return viaExtension;
    }
  }

  const fromDom = await captureFromDom(tabId);
  return fromDom ? payloadToHeadshotData(fromDom, name) : null;
}

export async function fetchHeadshotFromTab(
  tabId: number,
  name: { firstName: string; lastName: string },
  imageUrl?: string | null,
  options?: { cvLibrary?: boolean; preferDomCapture?: boolean }
): Promise<HeadshotData | null> {
  const trimmedUrl = imageUrl?.trim() || "";
  const skipUrlFetch = trimmedUrl && isGenericHeadshotUrl(trimmedUrl);

  if (options?.preferDomCapture || skipUrlFetch) {
    const fromDom = await captureFromDom(tabId);
    if (fromDom) return payloadToHeadshotData(fromDom, name);
  }

  if (options?.cvLibrary) {
    try {
      const [urlResult] = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: findCvLibraryPhotoUrl,
      });
      const cvPhotoUrl = (urlResult?.result as string) || "";
      if (cvPhotoUrl) {
        const fromCvPhoto = await fetchHeadshotData(tabId, cvPhotoUrl, name);
        if (fromCvPhoto) return fromCvPhoto;
      }
    } catch {
      /* fall through */
    }
  }

  if (trimmedUrl && !skipUrlFetch) {
    const fromUrl = await fetchHeadshotData(tabId, trimmedUrl, name);
    if (fromUrl) return fromUrl;
  }

  const fromDom = await captureFromDom(tabId);
  return fromDom ? payloadToHeadshotData(fromDom, name) : null;
}
