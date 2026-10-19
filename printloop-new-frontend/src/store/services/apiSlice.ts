import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { CONFIG } from "@/constants/config";
import type { RootState } from "@/store";
import { logOut, setCredentials } from "@/store/features/auth/authSlice";

const rawBase = fetchBaseQuery({
  baseUrl: CONFIG.apiBaseUrl,
  prepareHeaders: (headers, { getState, endpoint }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const url = endpoint as string;
    const isOperatorRoute =
      typeof url === "string" && (url.startsWith("saas/") || url.startsWith("admin/"));
    if (!isOperatorRoute) {
      const urlParams = new URLSearchParams(window.location.search);
      let tenantSlug = urlParams.get("tenantSlug");
      if (tenantSlug) {
        sessionStorage.setItem("activeTenantSlug", tenantSlug);
      } else {
        tenantSlug = sessionStorage.getItem("activeTenantSlug");
      }
      if (tenantSlug) {
        headers.set("X-Tenant-Slug", tenantSlug);
      }
    }

    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  let result = await rawBase(args, api, extraOptions);

  if (result.error && (result.error.status === 401 || result.error.status === 403)) {
    const refreshToken = (api.getState() as RootState).auth.refreshToken;
    if (!refreshToken) {
      api.dispatch(logOut());
      return result;
    }

    const refreshRes = await rawBase(
      { url: "auth/refresh", method: "POST", body: { refreshToken } },
      api,
      extraOptions
    );
    const refreshed: any = refreshRes.data;
    if (refreshed) {
      const payload = refreshed.response || refreshed.data || refreshed;
      api.dispatch(setCredentials(payload));
      result = await rawBase(args, api, extraOptions);
    } else {
      api.dispatch(logOut());
    }
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Auth", "Jobs", "Stations", "GroupSessions", "Pricing",
    "AdminStats", "AdminJobs", "AdminUsers", "AdminKiosks", "AdminPricing",
    "AdminPromotions", "AdminTransactions", "AdminReports", "AdminSettings",
    "AdminAudit", "AdminDisputes", "AdminBlog", "AdminPrinterProfiles",
    "Blog",
    "TenantMe", "TenantBalance", "TenantPayouts", "TenantTransactions",
    "TenantBranding", "TenantDomains", "TenantWebhooks",
    "TenantKiosks", "TenantOps",
    "PlatformTenants", "ShopDetail",
    "TenantEditPricing", "TenantEditQueue", "TenantEditJob",
  ],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
