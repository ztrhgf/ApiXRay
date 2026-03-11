import { createBatchGroup } from "./components/batch-group";
import { createRequestEntry } from "./components/request-entry";
import { Toolbar } from "./components/toolbar";
import { getActiveEndpoints } from "../shared/endpoints";
import { formatUrl, isBatchUrl, matchEndpoint } from "../shared/url-utils";
import { matchBatchPairs, parseBatchRequest, parseBatchResponse } from "../shared/batch-parser";
import { sanitizeBody, sanitizeHeaders } from "../shared/sanitizer";
import type { FilterState, HttpMethod, MethodFilter, MonitoredRequest } from "../shared/types";

type HarHeader = { name: string; value: string };

type HarEntry = {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    headers: HarHeader[];
    postData?: { text?: string };
  };
  response: {
    status: number;
    headers: HarHeader[];
    content?: { text?: string };
  };
  getContent: (callback: (body: string, encoding: string) => void) => void;
};

const requests: MonitoredRequest[] = [];

let filterState: FilterState = {
  selectedMethod: "ALL",
  searchText: "",
  includeInternal: false
};

function requireElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Panel root node missing: ${selector}`);
  }
  return element;
}

const requestList = requireElement<HTMLElement>("#request-list");
const emptyState = requireElement<HTMLElement>("#empty-state");
const toolbarRoot = requireElement<HTMLElement>("#toolbar");

function normalizeMethod(method: string): HttpMethod {
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE") {
    return upper;
  }
  return "OTHER";
}

function matchesMethod(method: string, selectedMethod: MethodFilter): boolean {
  if (selectedMethod === "ALL") {
    return true;
  }

  return normalizeMethod(method) === selectedMethod;
}

function headersToMap(headers: HarHeader[]): Record<string, string> {
  return headers.reduce<Record<string, string>>((acc, current) => {
    acc[current.name] = current.value;
    return acc;
  }, {});
}

function parseMaybeJson(text: string | undefined): unknown {
  if (!text || !text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getResponseBody(entry: HarEntry): Promise<string> {
  return new Promise((resolve) => {
    entry.getContent((body) => resolve(body ?? ""));
  });
}

function applyFilters(all: MonitoredRequest[]): MonitoredRequest[] {
  return all.filter((request) => {
    if (filterState.selectedMethod !== "ALL") {
      const parentMatch = request.method === filterState.selectedMethod;
      const childMatch = request.isBatch
        ? request.batchPairs.some((pair) => matchesMethod(pair.request.method, filterState.selectedMethod))
        : false;

      if (!parentMatch && !childMatch) {
        return false;
      }
    }

    if (!filterState.includeInternal && request.endpointScope === "internal") {
      return false;
    }

    if (!filterState.searchText) {
      return true;
    }

    const haystack = [
      formatUrl(request.endpointBase, request.endpointPath),
      request.url,
      typeof request.responseBody === "string" ? request.responseBody : JSON.stringify(request.responseBody),
      request.isBatch ? JSON.stringify(request.batchPairs) : ""
    ]
      .join("\n")
      .toLowerCase();

    return haystack.includes(filterState.searchText);
  });
}

function downloadJsonFile(filename: string, payload: unknown): void {
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function clickExpandButtons(selector: string, shouldOpen: boolean): void {
  for (const button of Array.from(requestList.querySelectorAll<HTMLButtonElement>(selector))) {
    const isOpen = button.classList.contains("open");
    if ((shouldOpen && !isOpen) || (!shouldOpen && isOpen)) {
      button.click();
    }
  }
}

function setExpandAll(shouldOpen: boolean): void {
  if (shouldOpen) {
    clickExpandButtons(".request-entry > .row-head .expand-btn", true);
    clickExpandButtons(".batch-group > .row-head .expand-btn", true);
    clickExpandButtons(".batch-child .expand-btn", true);
    return;
  }

  clickExpandButtons(".batch-child .expand-btn", false);
  clickExpandButtons(".batch-group > .row-head .expand-btn", false);
  clickExpandButtons(".request-entry > .row-head .expand-btn", false);
}

function render(): void {
  const visible = applyFilters(requests);

  requestList.replaceChildren();

  for (const request of visible) {
    const element = request.isBatch
      ? createBatchGroup(request, filterState.selectedMethod, filterState.searchText)
      : createRequestEntry(request, {
          onCopyUrl: async (url) => {
            await navigator.clipboard.writeText(url);
          },
          onCopyOutput: async (payload) => {
            await navigator.clipboard.writeText(payload);
          }
        }, {
          searchText: filterState.searchText
        });
    requestList.appendChild(element);
  }

  emptyState.style.display = visible.length ? "none" : "block";
}

async function processEntry(entry: HarEntry): Promise<void> {
  if (entry.request.method.toUpperCase() === "OPTIONS") {
    return;
  }

  const endpoints = getActiveEndpoints(true);
  const match = matchEndpoint(entry.request.url, endpoints);

  if (!match) {
    return;
  }

  const requestBodyRaw = entry.request.postData?.text ?? "";
  const responseBodyRaw = await getResponseBody(entry);

  const parsedRequestBody = parseMaybeJson(requestBodyRaw);
  const parsedResponseBody = parseMaybeJson(responseBodyRaw);

  const isBatch = isBatchUrl(entry.request.url);

  const monitored: MonitoredRequest = {
    id: `${entry.startedDateTime}-${entry.request.method}-${entry.request.url}`,
    timestamp: entry.startedDateTime,
    url: entry.request.url,
    method: normalizeMethod(entry.request.method),
    status: Number(entry.response.status ?? 0),
    latencyMs: Math.max(0, Math.round(entry.time ?? 0)),
    endpointBase: match.base,
    endpointPath: match.path,
    endpointScope: match.scope,
    requestHeaders: sanitizeHeaders(headersToMap(entry.request.headers ?? [])),
    requestBody: sanitizeBody(parsedRequestBody),
    responseHeaders: sanitizeHeaders(headersToMap(entry.response.headers ?? [])),
    responseBody: sanitizeBody(parsedResponseBody),
    isBatch,
    batchPairs: []
  };

  if (isBatch) {
    const batchRequests = parseBatchRequest(requestBodyRaw).filter(
      (subRequest) => subRequest.method.toUpperCase() !== "OPTIONS"
    );
    const batchResponses = parseBatchResponse(responseBodyRaw);
    monitored.batchPairs = matchBatchPairs(batchRequests, batchResponses);
  }

  requests.unshift(monitored);
  render();
}

function loadExistingHar(): void {
  chrome.devtools.network.getHAR(async (har: { entries?: unknown[] }) => {
    const entries = (har?.entries ?? []) as HarEntry[];
    for (const entry of entries) {
      await processEntry(entry);
    }
  });
}

function listenForNewRequests(): void {
  chrome.devtools.network.onRequestFinished.addListener((entry: unknown) => {
    void processEntry(entry as HarEntry);
  });
}

async function bootstrap(): Promise<void> {
  const toolbar = new Toolbar(toolbarRoot, {
    onFiltersChanged: (nextState) => {
      filterState = nextState;
      render();
    },
    onClear: () => {
      requests.length = 0;
      render();
    },
    onExport: () => {
      downloadJsonFile("apixray-capture.json", requests);
    },
    onExpandAll: () => {
      setExpandAll(true);
    },
    onCollapseAll: () => {
      setExpandAll(false);
    }
  });

  await toolbar.render();
  loadExistingHar();
  listenForNewRequests();
}

void bootstrap();
