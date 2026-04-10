import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { Company } from "@/types/database";

type CompanyInsert = Omit<Company, "id" | "created_at" | "updated_at">;
type CompanyUpdate = Partial<CompanyInsert>;

export interface CompanyFilters {
  habilitada?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Service layer for company operations
 * Abstracts database access and business logic
 */
export class CompanyService {
  private static supabase = createSupabaseAdmin();

  /**
   * Get all companies with optional filters
   */
  static async getAllCompanies(
    filters: CompanyFilters = {}
  ): Promise<Company[]> {
    try {
      const { habilitada, search, limit = 100, offset = 0 } = filters;

      let query = this.supabase.from("companies").select("*");

      // Apply filters
      if (habilitada !== undefined) {
        query = query.eq("habilitada", habilitada);
      }

      if (search) {
        // Search in razao_social or cnpj
        query = query.or(
          `razao_social.ilike.%${search}%,cnpj.ilike.%${search}%`
        );
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error(`Failed to get companies: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error("[CompanyService] getAllCompanies error:", error);
      throw error;
    }
  }

  /**
   * Get a single company by ID
   */
  static async getCompanyById(id: string): Promise<Company | null> {
    try {
      const { data, error } = await this.supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows returned
        throw new Error(`Failed to get company: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      console.error("[CompanyService] getCompanyById error:", error);
      throw error;
    }
  }

  /**
   * Create a new company
   */
  static async createCompany(data: CompanyInsert): Promise<Company> {
    try {
      if (!data.razao_social || !data.cnpj) {
        throw new Error("razao_social and cnpj are required");
      }

      // Validate CNPJ format (basic)
      if (!/^\d{14}$/.test(data.cnpj.replace(/\D/g, ""))) {
        throw new Error("Invalid CNPJ format");
      }

      const { data: company, error } = await this.supabase
        .from("companies")
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create company: ${error.message}`);
      }

      if (!company) {
        throw new Error("Company creation returned no data");
      }

      return company;
    } catch (error) {
      console.error("[CompanyService] createCompany error:", error);
      throw error;
    }
  }

  /**
   * Update a company
   */
  static async updateCompany(
    id: string,
    data: CompanyUpdate
  ): Promise<Company> {
    try {
      // Validate CNPJ if provided
      if (data.cnpj && !/^\d{14}$/.test(data.cnpj.replace(/\D/g, ""))) {
        throw new Error("Invalid CNPJ format");
      }

      const { data: company, error } = await this.supabase
        .from("companies")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update company: ${error.message}`);
      }

      if (!company) {
        throw new Error("Company update returned no data");
      }

      return company;
    } catch (error) {
      console.error("[CompanyService] updateCompany error:", error);
      throw error;
    }
  }

  /**
   * Toggle company enabled status
   */
  static async toggleCompany(id: string, habilitada: boolean): Promise<Company> {
    try {
      const { data: company, error } = await this.supabase
        .from("companies")
        .update({ habilitada })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to toggle company: ${error.message}`);
      }

      if (!company) {
        throw new Error("Company toggle returned no data");
      }

      return company;
    } catch (error) {
      console.error("[CompanyService] toggleCompany error:", error);
      throw error;
    }
  }

  /**
   * Delete a company (soft delete via habilitada flag)
   */
  static async deleteCompany(id: string): Promise<void> {
    try {
      await this.toggleCompany(id, false);
    } catch (error) {
      console.error("[CompanyService] deleteCompany error:", error);
      throw error;
    }
  }
}
