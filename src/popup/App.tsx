import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { LoginView } from "./components/LoginView";
import { TenantSelectView } from "./components/TenantSelectView";
import { CandidateView } from "./components/CandidateView";
import { getBrowserTab } from "@/lib/browser-tab-client";
import { sendMessage } from "@/lib/messaging";
import { getProfileKey } from "@/lib/profile-url";
import type { CvFileData } from "@/lib/cvlibrary-cv";
import { cvFileDataToFile } from "@/lib/cvlibrary-cv";
import type { HeadshotData } from "@/lib/headshot-fetch";
import { headshotDataToPreviewUrl } from "@/lib/headshot-fetch";
import type { FetchHint } from "@/lib/candidate-fetch";
import type { AuthState, Candidate } from "@/types";

type View = "loading" | "login" | "tenant" | "candidate";

const EMPTY_CANDIDATE: Candidate = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  profileUrl: "",
  jobTitle: "",
  summary: "",
  experience: "",
  location: "",
  notes: "",
  source: "unknown",
};

function Spinner() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("loading");
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [candidate, setCandidate] = useState<Candidate>(EMPTY_CANDIDATE);
  const [source, setSource] = useState("unknown");
  const [fetchHint, setFetchHint] = useState<FetchHint>(null);
  const [fetching, setFetching] = useState(false);
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const [headshot, setHeadshot] = useState<HeadshotData | null>(null);
  const [headshotPreview, setHeadshotPreview] = useState<string | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const lastFetchedProfileKey = useRef<string | null>(null);
  const autoFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyHeadshot = useCallback((data: HeadshotData | null) => {
    setHeadshot(data);
    setHeadshotPreview(data ? headshotDataToPreviewUrl(data) : null);
  }, []);

  const applyCvFile = useCallback((data: CvFileData | null) => {
    setCvFile(data ? cvFileDataToFile(data) : null);
  }, []);

  const tryFetchCandidate = useCallback(
    async (tabOverride?: { tabId?: number; tabUrl?: string }) => {
      setFetching(true);
      try {
        const tab = tabOverride?.tabUrl
          ? { tabId: tabOverride.tabId, tabUrl: tabOverride.tabUrl }
          : await getBrowserTab();

        if (!tab.tabId || !tab.tabUrl) {
          setFetchHint("unsupported");
          setProfileKey(null);
          return;
        }

        const result = await sendMessage<{
          success: boolean;
          candidate: Candidate;
          source: string;
          hint: FetchHint;
          headshot?: HeadshotData | null;
          cvFile?: CvFileData | null;
          error?: string;
        }>({
          action: "fetchCandidate",
          tabId: tab.tabId,
          tabUrl: tab.tabUrl,
        });

        if (!result.success) throw new Error(result.error || "Fetch failed");

        const key = getProfileKey(tab.tabUrl);
        const sameProfile = !!key && key === lastFetchedProfileKey.current;
        setCandidate((prev) => ({
          ...result.candidate,
          notes: sameProfile ? prev.notes : "",
        }));
        setSource(result.source);
        setFetchHint(result.hint);
        setProfileKey(key);
        applyHeadshot(result.headshot ?? null);
        applyCvFile(result.cvFile ?? null);
        if (key) lastFetchedProfileKey.current = key;
      } catch (err) {
        setFetchHint("failed");
        if (err instanceof Error && err.message.includes("No browser tab")) {
          setFetchHint("unsupported");
        }
      } finally {
        setFetching(false);
      }
    },
    [applyHeadshot]
  );

  const scheduleAutoFetch = useCallback(
    (update: { tabId?: number; tabUrl?: string }) => {
      const key = getProfileKey(update.tabUrl);
      if (!key || key === lastFetchedProfileKey.current) return;

      if (autoFetchTimer.current) clearTimeout(autoFetchTimer.current);
      autoFetchTimer.current = setTimeout(() => {
        void tryFetchCandidate(update);
      }, 500);
    },
    [tryFetchCandidate]
  );

  const showCandidateForm = useCallback(async () => {
    setView("candidate");
    await tryFetchCandidate();
  }, [tryFetchCandidate]);

  const resolvePostLoginView = useCallback(
    async (state: AuthState) => {
      setAuth(state);
      if (state.memberships.length === 0) {
        setView("login");
        return;
      }
      if (!state.activeTenantId && state.memberships.length > 1) {
        setView("tenant");
        return;
      }
      await showCandidateForm();
    },
    [showCandidateForm]
  );

  const init = useCallback(async () => {
    const result = await sendMessage<AuthState & { success: boolean }>({ action: "checkAuth" });
    if (result.isLoggedIn) {
      await resolvePostLoginView(result);
    } else {
      setView("login");
    }
  }, [resolvePostLoginView]);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const listener = (message: {
      action?: string;
      tabId?: number;
      tabUrl?: string;
    }) => {
      if (message.action === "authComplete") init();
      if (message.action === "tabUrlChanged" && view === "candidate") {
        scheduleAutoFetch({ tabId: message.tabId, tabUrl: message.tabUrl });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [init, view, scheduleAutoFetch]);

  useEffect(() => {
    return () => {
      if (autoFetchTimer.current) clearTimeout(autoFetchTimer.current);
    };
  }, []);

  const handleLogout = async () => {
    await sendMessage({ action: "logout" });
    setAuth(null);
    setCandidate(EMPTY_CANDIDATE);
    setSource("unknown");
    setFetchHint(null);
    setProfileKey(null);
    applyHeadshot(null);
    applyCvFile(null);
    lastFetchedProfileKey.current = null;
    setView("login");
  };

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-[480px] flex-col">
      {view !== "login" && <Header />}
      {view === "loading" && <Spinner />}
      {view === "login" && <LoginView onLogin={resolvePostLoginView} />}
      {view === "tenant" && auth && (
        <TenantSelectView memberships={auth.memberships} onSelected={resolvePostLoginView} />
      )}
      {view === "candidate" && auth?.user && (
        <CandidateView
          user={auth.user}
          tenantName={
            auth.memberships.find((m) => m.tenant.id === auth.activeTenantId)?.tenant.name ??
            auth.memberships[0]?.tenant.name ??
            null
          }
          candidate={candidate}
          source={source}
          profileKey={profileKey}
          headshot={headshot}
          headshotPreview={headshotPreview}
          fetchHint={fetchHint}
          fetching={fetching}
          onRefetch={tryFetchCandidate}
          onLogout={handleLogout}
          onCandidateChange={setCandidate}
          onHeadshotChange={applyHeadshot}
          cvFile={cvFile}
          onCvFileChange={setCvFile}
        />
      )}
    </div>
  );
}
