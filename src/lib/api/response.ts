/**
 * FE-07: Standardized API Response Helpers
 * Provides consistent response format for all API routes
 * Ensures error responses follow the same structure
 */

import { NextResponse } from "next/server";
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  PaginatedResponse,
} from "@/types/api-responses";

/**
 * Create a standardized success response
 * FE-07: Ensures all API responses follow consistent format
 *
 * @param data The response data
 * @param message Optional success message
 * @param status HTTP status code (default: 200)
 * @returns NextResponse with standardized format
 *
 * Example:
 * return apiSuccess({ id: '123', name: 'John' });
 * return apiSuccess(users, 'Users retrieved successfully');
 */
export function apiSuccess<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      message,
    },
    { status }
  );
}

/**
 * Create a standardized error response
 * FE-07: Ensures all error responses follow consistent format
 *
 * @param code Error code for programmatic handling (e.g., 'INVALID_EMAIL', 'UNAUTHORIZED')
 * @param message Human-readable error message
 * @param status HTTP status code
 * @param details Optional detailed error information
 * @returns NextResponse with standardized error format
 *
 * Example:
 * return apiError('VALIDATION_ERROR', 'Email is invalid', 400);
 * return apiError('NOT_FOUND', 'User not found', 404);
 * return apiError('UNAUTHORIZED', 'Authentication required', 401);
 */
export function apiError(
  code: string,
  message: string,
  status: number = 400,
  details?: Record<string, unknown>
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status }
  );
}

/**
 * Create a paginated success response
 * FE-07: Standardized pagination format
 *
 * @param items Array of items in current page
 * @param total Total number of items
 * @param page Current page number (1-indexed)
 * @param pageSize Items per page
 * @returns NextResponse with paginated data
 *
 * Example:
 * const { data, totalCount } = await fetchUsers(page, limit);
 * return apiPaginated(data, totalCount, page, limit);
 */
export function apiPaginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  status: number = 200
): NextResponse<ApiSuccessResponse<PaginatedResponse<T>>> {
  const hasMore = page * pageSize < total;
  return apiSuccess(
    {
      data: items,
      total,
      page,
      pageSize,
      hasMore,
    },
    undefined,
    status
  );
}

/**
 * Create an unauthorized error response
 * FE-07: Common error response shorthand
 */
export function apiUnauthorized(message: string = "Authentication required") {
  return apiError("UNAUTHORIZED", message, 401);
}

/**
 * Create a forbidden error response
 * FE-07: Common error response shorthand
 */
export function apiForbidden(message: string = "Access forbidden") {
  return apiError("FORBIDDEN", message, 403);
}

/**
 * Create a not found error response
 * FE-07: Common error response shorthand
 */
export function apiNotFound(message: string = "Resource not found") {
  return apiError("NOT_FOUND", message, 404);
}

/**
 * Create a validation error response
 * FE-07: Common error response shorthand
 */
export function apiValidationError(
  message: string = "Validation failed",
  details?: Record<string, unknown>
) {
  return apiError("VALIDATION_ERROR", message, 400, details);
}

/**
 * Create an internal server error response
 * FE-07: Common error response shorthand
 */
export function apiServerError(message: string = "Internal server error") {
  return apiError("INTERNAL_ERROR", message, 500);
}

/**
 * Create a conflict error response
 * FE-07: Common error response shorthand
 */
export function apiConflict(message: string = "Resource conflict") {
  return apiError("CONFLICT", message, 409);
}
