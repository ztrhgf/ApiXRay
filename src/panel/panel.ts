import { createBatchGroup } from "./components/batch-group";
import { createRequestEntry } from "./components/request-entry";
import { Toolbar } from "./components/toolbar";
import { getActiveEndpoints } from "../shared/endpoints";
import { formatUrl, isBatchUrl, matchEndpoint } from "../shared/url-utils";
import { matchBatchPairs, parseBatchRequest, parseBatchResponse } from "../shared/batch-parser";
import { sanitizeBody, sanitizeHeaders, sanitizeUrl } from "../shared/sanitizer";
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
const MAX_REQUESTS = 1000;

let filterState: FilterState = {
  selectedMethod: "ALL",
  searchText: "",
  includeInternal: false,
  captureEnabled: true
};

let captureEnabled = true;
let toolbar: Toolbar | null = null;
let searchMatches: HTMLElement[] = [];
let activeSearchMatchIndex = -1;

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createCaptureSeparator(pageUrl: string): HTMLElement {
  const separator = document.createElement("section");
  separator.className = "capture-separator";
  const escapedPageUrl = escapeHtml(pageUrl);
  separator.innerHTML = `
    <div class="capture-separator-line"></div>
    <div class="capture-separator-label" title="Captured on: ${escapedPageUrl}">Captured on: ${escapedPageUrl}</div>
    <div class="capture-separator-line"></div>
  `;
  return separator;
}

function getCapturedPageUrl(): Promise<string> {
  return new Promise((resolve) => {
    const tabId = chrome.devtools.inspectedWindow.tabId;

    chrome.tabs.get(tabId, (tab) => {
      const tabUrl = tab?.url;
      if (typeof tabUrl === "string" && tabUrl) {
        resolve(tabUrl);
        return;
      }

      chrome.devtools.inspectedWindow.eval("window.location.href", (result, exceptionInfo) => {
        if (exceptionInfo || typeof result !== "string" || !result) {
          resolve("(unknown page)");
          return;
        }

        resolve(result);
      });
    });
  });
}

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

function toSearchText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
      toSearchText(request.requestHeaders),
      toSearchText(request.requestBody),
      toSearchText(request.responseHeaders),
      toSearchText(request.responseBody),
      request.isBatch ? toSearchText(request.batchPairs) : ""
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

function setRequestHeadersExpanded(shouldOpen: boolean): void {
  for (const section of Array.from(
    requestList.querySelectorAll<HTMLElement>(".detail-section[data-section='request-headers']")
  )) {
    const isOpen = section.classList.contains("open");
    if (isOpen === shouldOpen) {
      continue;
    }

    section.classList.toggle("open", shouldOpen);

    const toggle = section.querySelector<HTMLButtonElement>("button[data-action='toggle-request-headers']");
    toggle?.classList.toggle("open", shouldOpen);
    toggle?.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  }
}

function setExpandAll(shouldOpen: boolean): void {
  if (shouldOpen) {
    clickExpandButtons(".request-entry > .row-head > button.expand-btn[data-action='expand']", true);
    clickExpandButtons(".batch-group > .row-head > button.expand-btn[data-action='expand']", true);
    clickExpandButtons(".batch-group > .batch-children > .batch-child > .row-head > button.expand-btn[data-action='expand']", true);
    setRequestHeadersExpanded(false);
    return;
  }

  clickExpandButtons(".batch-group > .batch-children > .batch-child > .row-head > button.expand-btn[data-action='expand']", false);
  clickExpandButtons(".batch-group > .row-head > button.expand-btn[data-action='expand']", false);
  clickExpandButtons(".request-entry > .row-head > button.expand-btn[data-action='expand']", false);
  setRequestHeadersExpanded(false);
}

function applyActiveSearchMatch(scrollIntoView: boolean): void {
  for (const match of searchMatches) {
    match.classList.remove("active-search-hit");
  }

  if (!toolbar) {
    return;
  }

  if (!filterState.searchText || searchMatches.length === 0 || activeSearchMatchIndex < 0) {
    toolbar.updateSearchMatches(0, searchMatches.length);
    return;
  }

  const activeMatch = searchMatches[activeSearchMatchIndex];
  activeMatch.classList.add("active-search-hit");
  if (scrollIntoView) {
    activeMatch.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }

  toolbar.updateSearchMatches(activeSearchMatchIndex + 1, searchMatches.length);
}

function refreshSearchMatches(): void {
  if (!filterState.searchText) {
    searchMatches = [];
    activeSearchMatchIndex = -1;
    applyActiveSearchMatch(false);
    return;
  }

  searchMatches = Array.from(requestList.querySelectorAll<HTMLElement>("mark.match-hit")).filter(
    (match) => match.offsetParent !== null
  );
  if (searchMatches.length === 0) {
    activeSearchMatchIndex = -1;
    applyActiveSearchMatch(false);
    return;
  }

  if (activeSearchMatchIndex < 0 || activeSearchMatchIndex >= searchMatches.length) {
    activeSearchMatchIndex = 0;
  }

  applyActiveSearchMatch(false);
}

function navigateSearchMatches(direction: "prev" | "next"): void {
  if (searchMatches.length === 0) {
    return;
  }

  const step = direction === "next" ? 1 : -1;
  activeSearchMatchIndex = (activeSearchMatchIndex + step + searchMatches.length) % searchMatches.length;
  applyActiveSearchMatch(true);
}

function render(): void {
  const visible = applyFilters(requests);

  requestList.replaceChildren();

  let previousCaptureUrl: string | null = null;

  for (const request of visible) {
    if (request.capturedPageUrl !== previousCaptureUrl) {
      requestList.appendChild(createCaptureSeparator(request.capturedPageUrl));
      previousCaptureUrl = request.capturedPageUrl;
    }

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
  refreshSearchMatches();
}

async function processEntry(entry: HarEntry, options?: { respectCaptureState?: boolean }): Promise<void> {
  const shouldRespectCaptureState = options?.respectCaptureState ?? true;
  if (shouldRespectCaptureState && !captureEnabled) {
    return;
  }

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
  const capturedPageUrl = await getCapturedPageUrl();
  const sanitizedUrl = sanitizeUrl(entry.request.url);
  const sanitizedUrlPath = (() => {
    try {
      const parsed = new URL(sanitizedUrl);
      return `${parsed.pathname}${parsed.search}` || "/";
    } catch {
      return match.path;
    }
  })();

  const parsedRequestBody = parseMaybeJson(requestBodyRaw);
  const parsedResponseBody = parseMaybeJson(responseBodyRaw);

  const isBatch = isBatchUrl(entry.request.url);

  const monitored: MonitoredRequest = {
    id: `${entry.startedDateTime}-${entry.request.method}-${entry.request.url}`,
    timestamp: entry.startedDateTime,
    capturedPageUrl,
    url: sanitizedUrl,
    method: normalizeMethod(entry.request.method),
    status: Number(entry.response.status ?? 0),
    latencyMs: Math.max(0, Math.round(entry.time ?? 0)),
    endpointBase: match.base,
    endpointPath: sanitizedUrlPath,
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
  if (requests.length > MAX_REQUESTS) {
    requests.length = MAX_REQUESTS;
  }
  render();
}

function loadExistingHar(): void {
  chrome.devtools.network.getHAR(async (har: { entries?: unknown[] }) => {
    const entries = (har?.entries ?? []) as HarEntry[];
    for (const entry of entries) {
      await processEntry(entry, { respectCaptureState: false });
    }
  });
}

function listenForNewRequests(): void {
  chrome.devtools.network.onRequestFinished.addListener((entry: unknown) => {
    void processEntry(entry as HarEntry);
  });
}

async function bootstrap(): Promise<void> {
  toolbar = new Toolbar(toolbarRoot, {
    onFiltersChanged: (nextState) => {
      const searchChanged = nextState.searchText !== filterState.searchText;
      filterState = nextState;
      captureEnabled = nextState.captureEnabled;
      if (searchChanged) {
        activeSearchMatchIndex = -1;
      }
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
    },
    onCaptureToggled: (enabled) => {
      captureEnabled = enabled;
    },
    onSearchNavigate: (direction) => {
      navigateSearchMatches(direction);
    }
  });

  await toolbar.render();
  loadExistingHar();
  listenForNewRequests();
}

void bootstrap();
