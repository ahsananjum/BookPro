import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Official BookPro Privacy Policy, data governance, GDPR compliance, and security disclosures.",
  openGraph: {
    title: "Privacy Policy | BookPro",
    description: "Official BookPro Privacy Policy, data governance, and GDPR/CCPA security disclosures.",
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
