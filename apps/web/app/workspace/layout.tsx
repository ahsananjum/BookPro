import React from "react";
import { StaffWorkspaceShell } from "../../components/shell/workspace-shells";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <StaffWorkspaceShell>{children}</StaffWorkspaceShell>;
}
