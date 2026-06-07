import { Button } from "@/components/ui/button";
import type { User } from "@/types";

function getInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

interface UserSessionBarProps {
  user: User;
  tenantName: string | null;
  onLogout: () => void;
}

export function UserSessionBar({ user, tenantName, onLogout }: UserSessionBarProps) {
  const displayName = user.name || user.email;
  const initials = getInitials(user.name || "", user.email);

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black text-sm font-semibold text-white">
        {user.headshot_url ? (
          <img
            src={user.headshot_url}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <span aria-hidden>{initials}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
        {tenantName ? (
          <p className="truncate text-xs text-muted-foreground">{tenantName}</p>
        ) : null}
      </div>
      <Button variant="outline" size="sm" className="shrink-0" onClick={onLogout}>
        Logout
      </Button>
    </div>
  );
}
