/** URL detection for CRM migration sources (Edun, Vincere). */

export function isVincereHost(url: string): boolean {
  return /vincere\.(io|cloud)/i.test(url);
}

export function isEdunHost(url: string): boolean {
  return /(?:^|\.)edun\.ai|helloedun\.co\.uk/i.test(url);
}

export function isVincereCandidateUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (!isVincereHost(lower)) return false;
  return (
    /\/candidates?\//i.test(lower) ||
    /\/candidate[-_]?profile/i.test(lower) ||
    /[?&#].*candidate/i.test(lower) ||
    /entitytype=candidate/i.test(lower) ||
    /module=candidate/i.test(lower) ||
    /\/contact\/\d+/i.test(lower)
  );
}

export function isEdunCandidateUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (!isEdunHost(lower)) return false;
  return (
    /\/candidates?\//i.test(lower) ||
    /\/candidate[-_]?profile/i.test(lower) ||
    /\/(?:teacher|worker|educator|staff)s?\//i.test(lower) ||
    /[?&#].*candidate/i.test(lower) ||
    /\/crm\/.*candidate/i.test(lower)
  );
}

export function detectCrmMigrationSource(url: string): "vincere" | "edun" | null {
  if (isVincereCandidateUrl(url)) return "vincere";
  if (isEdunCandidateUrl(url)) return "edun";
  return null;
}

export function getCrmProfileKey(url: string): string | null {
  const lower = url.toLowerCase();

  const vincereId =
    lower.match(/vincere\.(?:io|cloud)\/.*?(?:candidates?|contact)\/(\d+)/i) ||
    lower.match(/[?&#](?:candidate|contact)[_-]?id=(\d+)/i);
  if (vincereId?.[1]) return `vincere:${vincereId[1]}`;

  const edunId =
    lower.match(/(?:edun\.ai|helloedun\.co\.uk).*?(?:candidates?|teacher|worker|educator)\/(\d+)/i) ||
    lower.match(/[?&#](?:candidate|teacher|worker)[_-]?id=(\d+)/i);
  if (edunId?.[1]) return `edun:${edunId[1]}`;

  const crm = detectCrmMigrationSource(url);
  if (crm) return `${crm}:${url.split("#")[0].split("?")[0]}`;

  return null;
}
