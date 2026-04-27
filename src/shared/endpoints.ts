const STANDARD_ENDPOINTS = [
    "https://graph.microsoft.com",
    "https://graph.microsoft.us",
    "https://dod-graph.microsoft.us",
    "https://microsoftgraph.chinacloudapi.cn",
    "https://management.azure.com"
] as const;

const INTERNAL_ENDPOINTS = [
    "https://main.iam.ad.ext.azure.com",
    "https://elm.iga.azure.com",
    "https://pds.iga.azure.com",
    "https://api.accessreviews.identitygovernance.azure.com",
    "https://admin.microsoft.com",
    "https://admin.cloud.microsoft/fd/addins/api",
    "https://portal.office.com",
    "https://security.microsoft.com",
    "https://graph.windows.net",
    "https://api.azrbac.mspim.azure.com"
] as const;

export interface ScopedEndpoint {
  url: string;
  scope: "standard" | "internal";
}

export function getActiveEndpoints(includeInternal: boolean): ScopedEndpoint[] {
  const standard = STANDARD_ENDPOINTS.map((url) => ({ url, scope: "standard" as const }));

  if (!includeInternal) {
    return standard;
  }

  const internal = INTERNAL_ENDPOINTS.map((url) => ({ url, scope: "internal" as const }));
  return [...standard, ...internal];
}

export { INTERNAL_ENDPOINTS, STANDARD_ENDPOINTS };
