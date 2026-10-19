import { Request } from "express";
import {
  FindOptionsOrder,
  FindOptionsRelations,
  FindOptionsWhere,
} from "typeorm";

export interface UserPayload {
  userId: string;
  role?: string;
  memberships?: Array<{ tenantId: string; role: string }>;
  impersonating?: { tenantId: string; adminUserId: string };
  jti?: string;
}

export type DecodedToken<T extends UserPayload> = {
  iat: number;
  exp: number;
} & T;

export interface ServiceResponse<T> {
  success: boolean;
  message?: string;
  response?: T;
  error?: {
    message: string;
    code?: string | unknown;
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    hasMore: boolean;
    limit: number;
    totalPages: number;
  };
}

export interface BaseFilterOptions<T> {
  page?: number;
  limit?: number;
  search?: string;
  options?: {
    order?: FindOptionsOrder<T>;
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
    relations?: FindOptionsRelations<T> | FindOptionsRelations<T>[] | string[];
  };
}

export type FilterOptions<T> = BaseFilterOptions<T> & Record<string, any>;

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

export interface AuthenticatedRequest extends Request {
  user?: any;
  tenant?: any;
  permissions?: string[];
}

declare module "express" {
  interface Request {
    rawBody?: Buffer;
    user?: AuthenticatedRequest["user"];
    tenant?: any;
    memberships?: UserPayload["memberships"];
    filterOptions?: ReturnType<typeof getFilterOptions>;
    validated?: any;
    log?: any;
    requestId?: string;
  }
}

export const getFilterOptions = (query: any) => {
  const {
    page = 1,
    limit = 10,
    sort = "createdAt:DESC",
    search,
    ...rest
  } = query || {};

  const [sortField, sortDir] = String(sort).split(":");
  return {
    page: Math.max(1, Number(page) || 1),
    limit: Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT)),
    search: search ? String(search) : undefined,
    options: {
      order: { [sortField || "createdAt"]: (sortDir || "DESC").toUpperCase() },
    },
    ...rest,
  };
};
