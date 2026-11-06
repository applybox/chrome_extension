/**
 * Fetch candidate CV bytes from the employers.indeed.com applicant-review page.
 *
 * The page's "Download CV" link is a page-local `blob:` URL created client-side by
 * react-pdf after it fetched the file — it isn't a stable, re-fetchable server URL like
 * CV-Library's. So we fetch it once, in the page's own context, while the tab holding
 * that blob is still open.
 */
import type { CvFileData } from "./cvlibrary-cv";

function buildCvFilename(name: { firstName: string; lastName: string }, mime: string): string {
  const slug = [name.firstName, name.lastName]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const ext = mime.includes("pdf") ? "pdf" : "pdf";
  return `${slug || "candidate"}-cv.${ext}`;
}

/** Runs in page (MAIN world) context — blob: URLs only resolve in the document that created them. */
export async function fetchBlobUrlAsBase64(
  blobUrl: string
): Promise<{ base64: string; mime: string } | null> {
  try {
    const res = await fetch(blobUrl);
    if (!res.ok) return null;

    const blob = await res.blob();
    if (blob.size < 400) return null;

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

    return { base64: btoa(binary), mime: blob.type || "application/pdf" };
  } catch {
    return null;
  }
}

export async function fetchIndeedEmployerCvData(
  tabId: number,
  name: { firstName: string; lastName: string },
  blobUrl: string | null | undefined
): Promise<CvFileData | null> {
  if (!blobUrl || !blobUrl.startsWith("blob:")) return null;

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchBlobUrlAsBase64,
      args: [blobUrl],
    });
    const payload = result?.result;
    if (!payload?.base64) return null;

    return {
      base64: payload.base64,
      mime: payload.mime,
      filename: buildCvFilename(name, payload.mime),
    };
  } catch {
    return null;
  }
}
