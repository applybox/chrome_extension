import { detectSource } from "./candidate-fetch";
import {
  cvFileDataToFile,
  CvLibraryCvDownloadError,
  fetchCvLibraryCvData,
} from "./cvlibrary-cv";
import { fetchLinkedInPdfFromTab } from "./linkedin-pdf";

export class LinkedInPdfCaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedInPdfCaptureError";
  }
}

/** Capture profile PDF — LinkedIn Save to PDF when available, else browser print. */
export async function captureProfilePdf(tabId: number, tabUrl?: string): Promise<Blob> {
  const file = await fetchProfileCvFile(tabId, tabUrl);
  return file;
}

/** Fetch CV/resume file for the current profile tab. */
export async function fetchProfileCvFile(
  tabId: number,
  tabUrl: string | undefined,
  candidate?: { firstName: string; lastName: string; source?: string },
  downloadUrl?: string | null
): Promise<File> {
  const source = tabUrl ? detectSource(tabUrl) : null;
  const name = {
    firstName: candidate?.firstName || "candidate",
    lastName: candidate?.lastName || "",
  };

  if (source === "cvlibrary") {
    const cvData = await fetchCvLibraryCvData(tabId, name, downloadUrl, tabUrl);
    const file = cvData ? cvFileDataToFile(cvData) : null;
    if (file) return file;

    throw new CvLibraryCvDownloadError(
      "Could not download the CV from CV-Library. Stay logged in as a recruiter, open the candidate profile, " +
        "and ensure the Download CV option is available. You can also attach a CV file manually."
    );
  }

  if (source === "linkedin" && tabUrl) {
    const linkedInPdf = await fetchLinkedInPdfFromTab(tabId, tabUrl);
    if (linkedInPdf) {
      return new File([linkedInPdf], buildPdfFilename({ ...name, source: "linkedin" }), {
        type: "application/pdf",
      });
    }

    throw new LinkedInPdfCaptureError(
      "Could not get LinkedIn Save to PDF. Stay logged into LinkedIn, open the profile (/in/...), " +
        "and ensure More → Save to PDF is available for this profile."
    );
  }

  const blob = await captureTabAsPdf(tabId);
  return new File(
    [blob],
    buildPdfFilename({ ...name, source: candidate?.source || source || "profile" }),
    { type: "application/pdf" }
  );
}

/** Capture the active tab as a PDF blob (same output as browser Print → Save as PDF). */
export async function captureTabAsPdf(tabId: number): Promise<Blob> {
  const debuggee = { tabId };

  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach(debuggee, "1.3", () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || "Failed to attach debugger"));
        return;
      }
      resolve();
    });
  });

  try {
    const result = await new Promise<{ data: string }>((resolve, reject) => {
      chrome.debugger.sendCommand(
        debuggee,
        "Page.printToPDF",
        {
          printBackground: true,
          preferCSSPageSize: true,
          paperWidth: 8.27,
          paperHeight: 11.69,
          marginTop: 0.35,
          marginBottom: 0.35,
          marginLeft: 0.35,
          marginRight: 0.35,
          scale: 1,
          displayHeaderFooter: false,
          captureBeyondViewport: true,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "PDF capture failed"));
            return;
          }
          resolve(response as { data: string });
        }
      );
    });

    const binary = atob(result.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: "application/pdf" });
  } finally {
    await new Promise<void>((resolve) => {
      chrome.debugger.detach(debuggee, () => resolve());
    });
  }
}

export function buildPdfFilename(candidate: {
  firstName: string;
  lastName: string;
  source: string;
}): string {
  const slug = [candidate.firstName, candidate.lastName]
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const base = slug || candidate.source || "profile";
  return `${base}-profile.pdf`;
}
