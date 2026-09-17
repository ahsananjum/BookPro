import { ActorType, RoleCode } from "@bookpro/contracts";
import type { UserSession } from "../auth-context";

export function isSafeReturnPath(value?: string | null): value is string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return false;
  try {
    const parsed = new URL(value, "https://bookpro.invalid");
    return parsed.origin === "https://bookpro.invalid" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function resolvePostAuthDestination(user: UserSession, requestedPath?: string | null): string {
  if (isSafeReturnPath(requestedPath)) return requestedPath;
  if (user.isPlatformAdmin || user.actorType === ActorType.PLATFORM_ADMIN) return "/platform";
  if (user.actorType === ActorType.CUSTOMER) {
    return "/customer";
  }
  if (user.onboardingCompleted === false && user.roleCode === RoleCode.OWNER) return "/onboarding";
  if (user.roleCode === RoleCode.STAFF) return "/workspace";
  return "/app";
}
