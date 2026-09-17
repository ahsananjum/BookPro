import React from "react";
import { PlatformWorkspaceShell } from "../../components/shell/workspace-shells";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformWorkspaceShell>{children}</PlatformWorkspaceShell>;
}
