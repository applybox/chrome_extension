import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 10 * 1024 * 1024;
const PDF_ACCEPT = "application/pdf,.pdf";
const CV_ACCEPT =
  "application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateCvFile(file: File, allowWordDocuments: boolean): string | null {
  const lower = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
  const isWord =
    file.type === "application/msword" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".doc") ||
    lower.endsWith(".docx");

  if (!isPdf && !(allowWordDocuments && isWord)) {
    return allowWordDocuments
      ? "Only PDF, DOC, or DOCX files are supported."
      : "Only PDF files are supported.";
  }
  if (file.size > MAX_BYTES) return "File must be 10MB or smaller.";
  if (file.size === 0) return "File is empty.";
  return null;
}

interface CvAttachmentProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onFetchFromPage: () => Promise<void>;
  fetchingFromPage: boolean;
  fetchError: string | null;
  pageFetchLabel: string;
  allowWordDocuments?: boolean;
  disabled?: boolean;
}

export function CvAttachment({
  file,
  onFileChange,
  onFetchFromPage,
  fetchingFromPage,
  fetchError,
  pageFetchLabel,
  allowWordDocuments = false,
  disabled = false,
}: CvAttachmentProps) {
  const accept = allowWordDocuments ? CV_ACCEPT : PDF_ACCEPT;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const setFile = (next: File | null) => {
    setLocalError(null);
    onFileChange(next);
  };

  const handleFiles = (files: FileList | null) => {
    const picked = files?.[0];
    if (!picked) return;

    const validationError = validateCvFile(picked, allowWordDocuments);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setFile(picked);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  };

  const error = localError || fetchError;

  if (file) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label text="CV / Resume" />
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
            <PdfIcon className="text-green-600" />
            CV attached
          </span>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50/60 p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-green-100 text-green-700">
            <PdfIcon />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              disabled={disabled}
              onClick={() => setFile(null)}
            >
              Remove
            </Button>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {error && <ErrorText message={error} />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label text="CV / Resume" />

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-primary/50 hover:bg-primary/5"
        } ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"}`}
      >
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UploadIcon />
        </div>
        <p className="text-sm font-medium text-foreground">
          Drag & drop {allowWordDocuments ? "a CV file" : "a PDF"} here
        </p>
        <p className="mt-1 text-xs text-muted-foreground">or click to browse · max 10MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={disabled || fetchingFromPage}
        onClick={() => void onFetchFromPage()}
      >
        {fetchingFromPage ? "Fetching CV from page..." : pageFetchLabel}
      </Button>

      {error && <ErrorText message={error} />}
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <p className="text-sm font-medium leading-none text-foreground">{text}</p>;
}

function ErrorText({ message }: { message: string }) {
  return <p className="text-xs text-destructive">{message}</p>;
}

function PdfIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 ${className}`}
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M10 13h4" />
      <path d="M10 17h4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
