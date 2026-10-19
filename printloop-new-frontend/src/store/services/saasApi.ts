import { apiSlice } from "./apiSlice";

export interface TenantMeResponse {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "suspended" | "closed";
  commissionPct: number;
  customDomain: string | null;
  onboarding: {
    subaccountSet: boolean;
    bankAccountSet: boolean;
    brandingSet?: boolean;
    locationSet?: boolean;
  };
  isDiscoverable?: boolean;
  address?: string | null;
  availability: "open" | "busy" | "closed";
  payoutSchedule: {
    cadence: "daily" | "weekly" | "manual";
    dayOfWeek: number;
    minPayoutAmount: number;
    accountName: string | null;
    accountNumber: string | null;
    bankCode: string | null;
  } | null;
}

export interface TenantBalanceResponse {
  currency: string;
  availableBalance: number;
  pendingPayout: number;
  lifetimeCommissionPaidToPlatform: number;
  commissionPct: number;
}

export interface PayoutRow {
  id: string;
  amount: number;
  feeAmount: number;
  currency: string;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled";
  trigger: "scheduled" | "instant" | "manual";
  reference: string | null;
  failureReason: string | null;
  requestedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface TransactionRow {
  id: string;
  type: "topup" | "print" | "refund" | "credit";
  amount: number;
  commissionAmount: number;
  description: string;
  balanceAfter: number;
  reference: string | null;
  createdAt: string;
}

interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SignupPayload {
  businessName: string;
  slug: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerPassword: string;
}

export interface SignupResponse {
  tenantId: string;
  tenantSlug: string;
  ownerUserId: string;
  ownerEmail: string;
  loginUrl: string;
}

export interface TenantBranding {
  tenantId: string;
  wordmark: string | null;
  tagline: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  emailFromName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
}

export type BrandingPatch = Partial<Omit<TenantBranding, "tenantId">>;

export type DomainStatus = "pending" | "verified" | "failed";

export interface TenantDomain {
  id: string;
  tenantId: string;
  domain: string;
  status: DomainStatus;
  verificationToken: string;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckError: string | null;
  createdAt: string;
}

export interface DomainClaimResponse {
  id: string;
  domain: string;
  status: DomainStatus;
  dns: {
    txt: { name: string; value: string };
    cname: { name: string; value: string };
  };
}

export type WebhookEventName =
  | "job.completed"
  | "job.failed"
  | "customer.signed_up"
  | "payout.paid";

export type DocumentEditStatus =
  | "pending_shop"
  | "in_progress"
  | "pending_customer"
  | "approved"
  | "rejected"
  | "completed";

export interface EditPricingConfig {
  id: string;
  tenantId: string;
  baseFee: number;
  perPageFee: number;
  complexityTierFees: Record<string, number>;
  maxShopAdjustmentPct: number;
  editingEnabled: boolean;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankSortCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentEdit {
  id: string;
  printJobId: string;
  shopId: string;
  editedBy: string;
  editOperations: any[];
  originalDocumentMeta: {
    pageCount: number;
    fileSize: number;
    fileName: string;
  } | null;
  editedDocumentMeta: {
    pageCount: number;
    fileSize: number;
  } | null;
  baseEditFee: number;
  perPageFee: number;
  complexityFee: number;
  shopAdjustedFee: number;
  totalEditFee: number;
  status: DocumentEditStatus;
  shopNotes: string | null;
  customerRejectionReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  printJob: {
    id: string;
    code: string;
    status: string;
    documentUrl: string | null;
    editedDocumentUrl: string | null;
    editingInstructions: string | null;
    totalPages: number;
    printConfiguration: any;
  } | null;
  bankDetails?: {
    accountName: string | null;
    accountNumber: string | null;
    bankName: string | null;
    sortCode: string | null;
  };
}

export interface TenantWebhook {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  secret: string;
  events: WebhookEventName[];
  isActive: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  createdAt: string;
}

export interface OperatorKiosk {
  id: string;
  name: string;
  location: string | null;
  printerName: string | null;
  status: string;
  online: boolean;
  lastSeenAt: string | null;
  testPrintPassedAt: string | null;
  totalJobsPrinted: number;
  capColor?: boolean | null;
  capDuplex?: boolean | null;
  capA3?: boolean | null;
  capUpdatedAt?: string | null;
}

export interface OpsSummary {
  kiosks: OperatorKiosk[];
  kioskCount: number;
  onlineCount: number;
  jobsToday: number;
  activeJobs: number;
  stuckRenders: number;
  revenueTodayGross: number;
  commissionTodayPaid: number;
  liveGate: {
    locationSet: boolean;
    statusActive: boolean;
    testPrintDone: boolean;
    kioskOnline: boolean;
    isDiscoverable: boolean;
  };
  liveGateMet: boolean;
}

export const saasApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    signupTenant: builder.mutation<SignupResponse, SignupPayload>({
      query: (body) => ({ url: "saas/signup", method: "POST", body }),
    }),
    checkSlug: builder.mutation<
      { available: boolean; reason?: string },
      { slug: string }
    >({
      query: (body) => ({ url: "saas/check-slug", method: "POST", body }),
    }),
    verifyEmail: builder.mutation<
      { verified: boolean; tenantSlug?: string },
      { token: string; email?: string }
    >({
      query: (body) => ({ url: "saas/verify-email", method: "POST", body }),
    }),
    resendVerification: builder.mutation<
      { success: boolean },
      { email: string; tenantSlug?: string }
    >({
      query: (body) => ({
        url: "saas/resend-verification",
        method: "POST",
        body,
      }),
    }),

    getTenantMe: builder.query<TenantMeResponse, void>({
      query: () => "saas/me",
      transformResponse: (r: { data: TenantMeResponse }) => r.data,
      providesTags: ["TenantMe"],
    }),
    setTenantAvailability: builder.mutation<
      { availability: "open" | "busy" | "closed" },
      { availability: "open" | "busy" | "closed" }
    >({
      query: (body) => ({ url: "saas/me/availability", method: "PATCH", body }),
      invalidatesTags: ["TenantMe"],
    }),
    getTenantBalance: builder.query<TenantBalanceResponse, void>({
      query: () => "saas/balance",
      transformResponse: (r: { data: TenantBalanceResponse }) => r.data,
      providesTags: ["TenantBalance"],
    }),
    listPayouts: builder.query<Paginated<PayoutRow>, { limit?: number; before?: string } | void>({
      query: (args) => {
        const params = new URLSearchParams();
        if (args && (args as any).limit) params.set("limit", String((args as any).limit));
        if (args && (args as any).before) params.set("before", String((args as any).before));
        const qs = params.toString();
        return `saas/payouts${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (r: { data: Paginated<PayoutRow> }) => r.data,
      providesTags: ["TenantPayouts"],
    }),
    listTransactions: builder.query<Paginated<TransactionRow>, { limit?: number; before?: string } | void>({
      query: (args) => {
        const params = new URLSearchParams();
        if (args && (args as any).limit) params.set("limit", String((args as any).limit));
        if (args && (args as any).before) params.set("before", String((args as any).before));
        const qs = params.toString();
        return `saas/transactions${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (r: { data: Paginated<TransactionRow> }) => r.data,
      providesTags: ["TenantTransactions"],
    }),
    requestInstantPayout: builder.mutation<
      {
        id: string;
        amount: number;
        feeAmount: number;
        status: string;
        reference: string | null;
      },
      void
    >({
      query: () => ({ url: "saas/payouts/instant", method: "POST" }),
      invalidatesTags: ["TenantBalance", "TenantPayouts"],
    }),
    setupPaystackSubaccount: builder.mutation<
      { subaccountCode: string; accountName: string },
      {
        businessName: string;
        settlementBank: string;
        accountNumber: string;
        percentageCharge?: number;
      }
    >({
      query: (body) => ({
        url: "saas/setup/paystack-subaccount",
        method: "POST",
        body,
      }),
      invalidatesTags: ["TenantMe"],
    }),
    setupBankAccount: builder.mutation<
      { recipientCode: string; accountName: string; bankCode: string },
      { accountName: string; accountNumber: string; bankCode: string }
    >({
      query: (body) => ({
        url: "saas/setup/bank-account",
        method: "POST",
        body,
      }),
      invalidatesTags: ["TenantMe"],
    }),

    setup2fa: builder.mutation<{ secret: string; otpauthUrl: string }, void>({
      query: () => ({ url: "saas/me/2fa/setup", method: "POST" }),
      transformResponse: (r: { data: { secret: string; otpauthUrl: string } }) =>
        r.data,
    }),
    enable2fa: builder.mutation<{ enabled: boolean }, { code: string }>({
      query: (body) => ({ url: "saas/me/2fa/enable", method: "POST", body }),
      transformResponse: (r: { data: { enabled: boolean } }) => r.data,
    }),
    disable2fa: builder.mutation<{ enabled: boolean }, { code: string }>({
      query: (body) => ({ url: "saas/me/2fa/disable", method: "POST", body }),
      transformResponse: (r: { data: { enabled: boolean } }) => r.data,
    }),

    getBranding: builder.query<TenantBranding, void>({
      query: () => "saas/me/branding",
      transformResponse: (r: { data: TenantBranding }) => r.data,
      providesTags: ["TenantBranding"],
    }),
    updateBranding: builder.mutation<TenantBranding, BrandingPatch>({
      query: (body) => ({ url: "saas/me/branding", method: "PUT", body }),
      transformResponse: (r: { data: TenantBranding }) => r.data,
      invalidatesTags: ["TenantBranding"],
    }),

    listDomains: builder.query<TenantDomain[], void>({
      query: () => "saas/me/domains",
      transformResponse: (r: { data: TenantDomain[] }) => r.data,
      providesTags: ["TenantDomains"],
    }),
    claimDomain: builder.mutation<DomainClaimResponse, { domain: string }>({
      query: (body) => ({ url: "saas/me/domains", method: "POST", body }),
      transformResponse: (r: { data: DomainClaimResponse }) => r.data,
      invalidatesTags: ["TenantDomains"],
    }),
    verifyDomain: builder.mutation<{ verified: boolean }, { id: string }>({
      query: ({ id }) => ({
        url: `saas/me/domains/${id}/verify`,
        method: "POST",
      }),
      transformResponse: (r: { data: { verified: boolean } }) => r.data,
      invalidatesTags: ["TenantDomains", "TenantMe"],
    }),
    deleteDomain: builder.mutation<{ success: boolean }, { id: string }>({
      query: ({ id }) => ({ url: `saas/me/domains/${id}`, method: "DELETE" }),
      invalidatesTags: ["TenantDomains", "TenantMe"],
    }),

    listWebhooks: builder.query<TenantWebhook[], void>({
      query: () => "saas/me/webhooks",
      transformResponse: (r: { data: TenantWebhook[] }) => r.data,
      providesTags: ["TenantWebhooks"],
    }),
    createWebhook: builder.mutation<
      TenantWebhook,
      { name: string; url: string; events: WebhookEventName[] }
    >({
      query: (body) => ({ url: "saas/me/webhooks", method: "POST", body }),
      transformResponse: (r: { data: TenantWebhook }) => r.data,
      invalidatesTags: ["TenantWebhooks"],
    }),
    updateWebhook: builder.mutation<
      TenantWebhook,
      {
        id: string;
        name?: string;
        events?: WebhookEventName[];
        isActive?: boolean;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `saas/me/webhooks/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (r: { data: TenantWebhook }) => r.data,
      invalidatesTags: ["TenantWebhooks"],
    }),
    deleteWebhook: builder.mutation<{ success: boolean }, { id: string }>({
      query: ({ id }) => ({ url: `saas/me/webhooks/${id}`, method: "DELETE" }),
      invalidatesTags: ["TenantWebhooks"],
    }),

    closeTenant: builder.mutation<
      { id: string; status: string },
      { confirmSlug: string; reason?: string }
    >({
      query: (body) => ({ url: "saas/me", method: "DELETE", body }),
      transformResponse: (r: { data: { id: string; status: string } }) => r.data,
      invalidatesTags: ["TenantMe"],
    }),

    getOpsSummary: builder.query<OpsSummary, void>({
      query: () => "saas/ops/summary",
      transformResponse: (r: { data: OpsSummary }) => r.data,
      providesTags: ["TenantOps", "TenantKiosks"],
    }),

    listKiosks: builder.query<OperatorKiosk[], void>({
      query: () => "saas/kiosks",
      transformResponse: (r: any) =>
        (r?.data?.kiosks ?? r?.data ?? r ?? []) as OperatorKiosk[],
      providesTags: ["TenantKiosks"],
    }),
    createKiosk: builder.mutation<
      { id: string; name: string; apiKey: string },
      { name: string; location?: string; printerName?: string }
    >({
      query: (body) => ({ url: "saas/kiosks", method: "POST", body }),
      transformResponse: (r: any) => r?.data?.kiosk ?? r?.data ?? r,
      invalidatesTags: ["TenantKiosks", "TenantOps"],
    }),
    updateKioskStatus: builder.mutation<
      unknown,
      { id: string; status: string }
    >({
      query: ({ id, status }) => ({
        url: `saas/kiosks/${id}/status`,
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: ["TenantKiosks", "TenantOps"],
    }),
    regenerateKioskKey: builder.mutation<{ apiKey: string }, { id: string }>({
      query: ({ id }) => ({
        url: `saas/kiosks/${id}/regenerate-key`,
        method: "POST",
      }),
      transformResponse: (r: any) => ({
        apiKey: r?.data?.apiKey ?? r?.data?.kiosk?.apiKey ?? r?.apiKey,
      }),
      invalidatesTags: ["TenantKiosks"],
    }),
    markKioskTestPrint: builder.mutation<unknown, { id: string }>({
      query: ({ id }) => ({
        url: `saas/kiosks/${id}/test-print`,
        method: "POST",
      }),
      invalidatesTags: ["TenantKiosks", "TenantOps", "TenantMe"],
    }),
    deleteKiosk: builder.mutation<unknown, { id: string }>({
      query: ({ id }) => ({ url: `saas/kiosks/${id}`, method: "DELETE" }),
      invalidatesTags: ["TenantKiosks", "TenantOps"],
    }),

    setDiscoverable: builder.mutation<unknown, { isDiscoverable: boolean }>({
      query: (body) => ({ url: "saas/me/location", method: "PATCH", body }),
      invalidatesTags: ["TenantMe", "TenantOps"],
    }),

    getLmsStatus: builder.query<{ keySet: boolean }, void>({
      query: () => "saas/me/lms",
      transformResponse: (r: { data: { keySet: boolean } }) => r.data,
      providesTags: ["TenantMe"],
    }),
    regenerateLmsKey: builder.mutation<
      { key: string; url: string; urlWithEmail: string },
      void
    >({
      query: () => ({ url: "saas/me/lms/regenerate", method: "POST" }),
      transformResponse: (r: any) => r?.data ?? r,
      invalidatesTags: ["TenantMe"],
    }),

    getEditPricing: builder.query<EditPricingConfig, void>({
      query: () => "saas/edit-pricing",
      transformResponse: (r: { data: EditPricingConfig }) => r.data,
      providesTags: ["TenantEditPricing"],
    }),
    saveEditPricing: builder.mutation<EditPricingConfig, Partial<EditPricingConfig>>({
      query: (body) => ({ url: "saas/edit-pricing", method: "POST", body }),
      transformResponse: (r: { data: EditPricingConfig }) => r.data,
      invalidatesTags: ["TenantEditPricing"],
    }),

    listEditQueue: builder.query<{ items: DocumentEdit[] }, { status?: DocumentEditStatus; limit?: number } | void>({
      query: (args) => {
        const params = new URLSearchParams();
        if (args && (args as any).status) params.set("status", (args as any).status);
        if (args && (args as any).limit) params.set("limit", String((args as any).limit));
        const qs = params.toString();
        return `saas/edit-queue${qs ? `?${qs}` : ""}`;
      },
      transformResponse: (r: { data: { items: DocumentEdit[] } }) => r.data,
      providesTags: ["TenantEditQueue"],
    }),

    startEdit: builder.mutation<{ editId: string; status: DocumentEditStatus; editorUrl?: string }, { jobId: string }>({
      query: ({ jobId }) => ({ url: `saas/edit/${jobId}/start`, method: "POST" }),
      transformResponse: (r: { data: { editId: string; status: DocumentEditStatus; editorUrl?: string } }) => r.data,
      invalidatesTags: ["TenantEditQueue", "TenantOps"],
    }),

    uploadEditedDocument: builder.mutation<{ editId: string; status: DocumentEditStatus }, { jobId: string; documentUrl: string; pageCount: number; fileSize: number; editOperations: any[]; shopNotes?: string }>({
      query: ({ jobId, ...body }) => ({ url: `saas/edit/${jobId}/upload`, method: "POST", body }),
      transformResponse: (r: { data: { editId: string; status: DocumentEditStatus } }) => r.data,
      invalidatesTags: ["TenantEditQueue", "TenantOps"],
    }),

    completeEdit: builder.mutation<{ editId: string; status: DocumentEditStatus; documentUrl?: string }, { jobId: string }>({
      query: ({ jobId }) => ({ url: `saas/edit/${jobId}/complete`, method: "POST" }),
      transformResponse: (r: { data: { editId: string; status: DocumentEditStatus; documentUrl?: string } }) => r.data,
      invalidatesTags: ["TenantEditQueue", "TenantOps"],
    }),

    confirmEdit: builder.mutation<{ editId: string; status: DocumentEditStatus; printJobStatus: string }, { jobId: string }>({
      query: ({ jobId }) => ({ url: `saas/edit/${jobId}/confirm`, method: "POST" }),
      transformResponse: (r: { data: { editId: string; status: DocumentEditStatus; printJobStatus: string } }) => r.data,
      invalidatesTags: ["TenantEditQueue", "TenantOps"],
    }),

    rejectEdit: builder.mutation<{ editId: string; status: DocumentEditStatus }, { jobId: string; reason?: string }>({
      query: ({ jobId, ...body }) => ({ url: `saas/edit/${jobId}/reject`, method: "POST", body }),
      transformResponse: (r: { data: { editId: string; status: DocumentEditStatus } }) => r.data,
      invalidatesTags: ["TenantEditQueue", "TenantOps"],
    }),

    confirmEditPayment: builder.mutation<{ editId: string; status: DocumentEditStatus; printJobStatus: string }, { jobId: string }>({
      query: ({ jobId }) => ({ url: `saas/edit/${jobId}/confirm-payment`, method: "POST" }),
      transformResponse: (r: { data: { editId: string; status: DocumentEditStatus; printJobStatus: string } }) => r.data,
      invalidatesTags: ["TenantEditQueue", "TenantOps"],
    }),

    getEditJob: builder.query<DocumentEdit, { jobId: string }>({
      query: ({ jobId }) => `saas/edit/${jobId}`,
      transformResponse: (r: { data: DocumentEdit }) => r.data,
      providesTags: (result, error, { jobId }) => [{ type: "TenantEditJob", id: jobId }],
    }),
  }),
});

export const {
  useSignupTenantMutation,
  useCheckSlugMutation,
  useVerifyEmailMutation,
  useResendVerificationMutation,
  useGetTenantMeQuery,
  useSetTenantAvailabilityMutation,
  useGetTenantBalanceQuery,
  useListPayoutsQuery,
  useListTransactionsQuery,
  useRequestInstantPayoutMutation,
  useSetupPaystackSubaccountMutation,
  useSetupBankAccountMutation,
  useSetup2faMutation,
  useEnable2faMutation,
  useDisable2faMutation,
  useGetBrandingQuery,
  useUpdateBrandingMutation,
  useListDomainsQuery,
  useClaimDomainMutation,
  useVerifyDomainMutation,
  useDeleteDomainMutation,
  useListWebhooksQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
  useCloseTenantMutation,
  useGetOpsSummaryQuery,
  useListKiosksQuery,
  useCreateKioskMutation,
  useUpdateKioskStatusMutation,
  useRegenerateKioskKeyMutation,
  useMarkKioskTestPrintMutation,
  useDeleteKioskMutation,
  useSetDiscoverableMutation,
  useGetLmsStatusQuery,
  useRegenerateLmsKeyMutation,
  useGetEditPricingQuery,
  useSaveEditPricingMutation,
  useListEditQueueQuery,
  useStartEditMutation,
  useUploadEditedDocumentMutation,
  useCompleteEditMutation,
  useConfirmEditMutation,
  useRejectEditMutation,
  useConfirmEditPaymentMutation,
  useGetEditJobQuery,
} = saasApi;
