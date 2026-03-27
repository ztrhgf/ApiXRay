import { sanitizeBody, sanitizeHeaders } from "../../shared/sanitizer";
import type { MonitoredRequest } from "../../shared/types";

type DetailViewOptions = {
  isBatchChild?: boolean;
  onCopyOutput?: (payload: string) => void;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightText(value: string, searchText: string): string {
  if (!searchText) {
    return escapeHtml(value);
  }

  const lowerValue = value.toLowerCase();
  const lowerNeedle = searchText.toLowerCase();
  if (!lowerNeedle) {
    return escapeHtml(value);
  }

  let cursor = 0;
  let output = "";

  while (cursor < value.length) {
    const index = lowerValue.indexOf(lowerNeedle, cursor);
    if (index < 0) {
      output += escapeHtml(value.slice(cursor));
      break;
    }

    output += escapeHtml(value.slice(cursor, index));
    output += `<mark class="match-hit">${escapeHtml(value.slice(index, index + lowerNeedle.length))}</mark>`;
    cursor = index + lowerNeedle.length;
  }

  return output;
}

function prettyJson(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "(empty)";
  }

  if (typeof value === "string") {
    try {
      return JSON.stringify(sanitizeBody(JSON.parse(value)), null, 2);
    } catch {
      return value;
    }
  }

  return JSON.stringify(sanitizeBody(value), null, 2);
}

function isEmptyBodyText(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized === "(empty)" ||
    normalized === '"(empty)"' ||
    normalized === "null" ||
    normalized === '""'
  );
}

export function createDetailView(request: MonitoredRequest, options: DetailViewOptions = {}): HTMLElement {
  const container = document.createElement("div");
  container.className = "details";

  const sanitizedRequestHeaders = sanitizeHeaders(request.requestHeaders);
  const headerKeys = Object.keys(sanitizedRequestHeaders);
  const meaningfulHeaderKeys = headerKeys.filter((key) => {
    const lower = key.toLowerCase();
    return lower !== "x-ms-command-name" && lower !== "content-type";
  });

  const requestBodyText = prettyJson(request.requestBody);
  const showRequestHeaders = !options.isBatchChild || meaningfulHeaderKeys.length > 0;
  const showRequestBody = !isEmptyBodyText(requestBodyText);
  const responseBodyText = prettyJson(request.responseBody);
  const showResponseBody = !isEmptyBodyText(responseBodyText);
  const requestHeadersText = showRequestHeaders ? prettyJson(sanitizedRequestHeaders) : "";

  const sections: string[] = [];
  const searchText = options.searchText ?? "";
  const lowerSearchText = searchText.toLowerCase();
  const requestHeadersMatch = Boolean(lowerSearchText) && requestHeadersText.toLowerCase().includes(lowerSearchText);
  const requestHeadersContentId = `request-headers-content-${request.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  if (showRequestHeaders) {
    sections.push(`
      <section class="detail-section detail-section-collapsible ${requestHeadersMatch ? "open" : ""}" data-section="request-headers">
        <div class="detail-section-head">
          <button class="section-toggle-btn ${requestHeadersMatch ? "open" : ""}" data-action="toggle-request-headers" title="Toggle Request Headers" aria-label="Toggle Request Headers" aria-expanded="${requestHeadersMatch ? "true" : "false"}" aria-controls="${requestHeadersContentId}">
            <span class="icon-arrow" aria-hidden="true"></span>
            <strong>Request Headers</strong>
          </button>
          <span class="detail-section-actions">
            <button class="icon-btn" data-action="copy-section" data-copy-kind="request-headers" title="Copy Request Headers" aria-label="Copy Request Headers">
              <span class="icon-copy" aria-hidden="true"></span>
            </button>
          </span>
        </div>
        <pre id="${requestHeadersContentId}" class="json-block section-content">${highlightText(requestHeadersText, searchText)}</pre>
      </section>
    `);
  }

  if (showRequestBody) {
    sections.push(`
      <section class="detail-section" data-section="request-body">
        <div class="detail-section-head">
          <strong>Request Body</strong>
          <span class="detail-section-actions">
            <button class="icon-btn" data-action="copy-section" data-copy-kind="request-body" title="Copy Request Body" aria-label="Copy Request Body">
              <span class="icon-copy" aria-hidden="true"></span>
            </button>
          </span>
        </div>
        <pre class="json-block section-content">${highlightText(requestBodyText, searchText)}</pre>
      </section>
    `);
  }

  if (showResponseBody) {
    sections.push(`
      <section class="detail-section" data-section="response-body">
        <div class="detail-section-head">
          <strong>Response Body</strong>
          <span class="detail-section-actions">
            <button class="icon-btn" data-action="copy-section" data-copy-kind="response-body" title="Copy Response Body" aria-label="Copy Response Body">
              <span class="icon-copy" aria-hidden="true"></span>
            </button>
          </span>
        </div>
        <pre class="json-block section-content">${highlightText(responseBodyText, searchText)}</pre>
      </section>
    `);
  }

  const copyTextBySection: Record<string, string> = {
    "request-headers": requestHeadersText,
    "request-body": requestBodyText,
    "response-body": responseBodyText
  };

  container.innerHTML = `
    ${sections.join("\n")}
  `;

  const requestHeadersSection = container.querySelector<HTMLElement>("[data-section='request-headers']");
  const requestHeadersToggle = container.querySelector<HTMLButtonElement>("button[data-action='toggle-request-headers']");
  requestHeadersToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = requestHeadersSection?.classList.toggle("open") ?? false;
    requestHeadersToggle.classList.toggle("open", isOpen);
    requestHeadersToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  const copySectionButtons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button[data-action='copy-section']")
  );

  const jsonBlocks = Array.from(container.querySelectorAll<HTMLElement>(".json-block"));
  for (const block of jsonBlocks) {
    block.addEventListener(
      "wheel",
      (event) => {
        if (event.deltaY === 0 || event.ctrlKey) {
          return;
        }

        const pageScroller = document.scrollingElement;
        if (!pageScroller) {
          return;
        }

        const hasVerticalOverflow = block.scrollHeight > block.clientHeight + 1;
        if (!hasVerticalOverflow) {
          pageScroller.scrollTop += event.deltaY;
          event.preventDefault();
          return;
        }

        const isAtTop = block.scrollTop <= 0;
        const isAtBottom = block.scrollTop + block.clientHeight >= block.scrollHeight - 1;
        if ((event.deltaY < 0 && isAtTop) || (event.deltaY > 0 && isAtBottom)) {
          pageScroller.scrollTop += event.deltaY;
          event.preventDefault();
        }
      },
      { passive: false }
    );
  }

  for (const button of copySectionButtons) {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const kind = button.dataset.copyKind ?? "";
      const text = copyTextBySection[kind];
      if (!text) {
        return;
      }

      try {
        if (options.onCopyOutput) {
          await Promise.resolve(options.onCopyOutput(text));
        } else {
          await navigator.clipboard.writeText(text);
        }
        flashCopyButton(button, "success");
      } catch {
        flashCopyButton(button, "error");
      }
    });
  }

  const searchableText = [
    showRequestHeaders ? requestHeadersText : "",
    showRequestBody ? requestBodyText : "",
    showResponseBody ? responseBodyText : ""
  ]
    .join("\n")
    .toLowerCase();

  if (searchText && searchableText.includes(searchText.toLowerCase())) {
    container.dataset.searchMatch = "true";
  }

  return container;
}
