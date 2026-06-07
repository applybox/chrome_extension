import React, { useRef, useState, KeyboardEvent, useEffect } from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  disabled,
  className,
  autoFocus = false,
}: OTPInputProps) {
  const [otp, setOtp] = useState<string[]>(new Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (value && value.length === length) {
      setOtp(value.split("").slice(0, length));
    } else if (!value) {
      setOtp(new Array(length).fill(""));
    }
  }, [value, length]);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const updateOtp = (newOtp: string[]) => {
    setOtp(newOtp);
    onChange(newOtp.join(""));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value;
    if (val && !/^\d$/.test(val)) {
      e.target.value = otp[index] || "";
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = val;
    updateOtp(newOtp);
    if (val && index < length - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp];
        newOtp[index] = "";
        updateOtp(newOtp);
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    e.preventDefault();
    const digits = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length)
      .split("");
    const newOtp = [...otp];
    digits.forEach((digit, i) => {
      if (index + i < length) newOtp[index + i] = digit;
    });
    updateOtp(newOtp);
    const lastIndex = Math.min(index + digits.length - 1, length - 1);
    inputRefs.current[lastIndex]?.focus();
  };

  return (
    <div className={cn("flex gap-1.5 justify-center", className)}>
      {otp.map((digit, index) => (
        <Input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(e, index)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onPaste={(e) => handlePaste(e, index)}
          disabled={disabled}
          className="w-10 h-10 text-center text-lg font-semibold p-0"
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );
}
