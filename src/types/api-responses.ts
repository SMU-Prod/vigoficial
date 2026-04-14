/**
 * FE-01: Standardized API Response Types
 * Provides properly typed interfaces for the most common API responses
 * to reduce reliance on 'any' types throughout the codebase.
 */

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Auth-related responses
export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
}

export interface AuthUserResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id: string;
  mfa_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Billing-related responses
export interface BillingInvoiceResponse {
  id: string;
  company_id: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  amount: number;
  currency: string;
  due_date: string;
  issued_at: string;
  paid_at?: string;
  invoice_number: string;
}

export interface BillingSubscriptionResponse {
  id: string;
  company_id: string;
  plan: string;
  status: "active" | "cancelled" | "suspended";
  current_period_start: string;
  current_period_end: string;
  cancel_at?: string;
  next_billing_date: string;
}

// Company-related responses
export interface CompanyResponse {
  id: string;
  name: string;
  cnpj: string;
  status: "ativo" | "inativo" | "suspenso";
  plan: string;
  created_at: string;
  updated_at: string;
  employees_count: number;
  vehicles_count: number;
}

// Employee-related responses
export interface EmployeeResponse {
  id: string;
  company_id: string;
  name: string;
  email: string;
  cpf: string;
  role: string;
  status: "ativo" | "inativo";
  created_at: string;
}

// GPS/Vehicle tracking
export interface GpsDataResponse {
  id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number;
  timestamp: string;
  heading?: number;
  altitude?: number;
}

// Webhook response types
export interface WebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
  id: string;
}

export interface WebhookVerificationResponse {
  verified: true;
  timestamp: number;
}

// Generic error response for consistency
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
