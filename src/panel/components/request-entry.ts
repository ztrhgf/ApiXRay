import { createDetailView } from "./detail-view";
import type { MonitoredRequest } from "../../shared/types";
import { splitPathAndQuery } from "../../shared/url-utils";

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
  onCopyUrl: (url: string) => void;
  onCopyOutput: (payload: string) => void;
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
  row.innerHTML = `
    <button class="icon-btn expand-btn" data-action="expand" title="Toggle details" aria-label="Toggle details">
      <span class="icon-arrow" aria-hidden="true"></span>
    </button>
    <span class="badge ${request.method}">${request.method}</span>
    <span class="url-full"><span class="url-main">${request.endpointBase}${mainPath}</span><span class="url-query">${query}</span></span>
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

  row.querySelector<HTMLButtonElement>("button[data-action='copy']")?.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onCopyUrl(request.url);
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
