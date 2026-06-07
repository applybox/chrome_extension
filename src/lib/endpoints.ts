import packageJson from "../../package.json";
import { API_BASE_URL } from "./api";

export const CANDIDATE_CHECK_EMAIL_PATH = "/candidates/check-email";
export const CANDIDATE_FROM_EXTENSION_PATH = "/candidates/from-extension";

export function candidateApiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

/** Full URLs — extension must POST here, not POST /candidates */
export const CANDIDATE_CHECK_EMAIL_URL = candidateApiUrl(CANDIDATE_CHECK_EMAIL_PATH);
export const CANDIDATE_FROM_EXTENSION_URL = candidateApiUrl(CANDIDATE_FROM_EXTENSION_PATH);

export const EXTENSION_VERSION = packageJson.version;
