import { apiSlice } from "./apiSlice";

export interface PublicShop {
  id: string;
  slug: string;
  name: string;
  status: "trial" | "active" | "suspended" | "closed";
  address: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm?: number;
  agentOnline: boolean;
  brand: {
    wordmark: string | null;
    primaryColor: string | null;
    logoUrl: string | null;
  };
  cheapestPerPage: number | null;
  hasColor: boolean;
  paperSizes: Array<"A4" | "A3">;
  queueLength: number;
  estimatedWaitMin: number;
  ratingAverage: number;
  ratingCount: number;
  photos: string[];
}

export interface NearbyResponse {
  origin: { lat: number; lng: number };
  radiusKm: number;
  count: number;
  shops: PublicShop[];
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  photoUrl?: string | null;
  createdAt: string;
  user: {
    firstName: string;
    lastName: string;
  };
}

export interface ShopDetailResponse {
  shop: PublicShop;
  pricing: Array<{
    paperSize: "A4" | "A3";
    colorType: "bw" | "color";
    price100Simplex: number;
    price300Simplex: number;
    price600Simplex: number;
    price100Duplex: number;
    price300Duplex: number;
    price600Duplex: number;
  }>;
  reviews: Review[];
}

export interface HandoffMintResponse {
  token: string;
  expiresIn: number;
}

export interface HandoffVerifyResponse {
  tenantSlug: string;
  email: string | null;
  expiresAt: string | null;
}

export const discoveryApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    listNearbyShops: builder.query<
      NearbyResponse,
      { lat: number; lng: number; radius?: number; limit?: number }
    >({
      query: ({ lat, lng, radius = 10, limit = 20 }) =>
        `discovery/shops/nearby?lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`,
      transformResponse: (r: { data: NearbyResponse }) => r.data,
    }),

    listAllShops: builder.query<{ count: number; shops: PublicShop[] }, void>({
      query: () => `discovery/shops`,
      transformResponse: (
        r: { data: { count: number; shops: PublicShop[] } },
      ) => r.data,
    }),

    mintHandoff: builder.mutation<
      HandoffMintResponse,
      { slug: string; email?: string }
    >({
      query: (body) => ({
        url: "discovery/handoff",
        method: "POST",
        body,
      }),
      transformResponse: (r: { data: HandoffMintResponse }) => r.data,
    }),
    verifyHandoff: builder.query<HandoffVerifyResponse, { token: string }>({
      query: ({ token }) =>
        `discovery/handoff/verify?token=${encodeURIComponent(token)}`,
      transformResponse: (r: { data: HandoffVerifyResponse }) => r.data,
    }),

    getShopDetail: builder.query<
      ShopDetailResponse,
      { slug: string; lat?: number; lng?: number }
    >({
      query: ({ slug, lat, lng }) => {
        const params =
          lat != null && lng != null
            ? `?lat=${lat}&lng=${lng}`
            : "";
        return `discovery/shops/${slug}${params}`;
      },
      providesTags: (result, error, arg) => [{ type: "ShopDetail" as const, id: arg.slug }],
      transformResponse: (r: { data: ShopDetailResponse }) => r.data,
    }),

    submitShopReview: builder.mutation<
      any,
      { slug: string; rating: number; comment?: string; photoUrl?: string }
    >({
      query: ({ slug, ...body }) => ({
        url: `customer/shops/${slug}/reviews`,
        method: "POST",
        body,
      }),
      invalidatesTags: (result, error, arg) => [{ type: "ShopDetail" as const, id: arg.slug }],
    }),
  }),
});

export const {
  useListNearbyShopsQuery,
  useListAllShopsQuery,
  useGetShopDetailQuery,
  useMintHandoffMutation,
  useVerifyHandoffQuery,
  useSubmitShopReviewMutation,
} = discoveryApi;
