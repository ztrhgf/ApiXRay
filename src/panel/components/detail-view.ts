import { sanitizeBody, sanitizeHeaders } from "../../shared/sanitizer";
import type { MonitoredRequest } from "../../shared/types";

type DetailViewOptions = {
  isBatchChild?: boolean;
  onCopyOutput?: (payload: string) => void;
  searchText?: string;
};

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
  const showRequestBody = !options.isBatchChild || requestBodyText !== "(empty)";

  const sections: string[] = [];
  const searchText = options.searchText ?? "";

  if (showRequestHeaders) {
    const headersText = prettyJson(sanitizedRequestHeaders);
    sections.push(`
      <strong>Request Headers</strong>
      <pre class="json-block">${highlightText(headersText, searchText)}</pre>
    `);
  }

  if (showRequestBody) {
    sections.push(`
      <strong>Request Body</strong>
      <pre class="json-block">${highlightText(requestBodyText, searchText)}</pre>
    `);
  }

  const responseBodyText = prettyJson(request.responseBody);
  sections.push(`
    <strong>Response Body</strong>
    <pre class="json-block">${highlightText(responseBodyText, searchText)}</pre>
  `);

  const copyPayload = {
    ...(showRequestHeaders ? { requestHeaders: sanitizedRequestHeaders } : {}),
    ...(showRequestBody ? { requestBody: sanitizeBody(request.requestBody) } : {}),
    responseBody: sanitizeBody(request.responseBody)
  };

  container.innerHTML = `
    <div class="details-actions">
      <button class="icon-btn" data-action="copy-output" title="Copy output" aria-label="Copy output">
        <span class="icon-copy" aria-hidden="true"></span>
      </button>
    </div>
    ${sections.join("\n")}
  `;

  const copyOutputButton = container.querySelector<HTMLButtonElement>("button[data-action='copy-output']");
  copyOutputButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onCopyOutput?.(JSON.stringify(copyPayload, null, 2));
  });

  const searchableText = [
    showRequestHeaders ? prettyJson(sanitizedRequestHeaders) : "",
    showRequestBody ? requestBodyText : "",
    responseBodyText
  ]
    .join("\n")
    .toLowerCase();

  if (searchText && searchableText.includes(searchText.toLowerCase())) {
    container.dataset.searchMatch = "true";
  }

  return container;
}
