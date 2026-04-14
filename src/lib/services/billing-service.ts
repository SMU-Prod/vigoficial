import { createSupabaseAdmin } from "@/lib/supabase/server";

type BillingRecord = Record<string, unknown>;
type BillingInsert = Record<string, unknown>;

export interface BillingOverview {
  totalRevenue: number;
  totalCompanies: number;
  overduePayments: number;
  pendingPayments: number;
  monthlyRecurring: number;
}

export interface CompanyBillingInfo {
  companyId: string;
  companyName: string;
  status: "active" | "overdue" | "suspended" | "cancelled";
  monthlyAmount: number;
  nextBillingDate: string | null;
  lastPaymentDate: string | null;
  balance: number;
  records: BillingRecord[];
}

/**
 * Service layer for billing operations
 * Handles payment processing, overview aggregation, and billing records
 */
export class BillingService {
  private static supabase = createSupabaseAdmin();

  /**
   * Get overall billing overview
   */
  static async getBillingOverview(): Promise<BillingOverview> {
    try {
      // Get total revenue from completed payments
      const { data: payments, error: paymentError } = await this.supabase
        .from("billing")
        .select("amount")
        .eq("status", "paid");

      if (paymentError) {
        throw new Error(`Failed to get payments: ${paymentError.message}`);
      }

      const totalRevenue = (payments || []).reduce(
        (sum, p) => sum + (p.amount || 0),
        0
      );

      // Get active companies count
      const { data: companies, error: companyError } = await this.supabase
        .from("companies")
        .select("id", { count: "exact" })
        .eq("habilitada", true);

      if (companyError) {
        throw new Error(`Failed to get companies: ${companyError.message}`);
      }

      const totalCompanies = companies?.length || 0;

      // Get overdue payments
      const today = new Date().toISOString().split("T")[0];
      const { data: overdueData, error: overdueError } = await this.supabase
        .from("billing")
        .select("id")
        .eq("status", "pending")
        .lt("due_date", today);

      if (overdueError) {
        throw new Error(`Failed to get overdue: ${overdueError.message}`);
      }

      const overduePayments = overdueData?.length || 0;

      // Get pending payments
      const { data: pendingData, error: pendingError } = await this.supabase
        .from("billing")
        .select("id")
        .eq("status", "pending");

      if (pendingError) {
        throw new Error(`Failed to get pending: ${pendingError.message}`);
      }

      const pendingPayments = pendingData?.length || 0;

      // Get monthly recurring revenue (sum of active subscriptions)
      const { data: subscriptions, error: subError } = await this.supabase
        .from("companies")
        .select("monthly_cost")
        .eq("habilitada", true);

      if (subError) {
        throw new Error(`Failed to get subscriptions: ${subError.message}`);
      }

      const monthlyRecurring = (subscriptions || []).reduce(
        (sum, s) => sum + (s.monthly_cost || 0),
        0
      );

      return {
        totalRevenue,
        totalCompanies,
        overduePayments,
        pendingPayments,
        monthlyRecurring,
      };
    } catch (error) {
      console.error("[BillingService] getBillingOverview error:", error);
      throw error;
    }
  }

  /**
   * Get billing information for a specific company
   */
  static async getCompanyBilling(
    companyId: string
  ): Promise<CompanyBillingInfo> {
    try {
      // Get company info
      const { data: company, error: companyError } = await this.supabase
        .from("companies")
        .select(
          "id, razao_social, monthly_cost, next_billing_date, last_payment_date"
        )
        .eq("id", companyId)
        .single();

      if (companyError) {
        throw new Error(`Failed to get company: ${companyError.message}`);
      }

      if (!company) {
        throw new Error("Company not found");
      }

      // Get billing records
      const { data: records, error: recordError } = await this.supabase
        .from("billing")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (recordError) {
        throw new Error(`Failed to get billing records: ${recordError.message}`);
      }

      // Calculate balance (pending - paid)
      const pending = (records || []).reduce((sum, r) => {
        return r.status === "pending" ? sum + (r.amount || 0) : sum;
      }, 0);

      const paid = (records || []).reduce((sum, r) => {
        return r.status === "paid" ? sum + (r.amount || 0) : sum;
      }, 0);

      const balance = pending - paid;

      // Determine status
      let status: "active" | "overdue" | "suspended" | "cancelled" = "active";
      if (balance > 0) {
        const today = new Date();
        const dueDate = new Date(records?.[0]?.due_date || "");
        status = dueDate < today ? "overdue" : "active";
      }

      return {
        companyId: company.id,
        companyName: company.razao_social || "",
        status,
        monthlyAmount: company.monthly_cost || 0,
        nextBillingDate: company.next_billing_date,
        lastPaymentDate: company.last_payment_date,
        balance,
        records: records || [],
      };
    } catch (error) {
      console.error("[BillingService] getCompanyBilling error:", error);
      throw error;
    }
  }

  /**
   * Process a payment for a company
   */
  static async processPayment(
    companyId: string,
    amount: number
  ): Promise<BillingRecord> {
    try {
      if (amount <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      // Create billing record
      const { data: billing, error } = await this.supabase
        .from("billing")
        .insert({
          company_id: companyId,
          amount,
          status: "paid",
          paid_at: new Date().toISOString(),
          description: `Payment received - ${new Date().toLocaleDateString("pt-BR")}`,
        } as BillingInsert)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to process payment: ${error.message}`);
      }

      if (!billing) {
        throw new Error("Payment processing returned no data");
      }

      // Update company last_payment_date
      await this.supabase
        .from("companies")
        .update({ last_payment_date: new Date().toISOString() })
        .eq("id", companyId);

      return billing;
    } catch (error) {
      console.error("[BillingService] processPayment error:", error);
      throw error;
    }
  }
}
