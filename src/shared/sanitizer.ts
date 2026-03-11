const REDACTED = "[REDACTED]";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "x-ms-authorization-auxiliary",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-ms-token-aad-id-token"
]);

const SENSITIVE_BODY_KEYS = new Set([
  "access_token",
  "refresh_token",
  "client_secret",
  "id_token",
  "client_assertion",
  "authorization",
  "password",
  "secret",
  "assertion",
  "api_key",
  "apikey",
  "token"
]);

const SENSITIVE_QUERY_KEYS = new Set([
  "access_token",
  "refresh_token",
  "client_secret",
  "id_token",
  "client_assertion",
  "code",
  "assertion",
  "token",
  "apikey",
  "api_key",
  "sig",
  "signature",
  "password",
  "secret"
]);

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      sanitized[key] = REDACTED;
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function sanitizeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_BODY_KEYS.has(key.toLowerCase())) {
        out[key] = REDACTED;
      } else {
        out[key] = sanitizeUnknown(nested);
      }
    }

    return out;
  }

  return value;
}

export function sanitizeBody(json: unknown): unknown {
  return sanitizeUnknown(json);
}

export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const [key] of parsed.searchParams.entries()) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, REDACTED);
      }
    }

    return parsed.toString();
  } catch {
    return url;
  }
}
