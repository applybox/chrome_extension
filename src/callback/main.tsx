import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { sendMessage } from "@/lib/messaging";
import "../popup/index.css";

function CallbackApp() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Completing sign in...");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const error = params.get("error");
    const success = params.get("success");

    const finish = async () => {
      if (error) {
        setStatus("error");
        if (error === "user_not_found") {
          setMessage("Account not found. Please sign up on Applybox first.");
        } else if (error === "token_exchange_failed") {
          setMessage("Failed to exchange authorization code. Please try again.");
        } else {
          setMessage(`Authentication failed: ${error}`);
        }
        return;
      }

      if (token && success === "1") {
        try {
          const result = await sendMessage<{ success: boolean; error?: string }>({
            action: "completeSSOLogin",
            token,
          });
          if (!result.success) throw new Error(result.error || "Login failed");
          setStatus("success");
          setMessage("Sign in successful! You can close this tab and return to the extension.");
          chrome.runtime.sendMessage({ action: "authComplete" });
          setTimeout(() => window.close(), 2000);
        } catch (err) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : "Authentication failed");
        }
      } else {
        setStatus("error");
        setMessage("Invalid callback parameters. Please try logging in again.");
      }
    };

    finish();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-background">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm text-center space-y-3">
        {status === "loading" && (
          <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin mx-auto" />
        )}
        {status === "success" && (
          <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto text-xl">
            ✓
          </div>
        )}
        {status === "error" && (
          <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto text-xl">
            ✕
          </div>
        )}
        <h1 className="text-lg font-semibold">
          {status === "loading" && "Signing in"}
          {status === "success" && "Success"}
          {status === "error" && "Sign in failed"}
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CallbackApp />
  </React.StrictMode>
);
