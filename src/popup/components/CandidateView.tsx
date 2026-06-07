import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserTab } from "@/lib/browser-tab-client";
import { checkCandidateEmail, submitCandidateWithPdf } from "@/lib/candidate-submit";
import { CANDIDATE_FROM_EXTENSION_PATH, EXTENSION_VERSION } from "@/lib/endpoints";
import { getExtensionSession } from "@/lib/extension-session";
import type { FetchHint } from "@/lib/candidate-fetch";
import type { HeadshotData } from "@/lib/headshot-fetch";
import { headshotDataToFile } from "@/lib/headshot-fetch";
import { fetchProfileCvFile } from "@/lib/page-pdf";
import type { Candidate, User } from "@/types";
import { CvAttachment } from "./CvAttachment";
import { HeadshotPreview } from "./HeadshotPreview";
import { UserSessionBar } from "./UserSessionBar";

const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  cvlibrary: "CV-Library",
  indeed: "Indeed",
  edun: "CRM",
  vincere: "CRM",
  unknown: "Manual",
};

const SOURCE_STYLES: Record<string, string> = {
  linkedin: "bg-blue-50 text-blue-700",
  cvlibrary: "bg-green-50 text-green-700",
  indeed: "bg-red-50 text-red-700",
  edun: "bg-purple-50 text-purple-700",
  vincere: "bg-orange-50 text-orange-700",
  unknown: "bg-muted text-muted-foreground",
};

const MIGRATION_SOURCES = new Set(["edun", "vincere"]);

function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

const HINT_MESSAGES: Record<NonNullable<FetchHint>, string> = {
  unsupported:
    "Open a candidate profile in LinkedIn, CV-Library, Indeed, or another supported site (while logged in), or enter details manually below.",
  empty:
    "Profile page detected but some fields were not found. Try Re-fetch on the profile page.",
  failed:
    "Could not read this page automatically. Click Re-fetch or enter candidate details manually.",
};

interface CandidateViewProps {
  user: User;
  tenantName: string | null;
  candidate: Candidate;
  source: string;
  profileKey: string | null;
  headshot: HeadshotData | null;
  headshotPreview: string | null;
  fetchHint: FetchHint;
  fetching: boolean;
  onRefetch: () => Promise<void>;
  onLogout: () => void;
  onCandidateChange: (candidate: Candidate) => void;
  onHeadshotChange: (headshot: HeadshotData | null) => void;
  cvFile: File | null;
  onCvFileChange: (file: File | null) => void;
}

export function CandidateView({
  user,
  tenantName,
  candidate,
  source,
  profileKey,
  headshot,
  headshotPreview,
  fetchHint,
  fetching,
  onRefetch,
  onLogout,
  onCandidateChange,
  onHeadshotChange,
  cvFile,
  onCvFileChange,
}: CandidateViewProps) {
  const [loading, setLoading] = useState(false);
  const [capturingCv, setCapturingCv] = useState(false);
  const [cvCaptureError, setCvCaptureError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailHint, setEmailHint] = useState<string | null>(null);

  useEffect(() => {
    setCvCaptureError(null);
    setError(null);
    setSuccess(null);
    setProfileUrl(null);
    setAlreadyExists(false);
    setEmailHint(null);
  }, [profileKey]);

  const updateField = (field: keyof Candidate, value: string) => {
    onCandidateChange({ ...candidate, [field]: value });
    if (field === "email") {
      setEmailHint(null);
      setAlreadyExists(false);
      setProfileUrl(null);
    }
  };

  const validateEmail = async (email: string): Promise<boolean> => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailHint(null);
      setAlreadyExists(false);
      setProfileUrl(null);
      return false;
    }

    setCheckingEmail(true);
    try {
      const session = await getExtensionSession();
      const result = await checkCandidateEmail(trimmed, session);

      if (result.exists) {
        setAlreadyExists(true);
        setEmailHint(
          result.message ||
            "This candidate already exists. Send to update any new profile details, headshot, or CV."
        );
        if (result.profileUrl) setProfileUrl(result.profileUrl);
        return true;
      }

      setAlreadyExists(false);
      setEmailHint(null);
      setProfileUrl(null);
      return false;
    } catch (err) {
      setEmailHint(err instanceof Error ? err.message : "Could not validate email.");
      return false;
    } finally {
      setCheckingEmail(false);
    }
  };

  useEffect(() => {
    const trimmed = candidate.email.trim();
    if (!trimmed) return;

    const timer = window.setTimeout(() => {
      void validateEmail(trimmed);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [candidate.email]);

  const handleFetchCvFromPage = async () => {
    setCvCaptureError(null);
    setCapturingCv(true);
    try {
      const tab = await getBrowserTab();
      if (!tab.tabId) {
        throw new Error("No browser tab found. Open a candidate profile in Chrome first.");
      }

      const file = await fetchProfileCvFile(tab.tabId, tab.tabUrl, {
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        source: source === "unknown" ? "manual" : source,
      });
      onCvFileChange(file);
    } catch (err) {
      setCvCaptureError(
        err instanceof Error ? err.message : "Could not fetch PDF from the current page."
      );
    } finally {
      setCapturingCv(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (!candidate.firstName && !candidate.lastName) {
      setError("Please enter at least a name.");
      return;
    }

    const email = candidate.email.trim();
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address before sending.");
      return;
    }

    await validateEmail(email);

    setLoading(true);
    try {
      const session = await getExtensionSession();
      const tab = await getBrowserTab();
      const headshotFile = headshot ? headshotDataToFile(headshot) : null;
      const result = await submitCandidateWithPdf(
        { ...candidate, source: source === "unknown" ? "manual" : source },
        {
          authToken: session.authToken,
          activeTenantId: session.activeTenantId,
          tabId: tab.tabId,
          tabUrl: tab.tabUrl,
          cvFile,
          headshotFile,
        }
      );

      if (result.alreadyExists) {
        setAlreadyExists(true);
      } else {
        setAlreadyExists(false);
        setEmailHint(null);
      }

      const parts: string[] = [];
      if (result.updated) parts.push("profile details");
      if (result.headshotUploaded) parts.push("headshot");
      if (result.pdfUploaded) parts.push("CV");

      setSuccess(
        parts.length
          ? `Candidate ${result.alreadyExists ? "updated" : "sent"} in Applybox with ${parts.join(", ")}!`
          : result.message || "Candidate successfully sent to Applybox!"
      );
      if (result.profileUrl) setProfileUrl(result.profileUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    isValidEmail(candidate.email) && !checkingEmail && !loading && !fetching;

  const handleRefetch = async () => {
    setError(null);
    setSuccess(null);
    setProfileUrl(null);
    setAlreadyExists(false);
    await onRefetch();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto overscroll-y-contain scroll-smooth px-4 pb-3 pt-4">
      <UserSessionBar user={user} tenantName={tenantName} onLogout={onLogout} />

      {fetching && (
        <div className="flex items-center gap-2 p-2.5 text-sm text-muted-foreground bg-muted rounded-md">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin shrink-0" />
          Fetching profile from current tab...
        </div>
      )}

      {!fetching && MIGRATION_SOURCES.has(source) && (
        <div className="p-2.5 text-sm text-purple-900 bg-purple-50 border border-purple-200 rounded-md">
          <strong>CRM migration:</strong> A candidate profile was detected from your current tab.
          Review the fields below, attach their CV if needed, then send to Applybox. Repeat for each
          candidate you want to import.
        </div>
      )}

      {!fetching && fetchHint && (
        <div className="p-2.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md">
          {HINT_MESSAGES[fetchHint]}
        </div>
      )}

      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Candidate Info</h2>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
            SOURCE_STYLES[source] ?? SOURCE_STYLES.unknown
          }`}
        >
          {SOURCE_LABELS[source] ?? source}
        </span>
      </div>

      <HeadshotPreview
        previewUrl={headshotPreview}
        loading={fetching}
        disabled={loading || fetching}
        onRemove={() => onHeadshotChange(null)}
      />

      <div className="grid gap-2.5">
        {(
          [
            ["firstName", "First Name", "text"],
            ["lastName", "Last Name", "text"],
            ["email", "Email", "email"],
            ["phone", "Phone / Mobile", "tel"],
            ["profileUrl", "CV / LinkedIn URL", "url"],
            ["jobTitle", "Job Title / Headline", "text"],
            ["location", "Location", "text"],
          ] as const
        ).map(([field, label, type]) => (
          <div key={field} className="space-y-1">
            <Label htmlFor={field}>{label}</Label>
            <Input
              id={field}
              type={type}
              value={candidate[field]}
              onChange={(e) => updateField(field, e.target.value)}
              onBlur={field === "email" ? () => void validateEmail(candidate.email) : undefined}
              disabled={fetching || (field === "email" && checkingEmail)}
            />
          </div>
        ))}

        <div className="space-y-1">
          <Label htmlFor="summary">Summary</Label>
          <textarea
            id="summary"
            value={candidate.summary}
            onChange={(e) => updateField("summary", e.target.value)}
            disabled={fetching}
            rows={4}
            placeholder="Profile about / summary"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="experience">Experience</Label>
          <textarea
            id="experience"
            value={candidate.experience}
            onChange={(e) => updateField("experience", e.target.value)}
            disabled={fetching}
            rows={6}
            placeholder="Work history from profile"
            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notes</Label>
          <textarea
            id="notes"
            value={candidate.notes}
            onChange={(e) => updateField("notes", e.target.value)}
            disabled={fetching || loading}
            rows={3}
            placeholder="Add notes for this candidate in Applybox"
            className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      {emailHint && (
        <div className="p-2.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md space-y-2">
          <p>{emailHint}</p>
          {profileUrl && (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-primary font-medium underline hover:no-underline"
            >
              Open existing candidate in Applybox
            </a>
          )}
        </div>
      )}

      <CvAttachment
        file={cvFile}
        onFileChange={(file) => {
          onCvFileChange(file);
          if (file) setCvCaptureError(null);
        }}
        allowWordDocuments={source === "cvlibrary"}
        onFetchFromPage={handleFetchCvFromPage}
        fetchingFromPage={capturingCv}
        fetchError={cvCaptureError}
        pageFetchLabel={
          source === "linkedin"
            ? "Fetch PDF from page (LinkedIn Save to PDF)"
            : source === "cvlibrary"
              ? "Download CV from CV-Library"
              : "Fetch PDF from current page"
        }
        disabled={loading || fetching}
      />

      {error && (
        <div className="p-2.5 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
      )}
      {success && (
        <div className="p-2.5 text-sm rounded-md space-y-2 text-green-700 bg-green-50">
          <p>{success}</p>
          {profileUrl && (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-primary font-medium underline hover:no-underline"
            >
              Open candidate in Applybox
            </a>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        v{EXTENSION_VERSION} · saves to {CANDIDATE_FROM_EXTENSION_PATH}
      </p>
      </div>

      <div className="shrink-0 border-t border-border bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 bg-white hover:bg-white"
            onClick={handleRefetch}
            disabled={fetching || loading}
          >
            {fetching ? "Fetching..." : "Re-fetch from page"}
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={
              !isValidEmail(candidate.email) ? "Enter a valid email address to send" : undefined
            }
          >
            {loading
              ? alreadyExists
                ? cvFile
                  ? "Updating & uploading CV..."
                  : "Updating..."
                : cvFile
                  ? "Uploading CV & sending..."
                  : "Sending..."
              : alreadyExists
                ? "Update in Applybox"
                : "Send to Applybox"}
          </Button>
        </div>
      </div>
    </div>
  );
}
