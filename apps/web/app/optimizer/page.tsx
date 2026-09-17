"use client";

import OptimizerPage from "../app/optimizer/page";
import { BusinessWorkspaceShell } from "../../components/shell/workspace-shells";

export default function StandaloneOptimizerPage() {
  return (
    <BusinessWorkspaceShell>
      <OptimizerPage />
    </BusinessWorkspaceShell>
  );
}
