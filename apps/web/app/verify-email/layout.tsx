import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Verify Your Email",
  description: "Confirm your email verification code to activate your BookPro account.",
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
