"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function CustomerInviteRedirectPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    const target = qs ? `/customer/invite?${qs}` : "/customer/invite";
    window.location.replace(target);
  }, [searchParams]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#050a17", color: "#94a3b8" }}>
      <p>Redirecting to secure customer invitation…</p>
    </div>
  );
}
