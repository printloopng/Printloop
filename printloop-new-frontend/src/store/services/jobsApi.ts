import { apiSlice } from "@/store/services/apiSlice";

export const jobsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPricing: builder.query<any, void>({
      query: () => "pricing",
      providesTags: ["Pricing"],
      transformResponse: (r: any) => r?.response || r?.data || r,
    }),
    listJobs: builder.query<any, void>({
      query: () => "customer/print-jobs",
      providesTags: ["Jobs"],
      transformResponse: (r: any) => r?.response || r?.data || r,
    }),
    createJob: builder.mutation<any, any>({
      query: (arg) =>
        arg instanceof FormData
          ? { url: "customer/print-jobs", method: "POST", body: arg }
          : { url: "print-jobs", method: "POST", body: arg },
      invalidatesTags: ["Jobs"],
    }),
    createBatchJob: builder.mutation<any, FormData>({
      query: (fd) => ({ url: "customer/print-jobs/batch", method: "POST", body: fd }),
      invalidatesTags: ["Jobs"],
    }),
    initializeJobPayment: builder.mutation<any, { jobId: string }>({
      query: (body) => ({ url: "payments/initialize-job-payment", method: "POST", body }),
      transformResponse: (r: any) => {
        const unwrapped = r?.response || r?.data || r;
        if (unwrapped?.authorization_url && !unwrapped?.authorizationUrl) {
          return { ...unwrapped, authorizationUrl: unwrapped.authorization_url };
        }
        return unwrapped;
      },
    }),
    uploadFile: builder.mutation<any, FormData>({
      query: (formData) => ({
        url: "files/upload",
        method: "POST",
        body: formData,
      }),
    }),
    submitDispute: builder.mutation<any, { printJobId: string; reason: string }>({
      query: (body) => ({ url: "customer/disputes", method: "POST", body }),
    }),
  }),
});

export const {
  useGetPricingQuery,
  useListJobsQuery,
  useCreateJobMutation,
  useCreateBatchJobMutation,
  useInitializeJobPaymentMutation,
  useUploadFileMutation,
  useSubmitDisputeMutation,
} = jobsApi;
