"use client";

import { ActorType } from "@bookpro/contracts";
import { ProtectedRoute } from "../../../components/protected-route";
import { useParams } from "next/navigation";
import { AIReceptionistView } from "../../../components/ai-receptionist-view";

export default function TenantAIPage() {
  const { tenant } = useParams<{ tenant: string }>();
  return (
    <ProtectedRoute allowedActorTypes={[ActorType.CUSTOMER]}>
      <AIReceptionistView tenantSlug={tenant} />
    </ProtectedRoute>
  );
}
