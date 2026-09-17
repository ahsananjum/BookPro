"use client";

import BusinessCalendarPage from "../app/calendar/page";
import { BusinessWorkspaceShell } from "../../components/shell/workspace-shells";

export default function StandaloneCalendarPage() {
  return (
    <BusinessWorkspaceShell>
      <BusinessCalendarPage />
    </BusinessWorkspaceShell>
  );
}
