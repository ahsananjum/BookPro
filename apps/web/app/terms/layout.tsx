import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Official BookPro Terms of Service, master subscription agreement, and platform usage policies.",
  openGraph: {
    title: "Terms of Service | BookPro",
    description: "Official BookPro Terms of Service and master multi-tenant subscription agreement.",
  },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
