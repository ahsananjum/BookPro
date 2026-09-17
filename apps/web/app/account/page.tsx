"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "../../components/protected-route";
import { useAuth } from "../../lib/auth-context";

function LegacyAccountRedirect() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    router.replace(user?.organizationSlug ? `/${user.organizationSlug}/account` : "/");
  }, [router, user?.organizationSlug]);
  return <main className="tenant-state"><p>Opening your customer account…</p></main>;
}

export default function LegacyAccountPage() {
  return <ProtectedRoute><LegacyAccountRedirect /></ProtectedRoute>;
}
