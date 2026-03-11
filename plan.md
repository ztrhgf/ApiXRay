# Plan: ApiXRay Browser Extension

## TL;DR
Build a cross-browser DevTools panel extension (Chrome, Edge, Firefox, Brave) that monitors API calls to Microsoft Graph, Azure Management, and other Microsoft endpoints. Uses `chrome.devtools.network` API for zero-permission request/response capture. TypeScript + esbuild for cross-browser builds. Dev Container for consistent development environment. Edge and Brave use the same Chrome/Chromium build — no extra work.

## Architecture

### Why DevTools Panel?
- `chrome.devtools.network.onRequestFinished` provides full HAR entries (request headers, request body, response headers, response body via `getContent()`)
- `chrome.devtools.network.getHAR()` returns already-captured requests (solves the "nice-to-have")
- **Truly least-privilege**: No `host_permissions` needed — DevTools API passively observes the inspected page
- Only permission needed: `storage` (for persisting internal endpoints toggle)
- No content scripts, no background service worker for core functionality

### Data Flow
```
Web Page → Browser Network Stack → DevTools Network API
                                        ↓
                                   devtools.js (creates panel)
                                        ↓
                                   panel.ts (listens to onRequestFinished)
                                        ↓
                                   endpoint-matcher → batch-parser → sanitizer → UI render
```

### Key Components
1. **Endpoint Matcher** — checks if a URL starts with any monitored base URL; returns the matched base + remainder
2. **Batch Parser** — detects `$batch` / `/batch?` URLs, parses JSON request body to extract sub-requests, matches responses by ID
3. **Sanitizer** — redacts Authorization headers, access_token, refresh_token, client_secret, id_token from display
4. **Panel UI** — renders captured calls with method badges, colored base URLs, expandable details, copy buttons

## Project Structure
```
ApiXRay/
├── .devcontainer/
│   ├── devcontainer.json
│   └── Dockerfile
├── src/
│   ├── devtools/
│   │   ├── devtools.html           # devtools_page entry (creates panel)
│   │   └── devtools.ts
│   ├── panel/
│   │   ├── panel.html              # Panel UI shell
│   │   ├── panel.ts                # Main panel logic + event listeners
│   │   ├── panel.css               # Styles (auto dark/light theme)
│   │   └── components/
│   │       ├── request-entry.ts    # Renders a single API call row
│   │       ├── batch-group.ts      # Renders a batch group with children
│   │       ├── detail-view.ts      # Expandable request/response detail
│   │       └── toolbar.ts          # Filter bar, clear button, toggles
│   ├── shared/
│   │   ├── endpoints.ts            # STANDARD + INTERNAL endpoint arrays
│   │   ├── batch-parser.ts         # Batch request/response parsing
│   │   ├── sanitizer.ts            # Token/secret redaction
│   │   ├── url-utils.ts            # URL parsing, base extraction
│   │   └── types.ts                # TypeScript interfaces
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
├── manifests/
│   ├── base.json                   # Shared manifest fields
│   ├── chrome.json                 # Chrome/Edge/Brave overrides
│   └── firefox.json                # Firefox overrides (browser_specific_settings)
├── scripts/
│   └── build.ts                    # esbuild + manifest merge script
├── dist/                           # Build output (gitignored)
│   ├── chrome/
│   └── firefox/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .gitignore
└── README.md
```

## Steps

### Phase 1: Project Scaffold & Dev Container
1. Initialize `package.json` with dependencies: `esbuild`, `typescript`, `@anthropic-ai/eslint-plugin` (or basic eslint), `web-ext`
2. Create `tsconfig.json` — target ES2020, strict mode, module ESNext
3. Create `.devcontainer/Dockerfile` — Node 20 LTS base, install web-ext globally
4. Create `.devcontainer/devcontainer.json` — reference Dockerfile, mount workspace, VS Code extensions (ESLint, Prettier)
5. Create `.gitignore` — dist/, node_modules/
6. Create `.eslintrc.json` — basic TypeScript linting

### Phase 2: Manifests & Build System
7. Create `manifests/base.json` — shared manifest fields (name, version, description, devtools_page, permissions: ["storage"], icons)
8. Create `manifests/chrome.json` — manifest_version: 3, no extras needed
9. Create `manifests/firefox.json` — manifest_version: 3, `browser_specific_settings.gecko.id`
10. Create `scripts/build.ts` — esbuild bundling + manifest merge for chrome/firefox outputs into dist/
    - Bundle `devtools.ts` → `devtools.js`
    - Bundle `panel.ts` → `panel.js`
    - Copy HTML, CSS, icons
    - Merge base manifest with browser-specific overrides → `dist/{browser}/manifest.json`

### Phase 3: Core Shared Modules
11. Create `src/shared/types.ts` — interfaces: `MonitoredRequest`, `BatchSubRequest`, `BatchSubResponse`, `EndpointMatch`, `FilterState` — *parallel with steps 12-14*
12. Create `src/shared/endpoints.ts` — STANDARD_ENDPOINTS and INTERNAL_ENDPOINTS arrays with the exact URLs from requirements. Export a function `getActiveEndpoints(includeInternal: boolean)` — *parallel with step 11*
13. Create `src/shared/url-utils.ts` — functions: `matchEndpoint(url, endpoints)` returns `{base, path}` or null; `isBatchUrl(url)` detects batch endpoints; `formatUrl(base, path)` for display — *parallel with step 11*
14. Create `src/shared/sanitizer.ts` — `sanitizeHeaders(headers)` redacts Authorization, x-ms-authorization-auxiliary; `sanitizeBody(json)` deep-redacts access_token, refresh_token, client_secret, id_token, client_assertion replacing values with `[REDACTED]` — *parallel with step 11*
15. Create `src/shared/batch-parser.ts` — `parseBatchRequest(bodyText)` extracts requests array; `parseBatchResponse(bodyText)` extracts responses array; `matchBatchPairs(requests, responses)` joins by ID. Handles both Graph `/$batch` and Azure Management `/batch?api-version=...` payload formats — *depends on 11*

### Phase 4: DevTools Entry Point
16. Create `src/devtools/devtools.html` — minimal HTML with script tag loading devtools.js
17. Create `src/devtools/devtools.ts` — calls `chrome.devtools.panels.create("ApiXRay", icon, "panel/panel.html")` — *depends on 16*

### Phase 5: Panel UI
18. Create `src/panel/panel.html` — toolbar area + scrollable request list container + empty state message
19. Create `src/panel/panel.css` — styles with CSS custom properties that auto-detect DevTools theme via `@media (prefers-color-scheme: dark)` and `chrome.devtools.panels.themeName`; color-coded method badges (GET=green, POST=blue, PATCH=orange, DELETE=red, PUT=purple); distinct base URL color vs path/params color
20. Create `src/panel/components/toolbar.ts` — renders: method filter toggles (GET/POST/PUT/PATCH/DELETE/OTHER), "Show Internal Endpoints" checkbox (persisted to chrome.storage.local), Clear button, text search input (filters by URL substring), Export JSON button. Emits filter change events — *depends on 11*
21. Create `src/panel/components/request-entry.ts` — renders a single API call row: method badge, colored base URL, path+params (different color), status code, latency (ms from HAR timings), copy URL button (clipboard API), expandable chevron. Click expands to show detail-view — *depends on 11, 13*
22. Create `src/panel/components/batch-group.ts` — renders a collapsible batch parent row (shows "BATCH: POST {url} — {N} requests") with children request-entries for each sub-request. Each child shows the sub-request method, relative URL, status, and response body preview — *depends on 11, 15, 21*
23. Create `src/panel/components/detail-view.ts` — expandable section showing: request headers (sanitized), request body (JSON-formatted), response headers, response body (JSON-formatted, sanitized). Uses `<pre>` blocks with syntax-like formatting — *depends on 14*
24. Create `src/panel/panel.ts` — main orchestrator:
    - On load: call `chrome.devtools.network.getHAR()` to process already-captured requests
    - Register `chrome.devtools.network.onRequestFinished` listener
    - For each request: check URL against active endpoints → if match, create MonitoredRequest → if batch, parse and expand → sanitize → render via components
    - Wire up toolbar filter/clear/search/export events
    - Handle copy-to-clipboard via `navigator.clipboard.writeText()`
    - Export: serialize captured `MonitoredRequest[]` to JSON (sanitized) and trigger download via Blob + anchor click
    - *depends on all prior steps*

### Phase 6: Icons & Polish
25. Generate simple icon PNGs (16, 48, 128) — magnifying glass / X-ray theme — *parallel with any step*
26. Create `README.md` — installation instructions (load unpacked for Chrome/Edge/Brave, web-ext for Firefox), usage guide, how to add new endpoints

## Relevant Files

- `manifests/base.json` — shared manifest; only `storage` permission, `devtools_page` pointing to `devtools/devtools.html`
- `src/shared/endpoints.ts` — single source of truth for all monitored endpoints; adding a new endpoint = appending a string to an array
- `src/shared/batch-parser.ts` — core logic for decomposing batch requests/responses; matches by `id` field
- `src/shared/sanitizer.ts` — security-critical; must redact all auth tokens before display
- `src/panel/panel.ts` — wires `chrome.devtools.network` events to the UI components
- `src/panel/panel.css` — theme detection and color scheme for method badges, base URLs
- `scripts/build.ts` — generates `dist/chrome/` and `dist/firefox/` from shared source
- `.devcontainer/devcontainer.json` — Docker-based dev environment with Node 20

## Verification

1. **Build succeeds**: Run `npm run build` — produces `dist/chrome/` and `dist/firefox/` with valid manifest.json, bundled JS, HTML, CSS, icons
2. **Chrome load**: Load `dist/chrome/` as unpacked extension → open DevTools on any Azure portal page → "ApiXRay" tab appears
3. **Edge load**: Load `dist/chrome/` as unpacked extension in `edge://extensions` → identical behavior to Chrome
4. **Firefox load**: Run `npx web-ext run -s dist/firefox/` → open DevTools → "ApiXRay" tab appears
5. **Endpoint capture**: Open https://portal.azure.com, navigate around → verify Graph and Management API calls appear in panel
6. **Batch parsing**: Trigger a batch call (e.g., Entra ID search) → verify batch parent shows with individual sub-requests grouped beneath it
7. **Sanitization**: Verify no Authorization header values or tokens are visible in the panel output
8. **Filter by method**: Toggle method filters → verify list updates to show only selected methods
9. **Text search**: Type in search box → verify list filters to matching URLs
10. **Internal endpoints toggle**: Enable "Show Internal Endpoints" → verify additional endpoints are monitored; disable → verify they're hidden
11. **Clear**: Click clear → verify list empties; new calls still appear
12. **Copy URL**: Click copy icon → verify URL is in clipboard
13. **Export JSON**: Click export → verify a .json file downloads with sanitized request data
14. **Latency display**: Verify each request row shows response time in ms
15. **Already-made calls**: Open a page, let it make API calls, THEN open DevTools → verify pre-existing calls appear (via getHAR)
16. **Theme**: Switch DevTools to light/dark → verify panel matches

## Decisions

- **DevTools panel** chosen over popup/sidebar — only approach that gives full request+response bodies via HAR with zero host_permissions
- **TypeScript + esbuild** for type safety and cross-browser bundle compatibility
- **No background service worker** needed — all logic lives in the DevTools panel context (simpler, fewer permissions)
- **No content scripts** — DevTools network API is sufficient; avoids injecting code into pages
- **Permissions**: Only `storage` — no `webRequest`, no `host_permissions`, no `activeTab`. True least-privilege.
- **Two build targets**: Chromium (Chrome/Edge/Brave share `dist/chrome/`) and Firefox (`dist/firefox/`). Edge and Brave are Chromium — zero extra work.
- **Batch formats supported**: Microsoft Graph `/$batch` (POST with JSON `{requests:[...]}`) and Azure Management `/batch?api-version=` (same structure)
- **Adding endpoints**: Edit a single array in `endpoints.ts` — no manifest changes needed
- **Icons**: Placeholder SVG-based PNGs initially; can be refined later
