import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { Employee } from "@/types/database";

type EmployeeInsert = Omit<Employee, "id" | "created_at" | "updated_at">;
type EmployeeUpdate = Partial<EmployeeInsert>;

export interface EmployeeFilters {
  companyId?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Service layer for employee operations
 * Abstracts database access and business logic
 */
export class EmployeeService {
  private static supabase = createSupabaseAdmin();

  /**
   * Get all employees with optional filters
   */
  static async getAllEmployees(
    filters: EmployeeFilters = {}
  ): Promise<Employee[]> {
    try {
      const { companyId, status, search, limit = 100, offset = 0 } = filters;

      let query = this.supabase.from("employees").select("*");

      // Apply filters
      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      if (status) {
        query = query.eq("status", status);
      }

      if (search) {
        // Search in name or email
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error(`Failed to get employees: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error("[EmployeeService] getAllEmployees error:", error);
      throw error;
    }
  }

  /**
   * Get a single employee by ID
   */
  static async getEmployeeById(id: string): Promise<Employee | null> {
    try {
      const { data, error } = await this.supabase
        .from("employees")
        .select("*")
        .eq("id", id)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows returned
        throw new Error(`Failed to get employee: ${error.message}`);
      }

      return data || null;
    } catch (error) {
      console.error("[EmployeeService] getEmployeeById error:", error);
      throw error;
    }
  }

  /**
   * Create a new employee
   */
  static async createEmployee(data: EmployeeInsert): Promise<Employee> {
    try {
      if (!data.company_id || !data.nome_completo || !data.email) {
        throw new Error("company_id, nome_completo, and email are required");
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        throw new Error("Invalid email format");
      }

      const { data: employee, error } = await this.supabase
        .from("employees")
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create employee: ${error.message}`);
      }

      if (!employee) {
        throw new Error("Employee creation returned no data");
      }

      return employee;
    } catch (error) {
      console.error("[EmployeeService] createEmployee error:", error);
      throw error;
    }
  }

  /**
   * Update an employee
   */
  static async updateEmployee(
    id: string,
    data: EmployeeUpdate
  ): Promise<Employee> {
    try {
      // Validate email if provided
      if (data.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
          throw new Error("Invalid email format");
        }
      }

      const { data: employee, error } = await this.supabase
        .from("employees")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update employee: ${error.message}`);
      }

      if (!employee) {
        throw new Error("Employee update returned no data");
      }

      return employee;
    } catch (error) {
      console.error("[EmployeeService] updateEmployee error:", error);
      throw error;
    }
  }

  /**
   * Delete an employee
   */
  static async deleteEmployee(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("employees")
        .delete()
        .eq("id", id);

      if (error) {
        throw new Error(`Failed to delete employee: ${error.message}`);
      }
    } catch (error) {
      console.error("[EmployeeService] deleteEmployee error:", error);
      throw error;
    }
  }
}
