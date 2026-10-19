import { Response } from "express";
import { ServiceResponse } from "../types";

export function createSuccessResponse<T>(data: T): ServiceResponse<T> {
  return {
    success: true,
    response: data,
  };
}

export function createErrorResponse(
  message: string,
  code?: string | unknown
): ServiceResponse<never> {
  return {
    success: false,
    error: {
      message,
      code,
    },
  };
}

export function sendSuccessResponse<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  message?: string
): Promise<ServiceResponse<T>> {
  const response = createSuccessResponse(data);
  res.status(statusCode).json({
    ...response,
    message,
  });
  return Promise.resolve(response);
}

export function sendErrorResponse(
  res: Response,
  message: string,
  statusCode: number = 400,
  code?: string | unknown
): void {
  const response = createErrorResponse(message, code);
  res.status(statusCode).json(response);
}

export function sendPaginatedResponse<T>(
  res: Response,
  data: T,
  statusCode: number = 200
): void {
  const response = createSuccessResponse(data);
  res.status(statusCode).json(response);
}

export function sendNotFoundResponse(
  res: Response,
  message: string = "Resource not found"
): void {
  sendErrorResponse(res, message, 404);
}

export function sendUnauthorizedResponse(
  res: Response,
  message: string = "Unauthorized"
): void {
  sendErrorResponse(res, message, 401);
}

export function sendForbiddenResponse(
  res: Response,
  message: string = "Forbidden"
): void {
  sendErrorResponse(res, message, 403);
}

export function sendBadRequestResponse(
  res: Response,
  message: string = "Bad request"
): void {
  sendErrorResponse(res, message, 400);
}

export function sendInternalServerErrorResponse(
  res: Response,
  message: string = "Internal server error"
): void {
  sendErrorResponse(res, message, 500);
}
