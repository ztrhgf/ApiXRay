import { createDetailView } from "./detail-view";
import type { MonitoredRequest } from "../../shared/types";
import { splitPathAndQuery } from "../../shared/url-utils";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

type RequestEntryHandlers = {
  onCopyUrl: (url: string) => void | Promise<void>;
  onCopyOutput: (payload: string) => void | Promise<void>;
};

type RequestEntryOptions = {
  searchText?: string;
};

export function createRequestEntry(
  request: MonitoredRequest,
  handlers: RequestEntryHandlers,
  options: RequestEntryOptions = {}
): HTMLElement {
  const root = document.createElement("article");
  root.className = "request-entry";

  const row = document.createElement("div");
  row.className = "row-head";

  const { mainPath, query } = splitPathAndQuery(request.endpointPath);
  const escapedMain = escapeHtml(`${request.endpointBase}${mainPath}`);
  const escapedQuery = escapeHtml(query);
  const escapedMethod = escapeHtml(request.method);
  row.innerHTML = `
    <button class="icon-btn expand-btn" data-action="expand" title="Toggle details" aria-label="Toggle details">
      <span class="icon-arrow" aria-hidden="true"></span>
    </button>
    <span class="badge ${request.method}">${escapedMethod}</span>
    <span class="url-full"><span class="url-main">${escapedMain}</span><span class="url-query">${escapedQuery}</span></span>
    <span class="status ${getStatusClass(request.status)}">${request.status}</span>
    <span class="latency">${request.latencyMs} ms</span>
    <span class="row-actions">
      <button class="icon-btn" data-action="copy" title="Copy URL" aria-label="Copy URL">
        <span class="icon-copy" aria-hidden="true"></span>
      </button>
      <span class="copied-note" data-copied-for="row-url" role="status" aria-live="polite"></span>
    </span>
  `;

  const details = createDetailView(request, {
    onCopyOutput: handlers.onCopyOutput,
    searchText: options.searchText
  });

  const revealCopiedNotification = (text: string, variant: "success" | "error" = "success"): void => {
    const message = row.querySelector<HTMLElement>("[data-copied-for='row-url']");
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
  };

  row.querySelector<HTMLButtonElement>("button[data-action='copy']")?.addEventListener("click", (event) => {
    event.stopPropagation();
    void Promise.resolve(handlers.onCopyUrl(request.url))
      .then(() => {
        revealCopiedNotification("Copied", "success");
      })
      .catch(() => {
        revealCopiedNotification("Copy failed", "error");
      });
  });

  const expandButton = row.querySelector<HTMLButtonElement>("button[data-action='expand']");
  const toggleDetails = () => {
    const isOpen = details.classList.toggle("open");
    details.classList.add("expanding");
    window.setTimeout(() => details.classList.remove("expanding"), 1000);
    expandButton?.classList.toggle("open", isOpen);
  };

  expandButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleDetails();
  });

  if (options.searchText) {
    const searchInRow = row.textContent?.toLowerCase().includes(options.searchText) ?? false;
    const searchInDetails = details.dataset.searchMatch === "true";
    if (searchInRow || searchInDetails) {
      toggleDetails();
    }
  }

  root.append(row, details);
  return root;
}
