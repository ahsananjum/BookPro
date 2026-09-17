/**
 * Error Sanitization Utility
 * Hallmark Modern-Minimal Standard: Zero Development Leaks
 *
 * Translates raw database exceptions, foreign key violations, and technical stack
 * traces into user-friendly, actionable messages, while safely preserving reference IDs.
 */

export interface SanitizedError {
  message: string;
  refId?: string;
}

export function sanitizeErrorMessage(rawError: unknown, fallbackMessage = "An unexpected error occurred. Please try again."): SanitizedError {
  if (!rawError) {
    return { message: fallbackMessage };
  }

  let rawString = "";
  let potentialRefId: string | undefined;

  if (typeof rawError === "string") {
    rawString = rawError;
  } else if (typeof rawError === "object" && rawError !== null) {
    const obj = rawError as Record<string, any>;
    rawString = obj.message || obj.error || obj.details || JSON.stringify(rawError);
    potentialRefId = obj.requestId || obj.correlationId || obj.code;
  }

  // If a UUID / request ID was found in text or object
  const uuidMatch = rawString.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuidMatch && !potentialRefId) {
    potentialRefId = uuidMatch[0].slice(0, 8);
  }

  // 1. Prisma & Database Internal Errors
  if (
    /PrismaClient|P2002|P2003|P2025|unique constraint|foreign key constraint|table .* does not exist/i.test(rawString)
  ) {
    if (/unique constraint.*email/i.test(rawString) || /P2002.*email/i.test(rawString)) {
      return {
        message: "An account with this email address already exists. Please sign in or use a different email.",
        refId: potentialRefId,
      };
    }
    if (/unique constraint.*slug/i.test(rawString) || /P2002.*slug/i.test(rawString)) {
      return {
        message: "This workspace URL slug is already taken. Please choose a different slug.",
        refId: potentialRefId,
      };
    }
    return {
      message: "The requested operation could not be completed due to a data conflict. Please refresh and try again.",
      refId: potentialRefId,
    };
  }

  // 2. PostgreSQL / SQL Syntax & Connection Leaks
  if (/syntax error at or near|ECONNREFUSED|connection refused|violates check constraint/i.test(rawString)) {
    return {
      message: "Unable to reach the database server. Our team has been notified. Please try again shortly.",
      refId: potentialRefId,
    };
  }

  // 3. Authentication & JWT Tokens
  if (/jwt expired|token expired|TokenExpiredError/i.test(rawString)) {
    return {
      message: "Your session or verification link has expired. Please sign in or request a new code.",
      refId: potentialRefId,
    };
  }
  if (/invalid signature|jwt malformed|invalid token/i.test(rawString)) {
    return {
      message: "This security token is invalid or has been corrupted. Please request a new link.",
      refId: potentialRefId,
    };
  }

  // 4. Invalid Credentials / Login Failures / 401 Unauthorized
  if (
    /invalid credentials|invalid email or password|user not found|wrong password|unauthorized|status 401|server error \(401\)/i.test(
      rawString
    ) ||
    potentialRefId === "INVALID_CREDENTIALS" ||
    potentialRefId === "UNAUTHORIZED"
  ) {
    return {
      message: "Incorrect email or password. Please check your credentials and try again.",
      refId: potentialRefId,
    };
  }

  // 5. Network / Connectivity Failures
  if (/failed to fetch|networkerror|econnreset|fetch failed/i.test(rawString)) {
    return {
      message: "We couldn't reach the BookPro servers. Please check your internet connection and try again.",
      refId: potentialRefId,
    };
  }

  // 6. Rate Limiting
  if (/too many requests|rate limit exceeded|status 429/i.test(rawString)) {
    return {
      message: "Too many attempts. For your security, please wait a minute before trying again.",
      refId: potentialRefId,
    };
  }

  // 7. General clean string (if it doesn't contain code stacks or paths)
  if (!/[\\/](node_modules|src|apps|packages)[\\/]|at [A-Za-z0-9_.]+ \(/i.test(rawString)) {
    // Truncate overly long technical messages
    if (rawString.length > 160) {
      return {
        message: fallbackMessage,
        refId: potentialRefId,
      };
    }
    return {
      message: rawString,
      refId: potentialRefId,
    };
  }

  return {
    message: fallbackMessage,
    refId: potentialRefId,
  };
}
