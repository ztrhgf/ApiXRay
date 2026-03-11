export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OTHER";
export type MethodFilter = "ALL" | HttpMethod;

export interface EndpointMatch {
  base: string;
  path: string;
  scope: "standard" | "internal";
}

export interface BatchSubRequest {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface BatchSubResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface BatchPair {
  request: BatchSubRequest;
  response?: BatchSubResponse;
}

export interface MonitoredRequest {
  id: string;
  timestamp: string;
  capturedPageUrl: string;
  url: string;
  method: HttpMethod;
  status: number;
  latencyMs: number;
  endpointBase: string;
  endpointPath: string;
  endpointScope: "standard" | "internal";
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  isBatch: boolean;
  batchPairs: BatchPair[];
}

export interface FilterState {
  selectedMethod: MethodFilter;
  searchText: string;
  includeInternal: boolean;
}
