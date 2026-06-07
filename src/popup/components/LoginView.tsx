import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OTPInput } from "@/components/ui/otp-input";
import { sendMessage } from "@/lib/messaging";
import type { AuthState } from "@/types";
import { BrandLogo } from "./BrandLogo";

const passwordSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const otpRequestSchema = z.object({
  identifier: z.string().email("Invalid email address"),
  type: z.enum(["email", "sms"]),
});

type PasswordForm = z.infer<typeof passwordSchema>;
type OtpRequestForm = z.infer<typeof otpRequestSchema>;

interface LoginViewProps {
  onLogin: (state: AuthState) => void;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md" role="alert">
      {message}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 23 23" fill="currentColor">
      <path d="M0 0h10.5v10.5H0z" fill="#f25022" />
      <path d="M12.5 0H23v10.5H12.5z" fill="#00a4ef" />
      <path d="M0 12.5h10.5V23H0z" fill="#7fba00" />
      <path d="M12.5 12.5H23V23H12.5z" fill="#ffb900" />
    </svg>
  );
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [loginMode, setLoginMode] = useState<"password" | "otp">("password");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpExpiresIn, setOtpExpiresIn] = useState<number | null>(null);
  const [otpCode, setOtpCode] = useState("");

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const otpRequestForm = useForm<OtpRequestForm>({
    resolver: zodResolver(otpRequestSchema),
    defaultValues: { type: "email" },
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePasswordLogin = async (data: PasswordForm) => {
    setError(null);
    setLoading(true);
    try {
      const result = await sendMessage<AuthState & { success: boolean; error?: string }>({
        action: "login",
        credentials: { email: data.email, password: data.password },
      });
      if (!result.success) throw new Error(result.error || "Login failed");
      onLogin(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (data: OtpRequestForm) => {
    setError(null);
    setLoading(true);
    try {
      const result = await sendMessage<{ success: boolean; expires_in?: number; error?: string }>({
        action: "requestOtp",
        data: { identifier: data.identifier, type: data.type },
      });
      if (!result.success) throw new Error(result.error || "Failed to send OTP");
      setOtpRequested(true);
      const expiresIn = result.expires_in || 300;
      setOtpExpiresIn(expiresIn);
      setOtpCode("");
      const timer = setInterval(() => {
        setOtpExpiresIn((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpLogin = async () => {
    if (otpCode.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const result = await sendMessage<AuthState & { success: boolean; error?: string }>({
        action: "loginOtp",
        data: {
          identifier: otpRequestForm.getValues("identifier"),
          code: otpCode,
          type: otpRequestForm.getValues("type"),
        },
      });
      if (!result.success) throw new Error(result.error || "Invalid OTP");
      onLogin(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid OTP");
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleSSO = async (provider: "google" | "microsoft") => {
    setError(null);
    setLoading(true);
    try {
      const result = await sendMessage<AuthState & { success: boolean; error?: string }>({
        action: "initiateSSO",
        provider,
      });
      if (!result.success) throw new Error(result.error || "Sign in failed");
      onLogin(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      if (!message.includes("cancelled")) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1">
      <div className="relative overflow-hidden bg-black px-6 pb-10 pt-10 text-center text-white">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/[0.03]"
          aria-hidden
        />
        <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
          <BrandLogo />
        </div>
        <p className="relative text-lg font-semibold tracking-wide">Applybox Recruiter</p>
        <p className="relative mt-1 text-sm text-white/70">
          Import candidates from job boards and other CRMs
        </p>
      </div>

      <Card className="mx-4 mt-5 mb-4 flex-1 border shadow-md rounded-xl">
      <CardHeader className="pb-2 pt-5">
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your Applybox account</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          value={loginMode}
          onValueChange={(v) => {
            setLoginMode(v as "password" | "otp");
            setOtpRequested(false);
            setError(null);
          }}
        >
          <TabsList>
            <TabsTrigger value="password">Password</TabsTrigger>
            <TabsTrigger value="otp">OTP</TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="space-y-3">
            {error && <ErrorBanner message={error} />}
            <form onSubmit={passwordForm.handleSubmit(handlePasswordLogin)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  disabled={loading}
                  {...passwordForm.register("email")}
                />
                {passwordForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  disabled={loading}
                  {...passwordForm.register("password")}
                />
                {passwordForm.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {passwordForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="otp" className="space-y-3">
            {error && <ErrorBanner message={error} />}
            {!otpRequested ? (
              <form onSubmit={otpRequestForm.handleSubmit(handleRequestOtp)} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="otp-identifier">Email</Label>
                  <Input
                    id="otp-identifier"
                    type="email"
                    placeholder="john@example.com"
                    disabled={loading}
                    {...otpRequestForm.register("identifier")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="otp-type">Send via</Label>
                  <select
                    id="otp-type"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    disabled={loading}
                    {...otpRequestForm.register("type")}
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending..." : "Send OTP"}
                </Button>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Enter OTP Code</Label>
                  <OTPInput
                    value={otpCode}
                    onChange={setOtpCode}
                    disabled={loading}
                    autoFocus
                  />
                  {otpExpiresIn !== null && otpExpiresIn > 0 && (
                    <p className="text-sm text-muted-foreground text-center">
                      Expires in {formatTime(otpExpiresIn)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={loading || otpCode.length !== 6}
                    onClick={handleOtpLogin}
                  >
                    {loading ? "Verifying..." : "Verify & Sign in"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOtpRequested(false);
                      setOtpExpiresIn(null);
                      setOtpCode("");
                    }}
                  >
                    Resend
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex flex-col space-y-3">
        <div className="relative w-full">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 w-full">
          <Button type="button" variant="outline" onClick={() => handleSSO("google")} disabled={loading}>
            <GoogleIcon />
            Google
          </Button>
          <Button type="button" variant="outline" onClick={() => handleSSO("microsoft")} disabled={loading}>
            <MicrosoftIcon />
            Microsoft
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          SSO opens a browser tab. Return to the extension after signing in.
        </p>
      </CardFooter>
    </Card>
    </div>
  );
}
