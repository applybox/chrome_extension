import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isStandaloneWindow } from "@/lib/popup-window";
import { sendMessage } from "@/lib/messaging";
import { BrandLogo } from "./BrandLogo";

export function Header() {
  const [detached, setDetached] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    void isStandaloneWindow().then(setDetached);
  }, []);

  const handleOpenInWindow = async () => {
    setOpening(true);
    try {
      await sendMessage({ action: "openInWindow" });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="bg-black px-4 py-3 text-white">
      <div className="flex items-center gap-3">
        <BrandLogo className="h-9 w-9 shrink-0 rounded-lg object-contain" />
        <h1 className="min-w-0 flex-1 text-base font-semibold tracking-wide truncate">
          Applybox Recruiter
        </h1>
        {!detached && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenInWindow}
            disabled={opening}
            className="h-7 shrink-0 px-2 text-[11px] border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            title="Open in a separate window"
          >
            {opening ? "Opening..." : "Open in window"}
          </Button>
        )}
      </div>
    </div>
  );
}
