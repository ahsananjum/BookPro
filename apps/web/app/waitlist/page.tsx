"use client";

import WaitlistPage from "../app/waitlist/page";
import { BusinessWorkspaceShell } from "../../components/shell/workspace-shells";

export default function StandaloneWaitlistPage() {
  return (
    <BusinessWorkspaceShell>
      <WaitlistPage />
    </BusinessWorkspaceShell>
  );
}
