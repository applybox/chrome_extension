import { detectSource } from "./candidate-fetch";
import { getCrmProfileKey } from "./crm-url";

/** Stable key for comparing whether the user is on a different candidate profile. */
export function getProfileKey(url: string | undefined): string | null {
  if (!url) return null;

  // employers.indeed.com identifies the applicant by an `id` query param, so it must
  // be matched against the raw url — the generic path-only key below strips it.
  const indeedEmployerId = url
    .toLowerCase()
    .match(/employers\.indeed\.com\/candidates\/view\?[^#]*[?&]id=([a-z0-9]+)/);
  if (indeedEmployerId) return `indeed:employer:${indeedEmployerId[1]}`;

  const base = url.split("#")[0].split("?")[0].replace(/\/$/, "");
  const lower = base.toLowerCase();

  const linkedInIn = lower.match(/linkedin\.com\/in\/([^/]+)/);
  if (linkedInIn) return `linkedin:in:${linkedInIn[1]}`;

  const linkedInTalent = lower.match(/linkedin\.com\/talent\/profile\/([^/]+)/);
  if (linkedInTalent) return `linkedin:talent:${linkedInTalent[1]}`;

  const linkedInSales = lower.match(/linkedin\.com\/sales\/people\/([^/,]+)/);
  if (linkedInSales) return `linkedin:sales:${linkedInSales[1]}`;

  const cvLibrary = lower.match(/cv-library\.co\.uk\/candidate\/(\d+)/);
  if (cvLibrary) return `cvlibrary:${cvLibrary[1]}`;

  const cvView = lower.match(/[?&](?:cand(?:idate)?_?id|candidate_id)=(\d+)/);
  if (cvView && lower.includes("cv-library.co.uk")) return `cvlibrary:${cvView[1]}`;

  const cvPathId = lower.match(/cv-library\.co\.uk\/(?:cvview|recruiter\/candidate)\/(\d+)/);
  if (cvPathId) return `cvlibrary:${cvPathId[1]}`;

  const crmKey = getCrmProfileKey(base);
  if (crmKey) return crmKey;

  if (detectSource(base)) return base;

  return null;
}

export function isProfilePage(url: string | undefined): boolean {
  return getProfileKey(url) !== null;
}
