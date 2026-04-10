/**
 * Abstract billing provider interface.
 * Allows swapping Asaas for another provider without changing business logic.
 *
 * Current implementation: Asaas (satisfies this interface)
 * Future: Stripe, PagSeguro, etc.
 */

export interface BillingProvider {
  createCustomer(data: CreateCustomerInput): Promise<BillingCustomer>;
  createSubscription(data: CreateSubscriptionInput): Promise<BillingSubscription>;
  getSubscription(id: string): Promise<BillingSubscription | null>;
  cancelSubscription(id: string): Promise<void>;
  generateInvoice(subscriptionId: string): Promise<BillingInvoice>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
}

export interface CreateCustomerInput {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
}

export interface BillingCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj: string;
  externalId: string; // provider-specific ID
}

export interface CreateSubscriptionInput {
  customerId: string;
  value: number;
  cycle: "MONTHLY" | "QUARTERLY" | "YEARLY";
  description: string;
  nextDueDate: string;
}

export interface BillingSubscription {
  id: string;
  customerId: string;
  value: number;
  status: "active" | "inactive" | "overdue" | "cancelled";
  nextDueDate: string;
  externalId: string;
}

export interface BillingInvoice {
  id: string;
  subscriptionId: string;
  value: number;
  status: "pending" | "paid" | "overdue" | "cancelled";
  dueDate: string;
  paymentUrl?: string;
  externalId: string;
}

export type PaymentStatus = "pending" | "confirmed" | "received" | "overdue" | "refunded" | "failed";
