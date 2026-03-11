import type { BatchPair, BatchSubRequest, BatchSubResponse } from "./types";

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

export function parseBatchRequest(bodyText: string): BatchSubRequest[] {
  const parsed = parseJson(bodyText);
  const requests = (parsed as { requests?: unknown[] } | null)?.requests;

  if (!Array.isArray(requests)) {
    return [];
  }

  return requests
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, index) => ({
      id: String(item.id ?? index + 1),
      method: String(item.method ?? "GET"),
      url: String(item.url ?? "/"),
      headers: (item.headers as Record<string, string> | undefined) ?? {},
      body: item.body
    }));
}

export function parseBatchResponse(bodyText: string): BatchSubResponse[] {
  const parsed = parseJson(bodyText);
  const responses = (parsed as { responses?: unknown[] } | null)?.responses;

  if (!Array.isArray(responses)) {
    return [];
  }

  return responses
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, index) => ({
      id: String(item.id ?? index + 1),
      status: Number(item.status ?? 0),
      headers: (item.headers as Record<string, string> | undefined) ?? {},
      body: item.body
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
