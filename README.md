# ApiXRay

ApiXRay is a cross-browser DevTools panel extension for inspecting Microsoft API traffic with least privilege. It captures requests and responses from the inspected page using `chrome.devtools.network`, then filters, groups, and sanitizes results for analysis.

## Features

- Captures Microsoft Graph and Azure API traffic from DevTools
- Supports pre-existing HAR entries via `chrome.devtools.network.getHAR()`
- Parses batch payloads (`/$batch` and `/batch?api-version=...`) and maps sub-responses
- Redacts sensitive values in headers and body fields
- Method filters, text search, clear action, and JSON export
- Internal endpoint toggle persisted in `chrome.storage.local`
- Build targets for Chromium (`dist/chrome`) and Firefox (`dist/firefox`)

## Project Layout

- `src/devtools`: DevTools page bootstrap and panel registration
- `src/panel`: Panel shell, styles, and rendering components
- `src/shared`: Endpoint matching, sanitization, URL and batch parsing
- `manifests`: Base manifest + browser-specific overrides
- `scripts/build.ts`: Bundles TypeScript and generates dist targets

## Prerequisites

- Node.js 20+
- npm 10+

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

Build output:

- `dist/chrome` for Chrome, Edge, and Brave
- `dist/firefox` for Firefox

## Load in Chromium Browsers

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `dist/chrome`.
5. Open any tab, open DevTools, then select the `ApiXRay` panel.

## Run in Firefox

```bash
npm run firefox:run
```

This launches Firefox with `dist/firefox` loaded as a temporary extension.

## Usage

1. Open DevTools on the target page and select the `ApiXRay` tab.
2. Interact with Azure or Microsoft pages to generate API calls.
3. Use method chips and search input to filter visible entries.
4. Toggle `Show Internal Endpoints` to include or hide internal sources.
5. Expand rows for request/response details.
6. Export sanitized capture data using `Export JSON`.

## Add Endpoints

Edit endpoint arrays in `src/shared/endpoints.ts`.

- `STANDARD_ENDPOINTS`: always shown
- `INTERNAL_ENDPOINTS`: shown when internal toggle is enabled

## Security Notes

- Sensitive headers are redacted (e.g., `Authorization`, `x-ms-authorization-auxiliary`).
- Sensitive body fields are redacted recursively (`access_token`, `refresh_token`, `client_secret`, `id_token`, `client_assertion`).

## Dev Container

The repository includes a dev container setup in `.devcontainer` with Node 20 and `web-ext` installed globally.
