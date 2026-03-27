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

function flashCopyButton(button: HTMLButtonElement, variant: "success" | "error"): void {
  const successClass = "copy-feedback-success";
  const errorClass = "copy-feedback-error";
  button.classList.remove(successClass, errorClass);

  const pendingTimeoutId = Number(button.dataset.feedbackTimeoutId ?? "0");
  if (pendingTimeoutId) {
    window.clearTimeout(pendingTimeoutId);
  }

  void button.offsetWidth;
  button.classList.add(variant === "success" ? successClass : errorClass);

  const timeoutId = window.setTimeout(() => {
    button.classList.remove(successClass, errorClass);
    delete button.dataset.feedbackTimeoutId;
  }, 900);

  button.dataset.feedbackTimeoutId = String(timeoutId);
}

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
    </span>
  `;

  const details = createDetailView(request, {
    onCopyOutput: handlers.onCopyOutput,
    searchText: options.searchText
  });

  const copyButton = row.querySelector<HTMLButtonElement>("button[data-action='copy']");
  copyButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    void Promise.resolve(handlers.onCopyUrl(request.url))
      .then(() => {
        flashCopyButton(copyButton, "success");
      })
      .catch(() => {
        flashCopyButton(copyButton, "error");
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
