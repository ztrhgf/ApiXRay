import type { BatchPair, BatchSubRequest, BatchSubResponse } from "./types";
import { sanitizeBody, sanitizeHeaders } from "./sanitizer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeHeaders(value: unknown): Record<string, string> {
  const normalized: Record<string, string> = {};

  if (Array.isArray(value)) {
    for (const header of value) {
      if (!isRecord(header)) {
        continue;
      }

      const name = header.name;
      const headerValue = header.value;
      if (name === undefined || name === null || headerValue === undefined || headerValue === null) {
        continue;
      }

      normalized[String(name)] = String(headerValue);
    }

    return normalized;
  }

  if (!isRecord(value)) {
    return normalized;
  }

  for (const [key, headerValue] of Object.entries(value)) {
    if (headerValue === undefined || headerValue === null) {
      continue;
    }

    normalized[key] = String(headerValue);
  }

  return normalized;
}

function parseJson(bodyText: string): unknown {
  if (!bodyText.trim()) {
    return null;
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return null;
  }
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string" || typeof value === "boolean" || typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function sanitizePossiblyJsonString(value: unknown): unknown {
  if (typeof value !== "string") {
    return sanitizeBody(value);
  }

  try {
    return sanitizeBody(JSON.parse(value));
  } catch {
    return value;
  }
}

function normalizeHeadersWithFallback(...values: unknown[]): Record<string, string> {
  for (const value of values) {
    const normalized = normalizeHeaders(value);
    if (Object.keys(normalized).length > 0) {
      return normalized;
    }
  }

  return {};
}

export function parseBatchRequest(bodyText: string): BatchSubRequest[] {
  const parsed = parseJson(bodyText);
  const requests = isRecord(parsed) ? parsed.requests : undefined;

  if (!Array.isArray(requests)) {
    return [];
  }

  return requests
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item, index) => ({
      id: String(item.id ?? item.name ?? index + 1),
      method: String(item.method ?? item.httpMethod ?? "GET"),
      url: String(item.url ?? "/"),
      headers: sanitizeHeaders(normalizeHeadersWithFallback(item.headers, item.requestHeaderDetails)),
      body: sanitizePossiblyJsonString(item.body ?? item.content)
    }));
}

export function parseBatchResponse(bodyText: string): BatchSubResponse[] {
  const parsed = parseJson(bodyText);
  const responses = isRecord(parsed) ? parsed.responses : undefined;

  if (!Array.isArray(responses)) {
    return [];
  }

  return responses
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item, index) => ({
      id: String(item.id ?? item.name ?? index + 1),
      status: toFiniteNumber(item.status ?? item.httpStatusCode, 0),
      headers: sanitizeHeaders(
        normalizeHeadersWithFallback(item.headers, item.responseHeaderDetails, item.httpResponseHeaders)
      ),
      body: sanitizePossiblyJsonString(item.body ?? item.content)
    }));
}

export function matchBatchPairs(
  requests: BatchSubRequest[],
  responses: BatchSubResponse[]
): BatchPair[] {
  const responseMap = new Map(responses.map((response) => [response.id, response]));

  return requests.map((request) => ({
    request,
    response: responseMap.get(request.id)
  }));
}
