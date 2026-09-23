import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Register Workspace",
  description: "Create and launch your business workspace on BookPro in minutes.",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
