import { apiSlice } from "@/store/services/apiSlice";

function qs(params?: Record<string, any>) {
  const q = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

const unwrap = (r: any) => r?.data ?? r;

export const adminApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    adminLogin: builder.mutation<any, { email: string; password: string }>({
      query: (body) => ({ url: "admin/auth/login", method: "POST", body }),
    }),
    getAdminMe: builder.query<any, void>({
      query: () => "admin/auth/me",
      transformResponse: unwrap,
    }),

    getDashboardStats: builder.query<any, void>({
      query: () => "admin/dashboard/stats",
      transformResponse: unwrap,
      providesTags: ["AdminStats"],
    }),

    getAdminJobs: builder.query<
      any,
      { status?: string; search?: string; page?: number; limit?: number } | void
    >({
      query: (p) => `saas/jobs${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminJobs"],
    }),
    requeueJob: builder.mutation<any, string>({
      query: (id) => ({ url: `saas/jobs/${id}/requeue`, method: "PATCH" }),
      invalidatesTags: ["AdminJobs", "AdminStats"],
    }),
    updateJobStatus: builder.mutation<any, { id: string; status: string }>({
      query: ({ id, status }) => ({
        url: `saas/jobs/${id}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["AdminJobs", "AdminStats"],
    }),

    getAdminUsers: builder.query<
      any,
      { search?: string; page?: number; limit?: number } | void
    >({
      query: (p) => `admin/users${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminUsers"],
    }),
    getAdminUser: builder.query<any, string>({
      query: (id) => `admin/users/${id}`,
      transformResponse: unwrap,
      providesTags: ["AdminUsers"],
    }),
    blockUser: builder.mutation<any, { id: string; isBlocked: boolean; reason?: string }>({
      query: ({ id, ...body }) => ({
        url: `admin/users/${id}/block`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["AdminUsers", "AdminStats"],
    }),
    setUserRole: builder.mutation<any, { id: string; role: string }>({
      query: ({ id, role }) => ({
        url: `admin/users/${id}/role`,
        method: "PATCH",
        body: { role },
      }),
      invalidatesTags: ["AdminUsers"],
    }),
    setUserPrivileges: builder.mutation<any, { id: string; privileges: string[] }>({
      query: ({ id, privileges }) => ({
        url: `admin/users/${id}/privileges`,
        method: "PATCH",
        body: { privileges },
      }),
      invalidatesTags: ["AdminUsers"],
    }),

    getPricing: builder.query<any, void>({
      query: () => "admin/pricing",
      transformResponse: unwrap,
      providesTags: ["AdminPricing"],
    }),
    updatePricingConfig: builder.mutation<any, { id: string; [k: string]: any }>({
      query: ({ id, ...body }) => ({
        url: `admin/pricing/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["AdminPricing", "Pricing"],
    }),
    createPricingConfig: builder.mutation<any, Record<string, any>>({
      query: (body) => ({ url: "admin/pricing", method: "POST", body }),
      invalidatesTags: ["AdminPricing", "Pricing"],
    }),
    deletePricingConfig: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/pricing/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminPricing", "Pricing"],
    }),

    getPromotions: builder.query<any, void>({
      query: () => "admin/promotions",
      transformResponse: unwrap,
      providesTags: ["AdminPromotions"],
    }),
    createPromotion: builder.mutation<any, any>({
      query: (body) => ({ url: "admin/promotions", method: "POST", body }),
      invalidatesTags: ["AdminPromotions"],
    }),
    updatePromotion: builder.mutation<any, { id: string; [k: string]: any }>({
      query: ({ id, ...body }) => ({
        url: `admin/promotions/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["AdminPromotions"],
    }),

    getBlogPosts: builder.query<any, void>({
      query: () => "admin/blog",
      transformResponse: unwrap,
      providesTags: ["AdminBlog"],
    }),
    createBlogPost: builder.mutation<any, any>({
      query: (body) => ({ url: "admin/blog", method: "POST", body }),
      invalidatesTags: ["AdminBlog", "Blog"],
    }),
    updateBlogPost: builder.mutation<any, { id: string; [k: string]: any }>({
      query: ({ id, ...body }) => ({ url: `admin/blog/${id}`, method: "PATCH", body }),
      invalidatesTags: ["AdminBlog", "Blog"],
    }),
    deleteBlogPost: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/blog/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminBlog", "Blog"],
    }),

    getPrinterProfiles: builder.query<any, void>({
      query: () => "admin/printer-profiles",
      transformResponse: unwrap,
      providesTags: ["AdminPrinterProfiles"],
    }),
    createPrinterProfile: builder.mutation<any, any>({
      query: (body) => ({ url: "admin/printer-profiles", method: "POST", body }),
      invalidatesTags: ["AdminPrinterProfiles"],
    }),
    updatePrinterProfile: builder.mutation<any, { id: string; [k: string]: any }>({
      query: ({ id, ...body }) => ({
        url: `admin/printer-profiles/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["AdminPrinterProfiles"],
    }),
    deletePrinterProfile: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/printer-profiles/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminPrinterProfiles"],
    }),
    releaseJob: builder.mutation<any, string>({
      query: (id) => ({ url: `saas/jobs/${id}/release`, method: "POST" }),
      invalidatesTags: ["AdminJobs"],
    }),
    acceptJob: builder.mutation<any, string>({
      query: (id) => ({ url: `saas/jobs/${id}/accept`, method: "POST" }),
      invalidatesTags: ["AdminJobs"],
    }),

    getTransactions: builder.query<
      any,
      { status?: string; method?: string; page?: number; limit?: number } | void
    >({
      query: (p) => `admin/transactions${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminTransactions"],
    }),

    getRevenueReport: builder.query<any, { days?: number } | void>({
      query: (p) => `admin/reports/revenue${qs({ days: (p as any)?.days ?? 30 })}`,
      transformResponse: unwrap,
      providesTags: ["AdminReports"],
    }),
    getKioskReport: builder.query<any, void>({
      query: () => "admin/reports/kiosks",
      transformResponse: unwrap,
      providesTags: ["AdminReports"],
    }),

    getSettings: builder.query<any, void>({
      query: () => "admin/settings",
      transformResponse: unwrap,
      providesTags: ["AdminSettings"],
    }),
    updateSetting: builder.mutation<any, { key: string; value: string | number | boolean }>({
      query: ({ key, value }) => ({
        url: `admin/settings/${key}`,
        method: "PATCH",
        body: { value },
      }),
      invalidatesTags: ["AdminSettings"],
    }),

    getAuditLogs: builder.query<
      any,
      { page?: number; limit?: number; action?: string } | void
    >({
      query: (p) => `admin/audit-logs${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminAudit"],
    }),

    getAdminKiosks: builder.query<
      any,
      { status?: string; campus?: string; location?: string } | void
    >({
      query: (p) => `admin/kiosks${qs(p as any)}`,
      transformResponse: unwrap,
      providesTags: ["AdminKiosks"],
    }),
    createKiosk: builder.mutation<any, Record<string, any>>({
      query: (body) => ({ url: "admin/kiosks", method: "POST", body }),
      invalidatesTags: ["AdminKiosks", "Stations"],
    }),
    updateKiosk: builder.mutation<any, { id: string; [k: string]: any }>({
      query: ({ id, ...body }) => ({ url: `admin/kiosks/${id}`, method: "PATCH", body }),
      invalidatesTags: ["AdminKiosks", "Stations"],
    }),
    updateKioskStatus: builder.mutation<any, { id: string; status: string }>({
      query: ({ id, status }) => ({
        url: `admin/kiosks/${id}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["AdminKiosks", "Stations"],
    }),
    deleteKiosk: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/kiosks/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminKiosks", "Stations"],
    }),
    regenerateKioskKey: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/kiosks/${id}/regenerate-key`, method: "POST" }),
      invalidatesTags: ["AdminKiosks"],
    }),
    testKioskConnection: builder.mutation<any, string>({
      query: (id) => ({ url: `admin/kiosks/${id}/test-connection`, method: "POST" }),
    }),
    getAdminDisputes: builder.query<any, void>({
      query: () => "admin/disputes",
      transformResponse: unwrap,
      providesTags: ["AdminDisputes"],
    }),
    resolveDispute: builder.mutation<
      any,
      { id: string; status: "resolved" | "rejected"; resolutionNotes: string; refundType?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `admin/disputes/${id}/resolve`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["AdminDisputes", "AdminJobs", "AdminStats", "AdminTransactions"],
    }),
  }),
});

export const {
  useAdminLoginMutation,
  useGetAdminMeQuery,
  useGetDashboardStatsQuery,
  useGetAdminJobsQuery,
  useRequeueJobMutation,
  useUpdateJobStatusMutation,
  useGetAdminUsersQuery,
  useGetAdminUserQuery,
  useBlockUserMutation,
  useSetUserRoleMutation,
  useSetUserPrivilegesMutation,
  useGetPricingQuery,
  useUpdatePricingConfigMutation,
  useCreatePricingConfigMutation,
  useDeletePricingConfigMutation,
  useGetPromotionsQuery,
  useCreatePromotionMutation,
  useUpdatePromotionMutation,
  useGetBlogPostsQuery,
  useCreateBlogPostMutation,
  useUpdateBlogPostMutation,
  useDeleteBlogPostMutation,
  useGetPrinterProfilesQuery,
  useCreatePrinterProfileMutation,
  useUpdatePrinterProfileMutation,
  useDeletePrinterProfileMutation,
  useReleaseJobMutation,
  useAcceptJobMutation,
  useGetTransactionsQuery,
  useGetRevenueReportQuery,
  useGetKioskReportQuery,
  useGetSettingsQuery,
  useUpdateSettingMutation,
  useGetAuditLogsQuery,
  useGetAdminKiosksQuery,
  useCreateKioskMutation,
  useUpdateKioskMutation,
  useUpdateKioskStatusMutation,
  useDeleteKioskMutation,
  useRegenerateKioskKeyMutation,
  useTestKioskConnectionMutation,
  useGetAdminDisputesQuery,
  useResolveDisputeMutation,
} = adminApi;
