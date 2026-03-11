import type { EndpointMatch } from "./types";
import type { ScopedEndpoint } from "./endpoints";

function normalizeBase(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

export function matchEndpoint(url: string, endpoints: ScopedEndpoint[]): EndpointMatch | null {
  const normalizedUrl = normalizeBase(url);

  for (const endpoint of endpoints) {
    const base = normalizeBase(endpoint.url);
    if (!normalizedUrl.startsWith(base)) {
      continue;
    }

    const path = normalizedUrl.slice(base.length) || "/";
    return {
      base,
      path,
      scope: endpoint.scope
    };
  }

  return null;
}

export function isBatchUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("/$batch") || lower.includes("/batch?");
}

export function formatUrl(base: string, path: string): string {
  return `${base}${path}`;
}

export function splitPathAndQuery(path: string): { mainPath: string; query: string } {
  const queryIndex = path.indexOf("?");
  if (queryIndex < 0) {
    return { mainPath: path, query: "" };
  }

  return {
    mainPath: path.slice(0, queryIndex),
    query: path.slice(queryIndex)
  };
}
