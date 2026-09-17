import React from "react";
import { BusinessWorkspaceShell } from "../../components/shell/workspace-shells";

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <BusinessWorkspaceShell>{children}</BusinessWorkspaceShell>;
}
