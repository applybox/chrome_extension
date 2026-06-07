export interface User {
  id: number;
  name: string;
  email: string;
  headshot_url?: string | null;
  provider?: string;
}

export interface Tenant {
  id: string;
  name: string;
  setup_completed_at?: string | null;
}

export interface TenantMembership {
  id: number;
  tenant: Tenant;
  role: { name: string };
  status: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  memberships?: TenantMembership[];
}

export interface AuthMeResponse {
  user: User;
  memberships: TenantMembership[];
  pending_invitations?: unknown[];
}

export interface Candidate {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profileUrl: string;
  jobTitle: string;
  summary: string;
  experience: string;
  location: string;
  notes: string;
  source: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  user: User | null;
  token: string | null;
  activeTenantId: string | null;
  memberships: TenantMembership[];
}

export type MessageAction =
  | { action: "checkAuth" }
  | { action: "login"; credentials: { email: string; password: string } }
  | { action: "requestOtp"; data: { identifier: string; type: "email" | "sms" } }
  | { action: "loginOtp"; data: { identifier: string; code: string; type: "email" | "sms" } }
  | { action: "initiateSSO"; provider: "google" | "microsoft" }
  | { action: "completeSSOLogin"; token: string }
  | { action: "setActiveTenant"; tenantId: string }
  | { action: "logout" }
  | { action: "openInWindow" }
  | { action: "getBrowserTab" }
  | { action: "fetchCandidate"; tabId: number; tabUrl: string }
  | {
      action: "submitCandidate";
      candidate: Candidate;
      tabId?: number;
      tabUrl?: string;
      attachPdf?: boolean;
    };
