const STANDARD_ENDPOINTS = [
    "https://graph.microsoft.com",
    "https://graph.microsoft.us",
    "https://dod-graph.microsoft.us",
    "https://microsoftgraph.chinacloudapi.cn",
    "https://management.azure.com"
] as const;

// https://nodoc.nathanmcnulty.com/
const INTERNAL_ENDPOINTS = [
    "https://main.iam.ad.ext.azure.com",
    "https://elm.iga.azure.com",
    "https://pds.iga.azure.com",
    "https://api.accessreviews.identitygovernance.azure.com",
    "https://admin.microsoft.com",
    "https://admin.cloud.microsoft",
    "https://portal.office.com",
    "https://security.microsoft.com",
    "https://api.securitycopilot.microsoft.com",
    "https://graph.windows.net",
    "https://api.azrbac.mspim.azure.com",
    "https://purview.microsoft.com/api",
    "https://purview.microsoft.com/apiproxy",
    "https://security.microsoft.com/apiproxy",
    "https://admin.exchange.microsoft.com/beta",
    "https://admin.teams.microsoft.com",
    "https://engage.cloud.microsoft",
    "https://config.office.com",
    "https://clients.config.office.net",
    "https://query.inventory.insights.office.net",
    "https://services.autopatch.microsoft.com",
    "https://intune.microsoft.com/api",
    "https://api.bap.microsoft.com",
    "https://main.b2cadmin.ext.azure.com"
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
