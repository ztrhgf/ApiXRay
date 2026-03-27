import { createDetailView } from "./detail-view";
import type { MethodFilter, MonitoredRequest } from "../../shared/types";
import { splitPathAndQuery } from "../../shared/url-utils";
import { sanitizeUrl } from "../../shared/sanitizer";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toAbsoluteUrl(base: string, subUrl: string): string {
  if (/^https?:\/\//i.test(subUrl)) {
    return subUrl;
  }

  if (subUrl.startsWith("/")) {
    return `${base}${subUrl}`;
  }

  return `${base}/${subUrl}`;
}

function normalizeMethod(method: string): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OTHER" {
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "POST" || upper === "PUT" || upper === "PATCH" || upper === "DELETE") {
    return upper;
  }
  return "OTHER";
}

function getStatusClass(status: number): string {
  if (status >= 400) {
    return "err";
  }
  if (status >= 300) {
    return "warn";
  }
  return "ok";
}

function revealCopiedNotification(
  scope: ParentNode,
  kind: string,
  text: string,
  variant: "success" | "error" = "success"
): void {
  const message = scope.querySelector<HTMLElement>(`[data-copied-for='${kind}']`);
  if (!message) {
    return;
  }

  const pendingTimeoutId = Number(message.dataset.timeoutId ?? "0");
  if (pendingTimeoutId) {
    window.clearTimeout(pendingTimeoutId);
  }

  message.textContent = text;
  message.classList.add("visible");
  message.classList.toggle("error", variant === "error");

  const timeoutId = window.setTimeout(() => {
    message.classList.remove("visible");
    message.classList.remove("error");
    message.textContent = "";
    delete message.dataset.timeoutId;
  }, 1400);

  message.dataset.timeoutId = String(timeoutId);
}

export function createBatchGroup(
  request: MonitoredRequest,
  selectedMethod: MethodFilter,
  searchText = ""
): HTMLElement {
  const visiblePairs = request.batchPairs.filter((pair) => {
    const method = normalizeMethod(pair.request.method);
    if (method === "OTHER" && pair.request.method.toUpperCase() === "OPTIONS") {
      return false;
    }

    return selectedMethod === "ALL" ? true : method === selectedMethod;
  });

  const root = document.createElement("article");
  root.className = "batch-group";

  const head = document.createElement("div");
  head.className = "row-head";
  const parentSegments = splitPathAndQuery(request.endpointPath);
  const escapedParentMain = escapeHtml(`${request.endpointBase}${parentSegments.mainPath}`);
  const escapedParentQuery = escapeHtml(parentSegments.query);
  head.innerHTML = `
    <button class="icon-btn expand-btn" data-action="expand" title="Toggle batch details" aria-label="Toggle batch details">
      <span class="icon-arrow" aria-hidden="true"></span>
    </button>
    <span class="badge POST">POST</span>
    <span class="url-full"><span class="url-main">${escapedParentMain}</span><span class="url-query">${escapedParentQuery}</span></span>
    <span class="status ok">${request.status}</span>
    <span class="latency">${request.latencyMs} ms</span>
    <span class="row-actions">
      <span class="latency">${visiblePairs.length} requests</span>
      <button class="icon-btn" data-action="copy" title="Copy URL" aria-label="Copy URL">
        <span class="icon-copy" aria-hidden="true"></span>
      </button>
      <span class="copied-note" data-copied-for="batch-parent-url" role="status" aria-live="polite"></span>
    </span>
  `;

  const children = document.createElement("section");
  children.className = "batch-children";
  children.style.display = "none";

  let hasSearchMatch = false;

  for (const pair of visiblePairs) {
    const absoluteUrl = sanitizeUrl(toAbsoluteUrl(request.endpointBase, pair.request.url));
    const absolute = new URL(absoluteUrl);
    const method = normalizeMethod(pair.request.method);
    const childRequest: MonitoredRequest = {
      id: `${request.id}-batch-${pair.request.id}`,
      timestamp: request.timestamp,
      capturedPageUrl: request.capturedPageUrl,
      url: absoluteUrl,
      method,
      status: pair.response?.status ?? 0,
      latencyMs: request.latencyMs,
      endpointBase: absolute.origin,
      endpointPath: `${absolute.pathname}${absolute.search}` || "/",
      endpointScope: request.endpointScope,
      requestHeaders: pair.request.headers ?? {},
      requestBody: pair.request.body ?? null,
      responseHeaders: pair.response?.headers ?? {},
      responseBody: pair.response?.body ?? null,
      isBatch: false,
      batchPairs: []
    };

    const child = document.createElement("div");
    child.className = "batch-child";
    const childSegments = splitPathAndQuery(childRequest.endpointPath);
    const escapedChildMain = escapeHtml(`${childRequest.endpointBase}${childSegments.mainPath}`);
    const escapedChildQuery = escapeHtml(childSegments.query);
    const escapedChildMethod = escapeHtml(pair.request.method.toUpperCase());
    child.innerHTML = `
      <div class="row-head row-head-child">
        <button class="icon-btn expand-btn" data-action="expand" title="Toggle details" aria-label="Toggle details">
          <span class="icon-arrow" aria-hidden="true"></span>
        </button>
        <span class="badge ${method}">${escapedChildMethod}</span>
        <span class="url-full"><span class="url-main">${escapedChildMain}</span><span class="url-query">${escapedChildQuery}</span></span>
        <span class="status ${getStatusClass(childRequest.status)}">${childRequest.status}</span>
        <span class="row-actions">
          <button class="icon-btn" data-action="copy" title="Copy URL" aria-label="Copy URL">
            <span class="icon-copy" aria-hidden="true"></span>
          </button>
          <span class="copied-note" data-copied-for="batch-child-url" role="status" aria-live="polite"></span>
        </span>
      </div>
    `;

    const details = createDetailView(childRequest, {
      isBatchChild: true,
      searchText,
      onCopyOutput: async (payload) => {
        await navigator.clipboard.writeText(payload);
      }
    });
    child.appendChild(details);

    child.querySelector<HTMLButtonElement>("button[data-action='copy']")?.addEventListener("click", (event) => {
      event.stopPropagation();
      void navigator.clipboard
        .writeText(childRequest.url)
        .then(() => {
          revealCopiedNotification(child, "batch-child-url", "Copied", "success");
        })
        .catch(() => {
          revealCopiedNotification(child, "batch-child-url", "Copy failed", "error");
        });
    });

    const childExpandButton = child.querySelector<HTMLButtonElement>("button[data-action='expand']");
    childExpandButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = details.classList.toggle("open");
      details.classList.add("expanding");
      window.setTimeout(() => details.classList.remove("expanding"), 1000);
      childExpandButton.classList.toggle("open", isOpen);
    });

    if (searchText) {
      const childSearchText = child.textContent?.toLowerCase() ?? "";
      const childMatched = childSearchText.includes(searchText) || details.dataset.searchMatch === "true";
      if (childMatched) {
        hasSearchMatch = true;
        childExpandButton?.click();
      }
    }

    children.appendChild(child);
  }

  head.querySelector<HTMLButtonElement>("button[data-action='copy']")?.addEventListener("click", (event) => {
    event.stopPropagation();
    void navigator.clipboard
      .writeText(request.url)
      .then(() => {
        revealCopiedNotification(head, "batch-parent-url", "Copied", "success");
      })
      .catch(() => {
        revealCopiedNotification(head, "batch-parent-url", "Copy failed", "error");
      });
  });

  const parentExpandButton = head.querySelector<HTMLButtonElement>("button[data-action='expand']");
  parentExpandButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = children.style.display === "none";
    children.style.display = open ? "block" : "none";
    children.classList.toggle("open", open);
    children.classList.add("expanding");
    window.setTimeout(() => children.classList.remove("expanding"), 1000);
    parentExpandButton.classList.toggle("open", open);
  });

  if (searchText) {
    const parentMatched = (head.textContent?.toLowerCase() ?? "").includes(searchText);
    if (parentMatched || hasSearchMatch) {
      parentExpandButton?.click();
    }
  }

  root.append(head, children);
  return root;
}
