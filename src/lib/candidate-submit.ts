import type { Candidate } from "@/types";
import { ApiError, apiFetch, apiUpload } from "./api";
import {
  CANDIDATE_CHECK_EMAIL_PATH,
  CANDIDATE_FROM_EXTENSION_PATH,
  CANDIDATE_FROM_EXTENSION_URL,
} from "./endpoints";
import { buildPdfFilename, captureProfilePdf } from "./page-pdf";

interface ExtensionSaveResponse {
  message: string;
  already_exists?: boolean;
  updated?: boolean;
  candidate: { id: string; first_name: string; last_name: string };
  pdf_uploaded: boolean;
  headshot_uploaded?: boolean;
  profile_url?: string;
}

export interface SubmitCandidateResult {
  candidate: ExtensionSaveResponse["candidate"];
  pdfUploaded: boolean;
  headshotUploaded: boolean;
  alreadyExists: boolean;
  updated: boolean;
  profileUrl?: string;
  message: string;
  pdfError?: string;
}

function candidateHeadshotPath(candidateId: string): string {
  return `/candidates/${candidateId}/headshot`;
}

export async function uploadCandidateHeadshot(
  candidateId: string,
  headshotFile: File | Blob,
  options: { authToken: string; activeTenantId: string; filename?: string }
): Promise<void> {
  const formData = new FormData();
  const filename =
    options.filename ||
    (headshotFile instanceof File ? headshotFile.name : "headshot.jpg");
  formData.append("headshot", headshotFile, filename);

  await apiUpload(candidateHeadshotPath(candidateId), formData, {
    token: options.authToken,
    tenantId: options.activeTenantId,
  });
}

export interface CheckEmailResult {
  exists: boolean;
  message?: string;
  profileUrl?: string;
  candidate?: ExtensionSaveResponse["candidate"];
}

export function extensionSourceLabel(source: string): string {
  switch (source.toLowerCase()) {
    case "linkedin":
      return "LinkedIn";
    case "cvlibrary":
    case "cv-library":
      return "CV-Library";
    case "indeed":
      return "Indeed";
    case "edun":
      return "Edun";
    case "vincere":
      return "Vincere";
    case "manual":
    case "unknown":
    case "chrome_extension":
      return "Chrome Extension";
    default:
      return source;
  }
}

export function buildExtensionFormFields(candidate: Candidate): Record<string, string> {
  const locationParts = candidate.location
    ? candidate.location.split(",").map((p) => p.trim())
    : [];

  const fields: Record<string, string> = {
    first_name: candidate.firstName || "Unknown",
    last_name: candidate.lastName || "Unknown",
    status: "onboarding",
    source: extensionSourceLabel(candidate.source || "unknown"),
  };

  const email = candidate.email?.trim();
  if (email) fields.email = email;
  if (candidate.phone) {
    fields.phone = candidate.phone;
    fields.mobile = candidate.phone;
  }
  if (locationParts[0]) fields.city = locationParts[0];
  if (locationParts[1]) fields.county = locationParts[1];
  if (candidate.profileUrl) fields.profile_url = candidate.profileUrl;
  if (candidate.jobTitle) fields.job_title = candidate.jobTitle;
  if (candidate.summary) fields.summary = candidate.summary;
  if (candidate.experience) fields.experience_text = candidate.experience;
  if (candidate.notes?.trim()) fields.notes = candidate.notes.trim();

  return fields;
}

function duplicateResultFromApiError(err: ApiError): SubmitCandidateResult | null {
  const candidateData = err.data.candidate as ExtensionSaveResponse["candidate"] | undefined;
  const emailErrors = err.data.errors as Record<string, string[]> | undefined;
  const emailMessage = emailErrors?.email?.[0];
  const isDuplicate =
    err.status === 409 ||
    (err.status === 422 &&
      typeof emailMessage === "string" &&
      emailMessage.toLowerCase().includes("already exists"));

  if (!isDuplicate) return null;

  return {
    candidate: candidateData ?? { id: "", first_name: "", last_name: "" },
    pdfUploaded: false,
    headshotUploaded: false,
    alreadyExists: true,
    updated: false,
    profileUrl: err.data.profile_url as string | undefined,
    message:
      (err.data.message as string) ||
      emailMessage ||
      "A candidate with this email already exists.",
  };
}

export async function checkCandidateEmail(
  email: string,
  options: { authToken: string; activeTenantId: string }
): Promise<CheckEmailResult> {
  const trimmed = email.trim();
  if (!trimmed) return { exists: false };

  const response = await apiFetch<{
    exists: boolean;
    message?: string;
    profile_url?: string;
    candidate?: ExtensionSaveResponse["candidate"];
  }>(CANDIDATE_CHECK_EMAIL_PATH, {
    method: "POST",
    token: options.authToken,
    tenantId: options.activeTenantId,
    body: JSON.stringify({ email: trimmed }),
  });

  return {
    exists: response.exists,
    message: response.message,
    profileUrl: response.profile_url,
    candidate: response.candidate,
  };
}

export async function submitCandidateWithPdf(
  candidate: Candidate,
  options: {
    authToken: string;
    activeTenantId: string;
    tabId?: number;
    tabUrl?: string;
    cvFile?: File | Blob | null;
    cvFilename?: string;
    headshotFile?: File | Blob | null;
    headshotFilename?: string;
    /** @deprecated Prefer passing cvFile from the UI */
    attachPdf?: boolean;
  }
): Promise<SubmitCandidateResult> {
  const formData = new FormData();

  for (const [key, value] of Object.entries(buildExtensionFormFields(candidate))) {
    formData.append(key, value);
  }

  let pdfError: string | undefined;
  if (options.cvFile) {
    const filename =
      options.cvFilename ||
      (options.cvFile instanceof File
        ? options.cvFile.name
        : buildPdfFilename(candidate));
    formData.append("profile_pdf", options.cvFile, filename);
  }

  const headshotFile =
    options.headshotFile instanceof File
      ? options.headshotFile.size >= 80
        ? options.headshotFile
        : null
      : options.headshotFile && options.headshotFile.size >= 80
        ? options.headshotFile
        : null;

  if (headshotFile) {
    const filename =
      options.headshotFilename ||
      (headshotFile instanceof File ? headshotFile.name : "headshot.jpg");
    formData.append("headshot", headshotFile, filename);
  } else if (options.attachPdf && options.tabId) {
    try {
      const pdfBlob = await captureProfilePdf(options.tabId, options.tabUrl);
      formData.append("profile_pdf", pdfBlob, buildPdfFilename(candidate));
    } catch (err) {
      pdfError =
        err instanceof Error
          ? err.message
          : "Could not capture page as PDF. Candidate will still be saved.";
    }
  }

  try {
    const response = await apiUpload<ExtensionSaveResponse>(CANDIDATE_FROM_EXTENSION_PATH, formData, {
      token: options.authToken,
      tenantId: options.activeTenantId,
    });

    let headshotUploaded = response.headshot_uploaded ?? false;
    const candidateId = response.candidate?.id;

    if (headshotFile && !headshotUploaded && candidateId) {
      try {
        await uploadCandidateHeadshot(candidateId, headshotFile, {
          authToken: options.authToken,
          activeTenantId: options.activeTenantId,
          filename:
            options.headshotFilename ||
            (headshotFile instanceof File ? headshotFile.name : undefined),
        });
        headshotUploaded = true;
      } catch {
        /* primary upload path should handle most cases */
      }
    }

    const baseMessage = response.message || "Candidate successfully sent to Applybox.";
    return {
      candidate: response.candidate,
      pdfUploaded: response.pdf_uploaded ?? false,
      headshotUploaded,
      alreadyExists: response.already_exists ?? false,
      updated: response.updated ?? false,
      profileUrl: response.profile_url,
      message: pdfError ? `${baseMessage} (PDF not attached: ${pdfError})` : baseMessage,
      pdfError,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      const duplicate = duplicateResultFromApiError(err);
      if (duplicate) return duplicate;
    }
    if (err instanceof ApiError && err.data.redirect) {
      throw new Error(
        `Wrong API endpoint or redirect (${err.status}). Expected ${CANDIDATE_FROM_EXTENSION_URL}`
      );
    }
    throw err;
  }
}
