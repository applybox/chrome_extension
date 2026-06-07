import { Button } from "@/components/ui/button";

interface HeadshotPreviewProps {
  previewUrl: string | null;
  loading?: boolean;
  disabled?: boolean;
  onRemove: () => void;
}

export function HeadshotPreview({
  previewUrl,
  loading = false,
  disabled = false,
  onRemove,
}: HeadshotPreviewProps) {
  const initialsPlaceholder = (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="h-7 w-7"
        aria-hidden
      >
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  );

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      {loading ? (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : previewUrl ? (
        <img
          src={previewUrl}
          alt="Profile headshot"
          className="h-16 w-16 shrink-0 rounded-full border object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        initialsPlaceholder
      )}

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Profile photo</p>
        {previewUrl ? (
          <p className="text-xs text-green-700">Headshot ready to upload</p>
        ) : loading ? (
          <p className="text-xs text-muted-foreground">Fetching from profile...</p>
        ) : (
          <p className="text-xs text-muted-foreground">No photo found on this page</p>
        )}
      </div>

      {previewUrl && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove
        </Button>
      )}
    </div>
  );
}
