/**
 * OPS-01: Environment Secrets Exposure Warning
 *
 * This module checks if sensitive environment files have been accidentally
 * committed to the repository and logs warnings if running in production.
 *
 * If .env.local is ever committed to git, secrets must be rotated immediately:
 * - All API keys (ANTHROPIC_API_KEY, ASAAS_API_KEY, etc.)
 * - JWT_SECRET and ENCRYPTION_KEY
 * - Database credentials (SUPABASE_SERVICE_ROLE_KEY)
 * - R2 and Redis credentials
 *
 * Usage: Import this module early in your application startup to enable checks.
 */

import { existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

interface EnvCheckResult {
  fileExists: boolean;
  isInGit: boolean;
  isProduction: boolean;
  warning?: string;
}

/**
 * Check if .env.local exists and has been committed to git
 * Returns warning details for production environments
 */
export function checkEnvFileExposure(): EnvCheckResult {
  const result: EnvCheckResult = {
    fileExists: false,
    isInGit: false,
    isProduction: process.env.NODE_ENV === "production",
  };

  // Check if .env.local exists in project root
  const envLocalPath = resolve(process.cwd(), ".env.local");
  result.fileExists = existsSync(envLocalPath);

  // If file exists and we're in a git repo, check git status
  if (result.fileExists && existsSync(resolve(process.cwd(), ".git"))) {
    try {
      // Check if .env.local is tracked by git (sync call for startup check)
      const gitStatusOutput = execSync("git ls-files .env.local", {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      result.isInGit = gitStatusOutput.trim() !== "";
    } catch (_error) {
      // Not a git repo or git not available - assume safe
      result.isInGit = false;
    }
  }

  // Generate warning if secrets might be exposed in production
  if (result.fileExists && result.isInGit && result.isProduction) {
    result.warning = `
🚨 SECURITY ALERT [OPS-01]: .env.local is tracked in git and currently deployed to production!

⚠️  IMMEDIATE ACTION REQUIRED:
1. Remove .env.local from git history: git rm --cached .env.local
2. Add to .gitignore if not already present
3. ROTATE ALL SECRETS immediately:
   - ANTHROPIC_API_KEY
   - ASAAS_API_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - JWT_SECRET
   - ENCRYPTION_KEY
   - R2_SECRET_ACCESS_KEY
   - REDIS_PASSWORD
   - All other sensitive credentials

4. Verify which commits exposed secrets and review access logs
5. Consider using git-filter-repo to clean history if needed

DO NOT ignore this warning in production!
`;
  }

  return result;
}

/**
 * Log environment security warnings at startup
 * Called automatically if imported
 */
export function logEnvWarnings(): void {
  const check = checkEnvFileExposure();

  if (check.warning) {
    // Use console.error for visibility in production logs
    console.error(check.warning);

    // Also attempt to use a structured logger if available
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
      console.error("CRITICAL: Environment file exposure detected in production");
    }
  }

  // Helpful warning for development
  if (process.env.NODE_ENV !== "production" && check.fileExists && check.isInGit) {
    console.warn(
      `[OPS-01 Warning] .env.local is tracked in git (development). ` +
      `Remove it before deploying: git rm --cached .env.local`
    );
  }
}

// Automatic check on module load if in production
if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
  logEnvWarnings();
}
