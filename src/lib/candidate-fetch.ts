import type { Candidate } from "@/types";
import { cvFileDataToFile, fetchCvLibraryCvData, type CvFileData } from "./cvlibrary-cv";
import { fetchHeadshotFromTab, type HeadshotData } from "./headshot-fetch";
import { fetchLinkedInContactFromTab } from "./linkedin-contact";
import { fetchLinkedInHeadlineFromTab } from "./linkedin-profile";
import { sendMessage } from "./messaging";
import { detectCrmMigrationSource } from "./crm-url";
import { extractCrmMigrationProfile, PAGE_EXTRACTORS } from "./page-extractors";

export type FetchHint = null | "unsupported" | "empty" | "failed";

export function detectSource(url: string): keyof typeof PAGE_EXTRACTORS | null {
  const lower = url.toLowerCase();
  if (
    lower.includes("linkedin.com/in/") ||
    lower.includes("linkedin.com/talent/") ||
    lower.includes("linkedin.com/sales/people/")
  ) {
    return "linkedin";
  }
  if (lower.includes("cv-library.co.uk")) return "cvlibrary";
  if (lower.includes("indeed.com") || lower.includes("indeed.co.uk")) return "indeed";

  const crm = detectCrmMigrationSource(lower);
  if (crm) return crm;

  return null;
}

function normalizeCandidate(
  raw: Record<string, string | undefined>,
  source: string,
  tabUrl: string
): Candidate {
  return {
    firstName: raw.firstName || "",
    lastName: raw.lastName || "",
    email: raw.email || "",
    phone: raw.phone || "",
    profileUrl: raw.profileUrl || raw.cvUrl || tabUrl.split("?")[0].split("#")[0],
    jobTitle: raw.jobTitle || "",
    summary: raw.summary || "",
    experience: raw.experience || "",
    location: raw.location || "",
    notes: raw.notes || raw.migrationNote || "",
    source,
  };
}

function hasCandidateData(candidate: Candidate): boolean {
  return !!(
    candidate.firstName ||
    candidate.lastName ||
    candidate.email ||
    candidate.phone ||
    candidate.jobTitle ||
    candidate.location
  );
}

function emptyCandidate(): Candidate {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    profileUrl: "",
    jobTitle: "",
    summary: "",
    experience: "",
    location: "",
    notes: "",
    source: "unknown",
  };
}

function isSparseResult(raw: Record<string, string> | null): boolean {
  if (!raw) return true;
  return !(
    raw.firstName ||
    raw.lastName ||
    raw.jobTitle ||
    raw.location ||
    raw.email ||
    raw.phone
  );
}

function isMissingHeadline(raw: Record<string, string> | null): boolean {
  if (!raw) return false;
  return !!(raw.firstName || raw.lastName) && !raw.jobTitle?.trim();
}

function isMissingLocation(raw: Record<string, string> | null): boolean {
  if (!raw) return false;
  return !!(raw.firstName || raw.lastName) && !raw.location?.trim();
}

function mergeExtractionResults(
  primary: Record<string, string> | null,
  secondary: Record<string, string> | null
): Record<string, string> | null {
  if (!primary) return secondary;
  if (!secondary) return primary;

  return {
    ...primary,
    ...secondary,
    firstName: primary.firstName || secondary.firstName || "",
    lastName: primary.lastName || secondary.lastName || "",
    email: primary.email || secondary.email || "",
    phone: primary.phone || secondary.phone || "",
    jobTitle: primary.jobTitle || secondary.jobTitle || "",
    summary: primary.summary || secondary.summary || "",
    experience: primary.experience || secondary.experience || "",
    location: primary.location || secondary.location || "",
    profileUrl: primary.profileUrl || secondary.profileUrl || "",
    headshotUrl: primary.headshotUrl || secondary.headshotUrl || "",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function extractViaInjection(
  tabId: number,
  source: keyof typeof PAGE_EXTRACTORS
): Promise<Record<string, string> | null> {
  const useMainWorld =
    source === "linkedin" ||
    source === "cvlibrary" ||
    source === "vincere" ||
    source === "edun";

  try {
    const [result] =
      source === "vincere" || source === "edun"
        ? await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: extractCrmMigrationProfile,
            args: [source],
          })
        : await chrome.scripting.executeScript({
            target: { tabId },
            func: PAGE_EXTRACTORS[source],
            world: useMainWorld ? "MAIN" : "ISOLATED",
          });
    const data = result?.result as Record<string, string> | undefined;
    return data ?? null;
  } catch {
    return null;
  }
}

/** Fallback: read og/meta tags from MAIN world (LinkedIn SPA edge cases). */
async function extractLinkedInViaMainWorld(
  tabId: number
): Promise<Record<string, string> | null> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        function trim(v: string | null | undefined): string {
          return (v || "").replace(/\s+/g, " ").trim();
        }
        function meta(sel: string): string {
          return trim(document.querySelector(sel)?.getAttribute("content") || "");
        }
        const ogTitle = meta('meta[property="og:title"]');
        const title = ogTitle || document.title || "";
        const cleaned = title
          .replace(/^\(\d+\)\s*/, "")
          .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, "")
          .trim();
        function isConnectionBadge(text: string): boolean {
          return (
            /^[·•]\s*$/.test(text) ||
            /^[·•]\s*\d+(?:st|nd|rd|th)?$/i.test(text) ||
            /^[·•]\s*\d+\+?$/.test(text)
          );
        }

        function isValidHeadline(text: string, profileName: string): boolean {
          if (!text || text.length < 2 || text.length > 320) return false;
          if (text === profileName) return false;
          if (isConnectionBadge(text)) return false;
          if (/contact info/i.test(text)) return false;
          if (/\d+\+?\s+connections?|linkedin member/i.test(text)) return false;
          return true;
        }

        function isValidLocation(text: string): boolean {
          if (!text || text.length < 4 || text.length > 120) return false;
          if (isConnectionBadge(text)) return false;
          if (/contact info/i.test(text)) return false;
          if (text.includes(",")) return true;
          if (/\b(united kingdom|england|scotland|wales|area|region)\b/i.test(text)) return true;
          return false;
        }

        function findTopCardDetails(profileName: string): { headline: string; location: string } {
          const card =
            document.querySelector("[data-view-name='profile-card']") ||
            document.querySelector("main section") ||
            document.querySelector("main");
          if (!card) return { headline: "", location: "" };

          const nameEl =
            card.querySelector("a[href*='/in/'] h2") ||
            card.querySelector("a[href*='/in/'] h1") ||
            card.querySelector("h2") ||
            card.querySelector("h1");
          if (!nameEl) return { headline: "", location: "" };

          const nameRect = nameEl.getBoundingClientRect();
          const items: { text: string; top: number }[] = [];

          card.querySelectorAll("p").forEach((p) => {
            if (p.closest("#about, #experience, button, nav, header")) return;
            if (p.querySelector("a[href*='contact-info'], a[href*='overlay/contact-info']")) return;
            if (nameEl.contains(p)) return;

            const rect = p.getBoundingClientRect();
            if (rect.top < nameRect.bottom - 8) return;
            if (rect.top > nameRect.bottom + 340) return;

            const text = trim(p.textContent || "");
            if (text) items.push({ text, top: rect.top });
          });

          items.sort((a, b) => a.top - b.top);

          let headline = "";
          let location = "";
          for (const { text } of items) {
            if (isConnectionBadge(text)) continue;
            if (!headline && isValidHeadline(text, profileName)) {
              headline = text;
              continue;
            }
            if (headline && !location && isValidLocation(text)) {
              location = text;
              break;
            }
          }

          return { headline, location };
        }

        let fullName = cleaned;
        const dash = cleaned.split(/\s+[\-–—]\s+/);
        if (dash.length >= 2 && !/linkedin/i.test(dash[1])) {
          fullName = trim(dash[0]);
        }

        const nameEl =
          document.querySelector("a[href*='/in/'] h2") ||
          document.querySelector("a[href*='/in/'] h1") ||
          document.querySelector("h2") ||
          document.querySelector("h1");
        const domName = trim(nameEl?.textContent || "");
        if (domName) fullName = domName;

        const nameParts = fullName.split(" ").filter(Boolean);
        const profileName = nameParts.join(" ");
        const topCard = findTopCardDetails(profileName);

        return {
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
          email: "",
          phone: "",
          jobTitle: topCard.headline || trim(meta('meta[property="og:description"]') || ""),
          summary: "",
          experience: "",
          location: topCard.location,
          profileUrl: window.location.href.split("?")[0].split("#")[0],
        };
      },
    });
    return (result?.result as Record<string, string>) ?? null;
  } catch {
    return null;
  }
}

function getContentScriptFile(source: string): string | null {
  const manifest = chrome.runtime.getManifest();
  for (const cs of manifest.content_scripts ?? []) {
    const jsFile = cs.js?.[0];
    if (!jsFile) continue;
    const patterns = cs.matches?.join(" ") ?? "";
    if (source === "linkedin" && patterns.includes("linkedin")) return jsFile;
    if (source === "cvlibrary" && patterns.includes("cv-library")) return jsFile;
    if (source === "indeed" && patterns.includes("indeed")) return jsFile;
    if (source === "vincere" && patterns.includes("vincere")) return jsFile;
    if (source === "edun" && patterns.includes("edun")) return jsFile;
  }
  return null;
}

async function extractViaContentScript(
  tabId: number,
  source: keyof typeof PAGE_EXTRACTORS
): Promise<Record<string, string> | null> {
  const tryMessage = async (): Promise<Record<string, string> | null> => {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: "fetchCandidate" });
      return response?.candidate ?? null;
    } catch {
      return null;
    }
  };

  let raw = await tryMessage();
  if (raw) return raw;

  const scriptFile = getContentScriptFile(source);
  if (!scriptFile) return null;

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [scriptFile] });
    raw = await tryMessage();
    return raw;
  } catch {
    return null;
  }
}

export async function fetchCandidateFromTab(tabId: number, tabUrl: string): Promise<{
  candidate: Candidate;
  source: string;
  hint: FetchHint;
  headshot: HeadshotData | null;
  cvFile: CvFileData | null;
}> {
  const source = detectSource(tabUrl);
  if (!source) {
    return {
      candidate: { ...emptyCandidate(), profileUrl: tabUrl.split("?")[0].split("#")[0] },
      source: "unknown",
      hint: "unsupported",
      headshot: null,
      cvFile: null,
    };
  }

  // Primary: inject extractor directly into page DOM (most reliable)
  let raw = await extractViaInjection(tabId, source);

  const needsRetry =
    source === "linkedin" &&
    (isSparseResult(raw) || isMissingHeadline(raw) || isMissingLocation(raw));
  const cvLibraryNeedsRetry =
    source === "cvlibrary" &&
    (isSparseResult(raw) || isMissingHeadline(raw) || !(raw?.email?.trim() || raw?.phone?.trim()));
  const crmNeedsRetry =
    (source === "vincere" || source === "edun") &&
    (isSparseResult(raw) || !(raw?.email?.trim() || raw?.phone?.trim() || raw?.firstName?.trim()));

  // SPA pages may not have hydrated — retry when data is still missing
  if (needsRetry || cvLibraryNeedsRetry || crmNeedsRetry) {
    await sleep(1200);
    raw = mergeExtractionResults(raw, await extractViaInjection(tabId, source));
  }
  if (needsRetry || cvLibraryNeedsRetry || crmNeedsRetry) {
    await sleep(2000);
    raw = mergeExtractionResults(raw, await extractViaInjection(tabId, source));
  }

  // LinkedIn fallback: MAIN-world top-card pass (runs even when name already loaded)
  if (source === "linkedin" && (isMissingHeadline(raw) || isMissingLocation(raw))) {
    const mainWorld = await extractLinkedInViaMainWorld(tabId);
    raw = mergeExtractionResults(raw, mainWorld);
  }

  // Fallback: legacy content-script message listener
  if (!raw || isSparseResult(raw)) {
    const legacy = await extractViaContentScript(tabId, source);
    if (legacy && !isSparseResult(legacy)) raw = legacy;
  }

  if (!raw) {
    return {
      candidate: {
        ...emptyCandidate(),
        profileUrl: tabUrl.split("?")[0].split("#")[0],
        source,
      },
      source,
      hint: "failed",
      headshot: null,
      cvFile: null,
    };
  }

  // LinkedIn: headline often needs Voyager when hashed-class DOM is not ready
  if (source === "linkedin" && !raw.jobTitle?.trim()) {
    const headline = await fetchLinkedInHeadlineFromTab(tabId, tabUrl);
    if (headline) raw.jobTitle = headline;
  }

  const candidate = normalizeCandidate(raw, source, tabUrl);

  // LinkedIn: phone/mobile via Voyager — always fetched last (most reliable path)
  if (source === "linkedin") {
    const contact = await fetchLinkedInContactFromTab(tabId, tabUrl);
    if (contact.email && !candidate.email) candidate.email = contact.email;
    if (contact.phone) candidate.phone = contact.phone;
    if (contact.address) {
      const profileLocation = candidate.location || "";
      if (!profileLocation || contact.address.length >= profileLocation.length) {
        candidate.location = contact.address;
      } else if (!profileLocation.includes(contact.address)) {
        candidate.location = `${contact.address}, ${profileLocation}`;
      }
    }
  }

  let headshot: HeadshotData | null = await fetchHeadshotFromTab(
    tabId,
    candidate,
    raw.headshotUrl?.trim() || null,
    {
      cvLibrary: source === "cvlibrary",
      preferDomCapture: source === "indeed",
    }
  );
  if (!headshot && (source === "cvlibrary" || source === "linkedin" || source === "indeed")) {
    await sleep(1200);
    headshot = await fetchHeadshotFromTab(
      tabId,
      candidate,
      raw.headshotUrl?.trim() || null,
      {
        cvLibrary: source === "cvlibrary",
        preferDomCapture: source === "indeed",
      }
    );
  }

  let cvFile: CvFileData | null = null;
  if (source === "cvlibrary") {
    const cvUrl = raw.cvUrl?.trim() || null;
    cvFile = await fetchCvLibraryCvData(tabId, candidate, cvUrl, tabUrl);
    if (!cvFile && (isSparseResult(raw) || !(raw?.email?.trim() || raw?.phone?.trim()))) {
      await sleep(1500);
      cvFile = await fetchCvLibraryCvData(tabId, candidate, cvUrl, tabUrl);
    }
  }

  return {
    candidate,
    source,
    hint: hasCandidateData(candidate) ? null : "empty",
    headshot,
    cvFile,
  };
}

export async function fetchCandidateFromActiveTab(): Promise<{
  candidate: Candidate;
  source: string;
  hint: FetchHint;
  headshot: HeadshotData | null;
  cvFile: CvFileData | null;
}> {
  const tab = await sendMessage<{ tabId?: number; tabUrl?: string }>({ action: "getBrowserTab" });
  if (!tab.tabId || !tab.tabUrl) {
    return {
      candidate: emptyCandidate(),
      source: "unknown",
      hint: "unsupported",
      headshot: null,
      cvFile: null,
    };
  }
  return fetchCandidateFromTab(tab.tabId, tab.tabUrl);
}
