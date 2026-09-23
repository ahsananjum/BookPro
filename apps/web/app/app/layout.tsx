import React from "react";
import type { Metadata } from "next";
import { BusinessWorkspaceShell } from "../../components/shell/workspace-shells";

export const metadata: Metadata = {
  title: "Workspace Control Console",
  description: "Business management, calendar dispatch, staff rosters, and client CRM.",
};

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <BusinessWorkspaceShell>{children}</BusinessWorkspaceShell>;
}
