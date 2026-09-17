import { redirect } from "next/navigation";

export default function LegacyBookingWorkbenchPage() {
  redirect("/app/calendar");
}
