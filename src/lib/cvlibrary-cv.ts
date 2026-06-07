/** Fetch candidate CV file from CV-Library recruiter pages. */

export interface CvFileData {
  base64: string;
  mime: string;
  filename: string;
}

export class CvLibraryCvDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CvLibraryCvDownloadError";
  }
}

function extensionFromMime(mime: string, fallback = "pdf"): string {
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || mime.includes("docx")) return "docx";
  if (mime.includes("msword") || mime.includes("doc")) return "doc";
  return fallback;
}

function buildCvFilename(name: { firstName: string; lastName: string }, mime: string): string {
  const slug = [name.firstName, name.lastName]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const ext = extensionFromMime(mime);
  return `${slug || "candidate"}-cv.${ext}`;
}

function filenameFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const base = path.split("/").pop() || "";
    if (/\.(pdf|docx?|rtf)$/i.test(base)) return base;
  } catch {
    /* ignore */
  }
  return null;
}

function detectMimeFromBytes(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes.length >= 2 && bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    return "application/msword";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

function resolveMime(blobMime: string, bytes: Uint8Array, url: string): string {
  const fromBytes = detectMimeFromBytes(bytes);
  if (fromBytes !== "application/octet-stream") return fromBytes;
  if (blobMime && blobMime !== "application/octet-stream" && !blobMime.includes("text/html")) {
    return blobMime;
  }
  const lower = url.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  return fromBytes;
}

function isCvMime(mime: string): boolean {
  return (
    mime.includes("pdf") ||
    mime.includes("msword") ||
    mime.includes("wordprocessingml") ||
    mime.includes("rtf")
  );
}

function isHtmlResponse(bytes: Uint8Array, mime: string): boolean {
  if (mime.includes("text/html")) return true;
  if (bytes.length >= 5) {
    const start = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]).toLowerCase();
    if (start.startsWith("<!do") || start.startsWith("<html")) return true;
  }
  return false;
}

export function isValidCvLibraryDownloadUrl(url: string): boolean {
  const lower = url.toLowerCase().trim();
  if (!lower.startsWith("http") && !lower.startsWith("/")) return false;
  if (/logo|icon|sprite|help|privacy|terms|facebook|twitter|linkedin/i.test(lower)) return false;

  if (/cgi-bin\/cvdownload/i.test(lower)) return true;
  if (/cvdownload|downloadcv|getcv|viewcv|cv_view/i.test(lower)) return true;
  if (/\.(pdf|docx?|rtf)(\?|$|#)/i.test(lower)) return true;
  if (/\/cv\/(?:download|file|export)/i.test(lower)) return true;
  if (/download/i.test(lower) && /cv|cand|resume/i.test(lower)) return true;

  const path = lower.split("?")[0].split("#")[0];
  if (/cv-library\.co\.uk\/(?:candidate|cvview|recruiter\/candidate)\/\d+\/?$/i.test(path)) {
    return false;
  }
  if (/cv-library\.co\.uk\/search/i.test(path)) return false;

  return false;
}

/** Runs in page context — collects CV download URLs, best first. */
export function listCvLibraryDownloadUrls(): string[] {
  function trim(value: string | null | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function absoluteUrl(href: string): string {
    if (href.startsWith("http")) return href;
    if (href.startsWith("/")) return `${window.location.origin}${href}`;
    return href;
  }

  function extractCandidateId(): string | null {
    const href = window.location.href;
    const patterns = [
      /cv-library\.co\.uk\/candidate\/(\d+)/i,
      /cv-library\.co\.uk\/(?:cvview|recruiter\/candidate)\/(\d+)/i,
      /[?&](?:cand(?:idate)?_?id|candidate_id)=(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = href.match(pattern);
      if (match?.[1]) return match[1];
    }

    for (const el of document.querySelectorAll("[data-candidate-id], [data-cand-id], [data-cand]")) {
      const id =
        el.getAttribute("data-candidate-id") ||
        el.getAttribute("data-cand-id") ||
        el.getAttribute("data-cand") ||
        "";
      if (/^\d+$/.test(id)) return id;
    }

    for (const input of document.querySelectorAll(
      'input[name="cand_id"], input[name="candidate_id"], input[name="candId"]'
    )) {
      const value = (input as HTMLInputElement).value?.trim() || "";
      if (/^\d+$/.test(value)) return value;
    }

    return null;
  }

  function isCvDownloadUrl(url: string): boolean {
    const lower = url.toLowerCase().trim();
    if (!lower.startsWith("http") && !lower.startsWith("/")) return false;
    if (/logo|icon|sprite|help|privacy|terms|facebook|twitter|linkedin/i.test(lower)) return false;
    if (/cgi-bin\/cvdownload/i.test(lower)) return true;
    if (/cvdownload|downloadcv|getcv|viewcv|cv_view/i.test(lower)) return true;
    if (/\.(pdf|docx?|rtf)(\?|$|#)/i.test(lower)) return true;
    if (/\/cv\/(?:download|file|export)/i.test(lower)) return true;
    if (/download/i.test(lower) && /cv|cand|resume/i.test(lower)) return true;
    const path = lower.split("?")[0].split("#")[0];
    if (/cv-library\.co\.uk\/(?:candidate|cvview|recruiter\/candidate)\/\d+\/?$/i.test(path)) {
      return false;
    }
    if (/cv-library\.co\.uk\/search/i.test(path)) return false;
    return false;
  }

  const candidates: { url: string; score: number }[] = [];
  const seen = new Set<string>();

  function add(url: string, score: number): void {
    const absolute = absoluteUrl(url);
    if (!absolute || seen.has(absolute) || !isCvDownloadUrl(absolute)) return;
    seen.add(absolute);
    candidates.push({ url: absolute, score });
  }

  const candidateId = extractCandidateId();
  if (candidateId) {
    const origin = window.location.origin;
    add(`${origin}/cgi-bin/cvdownload.cgi?cand_id=${candidateId}`, 12);
    add(`${origin}/cgi-bin/cvdownload.cgi?candidate_id=${candidateId}`, 11);
    add(`${origin}/cgi-bin/cvdownload.cgi?cand_id=${candidateId}&format=original`, 10);
  }

  for (const el of document.querySelectorAll(
    "a[href], button[data-href], button[data-url], [data-download-url], form[action]"
  )) {
    const href =
      (el as HTMLAnchorElement).href ||
      el.getAttribute("data-href") ||
      el.getAttribute("data-url") ||
      el.getAttribute("data-download-url") ||
      el.getAttribute("action") ||
      "";
    if (!href) continue;

    let score = 1;
    const text = trim(el.textContent || "").toLowerCase();
    const lower = href.toLowerCase();
    if (/cgi-bin\/cvdownload/i.test(lower)) score += 10;
    if (/download\s*cv|download cv|get cv|view cv|save cv|original cv/i.test(text)) score += 6;
    if (/download/i.test(text)) score += 2;
    if (/\.pdf(\?|$)/i.test(lower)) score += 3;
    if (/\.docx?(\?|$)/i.test(lower)) score += 3;
    add(href, score);
  }

  for (const el of document.querySelectorAll("a[onclick], button[onclick], [onclick]")) {
    const onclick = el.getAttribute("onclick") || "";
    const matches = onclick.match(/['"]([^'"]*(?:cvdownload|downloadcv|cand_id)[^'"]*)['"]/gi);
    if (matches) {
      for (const match of matches) {
        const cleaned = match.replace(/['"]/g, "");
        add(cleaned, 7);
      }
    }
  }

  for (const iframe of document.querySelectorAll("iframe[src], embed[src], object[data]")) {
    const src =
      iframe.getAttribute("src") ||
      iframe.getAttribute("data") ||
      "";
    if (src && (/\.(pdf|docx?)(\?|$)/i.test(src) || /cvdownload|cvview/i.test(src))) {
      add(src, 5);
    }
  }

  const html = document.documentElement.innerHTML;
  const embeddedPatterns = [
    /https?:\/\/[^"'\\]+cv-library\.co\.uk\/cgi-bin\/cvdownload\.cgi[^"'\\]*/gi,
    /https?:\/\/[^"'\\]+cv-library\.co\.uk[^"'\\]*(?:cvdownload|downloadcv)[^"'\\]*/gi,
    /https?:\/\/[^"'\\]+cv-library\.co\.uk[^"'\\]*\.(?:pdf|docx?)(?:\?[^"'\\]*)?/gi,
    /\/cgi-bin\/cvdownload\.cgi\?[^"'\\]+/gi,
  ];
  for (const pattern of embeddedPatterns) {
    const matches = html.match(pattern);
    if (!matches) continue;
    for (const match of matches) {
      add(match, /cgi-bin\/cvdownload/i.test(match) ? 9 : 4);
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((entry) => entry.url);
}

/** Runs in page context — downloads CV bytes using the recruiter session. */
export async function fetchCvBlobFromPage(
  downloadUrl: string
): Promise<{ base64: string; mime: string; filename: string } | null> {
  function detectMime(bytes: Uint8Array): string {
    if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return "application/pdf";
    }
    if (bytes.length >= 2 && bytes[0] === 0xd0 && bytes[1] === 0xcf) {
      return "application/msword";
    }
    if (
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04
    ) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    return "application/octet-stream";
  }

  function extensionForMime(mime: string): string {
    if (mime.includes("pdf")) return "pdf";
    if (mime.includes("wordprocessingml") || mime.includes("docx")) return "docx";
    if (mime.includes("msword") || mime.includes("doc")) return "doc";
    return "pdf";
  }

  function isCvMimeType(mime: string): boolean {
    return (
      mime.includes("pdf") ||
      mime.includes("msword") ||
      mime.includes("wordprocessingml") ||
      mime.includes("rtf")
    );
  }

  function isHtml(bytes: Uint8Array, mime: string): boolean {
    if (mime.includes("text/html")) return true;
    if (bytes.length >= 5) {
      const start = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]).toLowerCase();
      if (start.startsWith("<!do") || start.startsWith("<html")) return true;
    }
    return false;
  }

  try {
    const url = downloadUrl.startsWith("/")
      ? `${window.location.origin}${downloadUrl}`
      : downloadUrl;

    const res = await fetch(url, {
      credentials: "include",
      redirect: "follow",
      headers: {
        accept:
          "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*",
        referer: window.location.href,
      },
    });

    if (!res.ok) return null;

    const blob = await res.blob();
    if (blob.size < 400) return null;

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let mime = detectMime(bytes);
    if (mime === "application/octet-stream" && blob.type && !blob.type.includes("text/html")) {
      mime = blob.type;
    }
    if (isHtml(bytes, mime) || !isCvMimeType(mime)) return null;

    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    const disposition = res.headers.get("content-disposition") || "";
    const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const fromDisposition = filenameMatch?.[1]?.trim().replace(/"/g, "");
    const ext = extensionForMime(mime);
    const filename = fromDisposition || `candidate-cv.${ext}`;

    return { base64: btoa(binary), mime, filename };
  } catch {
    return null;
  }
}

export function cvFileDataToFile(data: CvFileData): File | null {
  if (!data.base64) return null;

  const binary = atob(data.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (bytes.length < 400) return null;

  const mime = data.mime && data.mime !== "application/octet-stream" ? data.mime : detectMimeFromBytes(bytes);
  if (!isCvMime(mime) || isHtmlResponse(bytes, mime)) return null;

  const filename = data.filename.includes(".")
    ? data.filename
    : `${data.filename}.${extensionFromMime(mime)}`;

  return new File([bytes], filename, { type: mime });
}

async function getCvLibraryCookieHeader(): Promise<string> {
  const cookieMap = new Map<string, string>();
  for (const domain of [
    "cv-library.co.uk",
    ".cv-library.co.uk",
    "cvlibrary.co.uk",
    ".cvlibrary.co.uk",
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
  downloadUrl: string,
  filename: string,
  referer = "https://www.cv-library.co.uk/"
): Promise<CvFileData | null> {
  try {
    const headers: Record<string, string> = {
      Accept:
        "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*",
      Referer: referer,
    };
    if (downloadUrl.includes("cv-library.co.uk")) {
      const cookieHeader = await getCvLibraryCookieHeader();
      if (cookieHeader) headers.Cookie = cookieHeader;
    }

    const res = await fetch(downloadUrl, { credentials: "include", headers });
    if (!res.ok) return null;

    const blob = await res.blob();
    if (blob.size < 400) return null;

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const mime = resolveMime(blob.type, bytes, downloadUrl);
    if (isHtmlResponse(bytes, mime) || !isCvMime(mime)) return null;

    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    const ext = extensionFromMime(mime);
    const name = filename.replace(/\.[^.]+$/, `.${ext}`);

    return { base64: btoa(binary), mime, filename: name };
  } catch {
    return null;
  }
}

async function tryDownloadUrl(
  tabId: number,
  downloadUrl: string,
  fallbackFilename: string,
  referer?: string
): Promise<CvFileData | null> {
  try {
    const [blobResult] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchCvBlobFromPage,
      args: [downloadUrl],
    });
    const payload = blobResult?.result as CvFileData | null | undefined;
    if (payload?.base64) {
      return {
        base64: payload.base64,
        mime: payload.mime,
        filename: payload.filename || fallbackFilename,
      };
    }
  } catch {
    /* fall through */
  }

  return fetchViaExtension(downloadUrl, fallbackFilename, referer);
}

export async function fetchCvLibraryCvData(
  tabId: number,
  name: { firstName: string; lastName: string },
  downloadUrl?: string | null,
  tabUrl?: string | null
): Promise<CvFileData | null> {
  const fallbackFilename = buildCvFilename(name, "application/pdf");
  const referer = tabUrl || "https://www.cv-library.co.uk/";

  let urlsToTry: string[] = [];

  try {
    const [listResult] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: listCvLibraryDownloadUrls,
    });
    const found = listResult?.result as string[] | null | undefined;
    if (Array.isArray(found)) urlsToTry = found;
  } catch {
    /* fall through */
  }

  if (downloadUrl && isValidCvLibraryDownloadUrl(downloadUrl)) {
    urlsToTry = [downloadUrl, ...urlsToTry.filter((url) => url !== downloadUrl)];
  }

  for (const url of urlsToTry) {
    const result = await tryDownloadUrl(tabId, url, fallbackFilename, referer);
    if (result?.base64) return result;
  }

  return null;
}
