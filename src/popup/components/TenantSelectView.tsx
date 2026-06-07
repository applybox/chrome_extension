import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sendMessage } from "@/lib/messaging";
import type { AuthState, TenantMembership } from "@/types";

interface TenantSelectViewProps {
  memberships: TenantMembership[];
  onSelected: (state: AuthState) => void;
}

export function TenantSelectView({ memberships, onSelected }: TenantSelectViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (tenantId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await sendMessage<AuthState & { success: boolean; error?: string }>({
        action: "setActiveTenant",
        tenantId,
      });
      if (!result.success) throw new Error(result.error || "Failed to select tenant");
      onSelected(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select tenant");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-none rounded-none">
      <CardHeader className="pb-2">
        <CardTitle>Select tenant</CardTitle>
        <CardDescription>Choose which organisation to work with</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
        )}
        {memberships.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={loading}
            onClick={() => handleSelect(m.tenant.id)}
            className="w-full text-left rounded-lg border border-input p-3 hover:bg-accent transition-colors disabled:opacity-50"
          >
            <p className="font-medium text-sm">{m.tenant.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{m.role.name}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
