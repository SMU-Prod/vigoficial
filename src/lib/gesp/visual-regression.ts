import { createHash } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { uploadToR2, getFromR2 } from "@/lib/r2/client";
import { emitEvent } from "@/lib/iml/event-graph";
import { logger } from "@/lib/observability/logger";

/**
 * GESP Visual Regression Testing System
 *
 * Detects UI changes in the GESP portal by comparing pixel-by-pixel
 * screenshots against stored baselines. Uses SHA-256 hashing for fast
 * comparison and byte-level diffing for precise change detection.
 *
 * Baselines are stored in R2 at:
 *   gesp_baselines/{companyId}/{pageId}/baseline.png
 *
 * Metadata is stored in Supabase `gesp_baselines` table.
 */

// ─── Types ───

export interface ScreenshotBaseline {
  page_id: string; // e.g. "login", "dashboard", "processo_cadastrar"
  company_id: string;
  r2_key: string;
  width: number;
  height: number;
  captured_at: string;
  pixel_hash: string; // SHA-256 of raw pixel data
}

export interface RegressionResult {
  page_id: string;
  has_changed: boolean;
  diff_percentage: number; // 0-100
  baseline_r2_key: string;
  current_r2_key: string;
  diff_r2_key?: string; // visual diff image (optional)
  detected_at: string;
  details: string;
}

// ─── Utilities ───

/**
 * Computes SHA-256 hash of pixel data for fast baseline comparison
 */
function computePixelHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Performs byte-by-byte comparison of two buffers
 * Returns the number of differing bytes
 */
function countDifferencesBytes(baseline: Buffer, current: Buffer): number {
  // If sizes differ, that's already a difference
  if (baseline.length !== current.length) {
    return Math.max(baseline.length, current.length);
  }

  let diffCount = 0;
  for (let i = 0; i < baseline.length; i++) {
    if (baseline[i] !== current[i]) {
      diffCount++;
    }
  }
  return diffCount;
}

/**
 * Calculates the percentage of bytes that differ
 */
function calculateDiffPercentage(
  diffBytes: number,
  totalBytes: number
): number {
  if (totalBytes === 0) return 0;
  return (diffBytes / totalBytes) * 100;
}

/**
 * Generates a standardized R2 key for a baseline
 */
function getBaselineR2Key(companyId: string, pageId: string): string {
  return `gesp_baselines/${companyId}/${pageId}/baseline.png`;
}

/**
 * Generates a standardized R2 key for current screenshot
 */
function getCurrentScreenshotR2Key(
  companyId: string,
  pageId: string,
  timestamp: string
): string {
  return `gesp_baselines/${companyId}/${pageId}/current_${timestamp}.png`;
}

/**
 * Generates a standardized R2 key for visual diff
 */
function _getDiffR2Key(
  companyId: string,
  pageId: string,
  timestamp: string
): string {
  return `gesp_baselines/${companyId}/${pageId}/diff_${timestamp}.png`;
}

// ─── Core Functions ───

/**
 * Save a screenshot as baseline for a GESP page
 * Uploads to R2 and stores metadata in database
 */
export async function saveBaseline(
  pageId: string,
  companyId: string,
  screenshotBuffer: Buffer
): Promise<ScreenshotBaseline> {
  try {
    const supabase = createSupabaseAdmin();
    const timestamp = new Date().toISOString();
    const r2Key = getBaselineR2Key(companyId, pageId);
    const pixelHash = computePixelHash(screenshotBuffer);

    // Upload to R2
    await uploadToR2(r2Key, screenshotBuffer, "image/png");

    // Extract dimensions from PNG header if possible
    // PNG header: bytes 16-19 contain width (big-endian), 20-23 contain height
    let width = 0;
    let height = 0;
    if (screenshotBuffer.length >= 24) {
      width = screenshotBuffer.readUInt32BE(16);
      height = screenshotBuffer.readUInt32BE(20);
    }

    const baseline: ScreenshotBaseline = {
      page_id: pageId,
      company_id: companyId,
      r2_key: r2Key,
      width,
      height,
      captured_at: timestamp,
      pixel_hash: pixelHash,
    };

    // Store metadata in database
    const { error: insertError } = await supabase.from("gesp_baselines").insert({
      page_id: pageId,
      company_id: companyId,
      r2_key: r2Key,
      width,
      height,
      captured_at: timestamp,
      pixel_hash: pixelHash,
    });

    if (insertError) {
      logger.warn("[GESP VR] Failed to insert baseline metadata", {
        error: insertError,
        pageId,
        companyId,
      });
      // Don't fail — R2 upload succeeded
    }

    logger.info("[GESP VR] Baseline saved", {
      pageId,
      companyId,
      r2Key,
      pixelHash: pixelHash.substring(0, 8),
    });

    return baseline;
  } catch (error) {
    logger.error("[GESP VR] saveBaseline error", {
      error,
      pageId,
      companyId,
    });
    throw error;
  }
}

/**
 * Compare current screenshot against baseline
 * Returns regression result with diff percentage and change status
 */
export async function compareWithBaseline(
  pageId: string,
  companyId: string,
  currentScreenshot: Buffer,
  threshold: number = 5 // default 5% threshold
): Promise<RegressionResult> {
  try {
    const supabase = createSupabaseAdmin();
    const timestamp = new Date().toISOString();
    const currentHash = computePixelHash(currentScreenshot);
    const currentR2Key = getCurrentScreenshotR2Key(companyId, pageId, timestamp);

    // Upload current screenshot
    await uploadToR2(currentR2Key, currentScreenshot, "image/png");

    // Get baseline from database
    const { data: baselineData, error: fetchError } = await supabase
      .from("gesp_baselines")
      .select("r2_key, pixel_hash")
      .eq("page_id", pageId)
      .eq("company_id", companyId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !baselineData) {
      logger.warn("[GESP VR] No baseline found for comparison", {
        pageId,
        companyId,
      });

      // No baseline = first run, so no change detected
      const result: RegressionResult = {
        page_id: pageId,
        has_changed: false,
        diff_percentage: 0,
        baseline_r2_key: "",
        current_r2_key: currentR2Key,
        detected_at: timestamp,
        details:
          "No baseline found. This is the first screenshot for this page.",
      };

      return result;
    }

    const baselineR2Key = baselineData.r2_key;
    const baselineHash = baselineData.pixel_hash;

    // Fast hash comparison first
    if (baselineHash === currentHash) {
      const result: RegressionResult = {
        page_id: pageId,
        has_changed: false,
        diff_percentage: 0,
        baseline_r2_key: baselineR2Key,
        current_r2_key: currentR2Key,
        detected_at: timestamp,
        details: "Pixel hash identical. No visual changes detected.",
      };

      logger.debug("[GESP VR] Baseline match (hash)", { pageId, companyId });
      return result;
    }

    // Hashes differ — fetch baseline and do byte-by-byte comparison
    let baselineBuffer: Buffer | undefined;
    try {
      const response = await getFromR2(baselineR2Key);
      if (response && typeof response === "object" && "transformToByteArray" in response) {
        // Handle Node.js stream/readable interface
        const chunks: Uint8Array[] = [];
        for await (const chunk of response as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        baselineBuffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
      } else if (Buffer.isBuffer(response)) {
        baselineBuffer = response;
      }
    } catch (e) {
      logger.warn("[GESP VR] Failed to fetch baseline for detailed comparison", {
        error: e,
        baselineR2Key,
      });
    }

    let diffPercentage = 100; // Default to full change if we can't fetch
    let details = "Could not fetch baseline for detailed comparison.";

    if (baselineBuffer) {
      const diffBytes = countDifferencesBytes(baselineBuffer, currentScreenshot);
      diffPercentage = calculateDiffPercentage(
        diffBytes,
        Math.max(baselineBuffer.length, currentScreenshot.length)
      );

      details = `${diffPercentage.toFixed(2)}% of pixels differ from baseline (${diffBytes} bytes out of ${Math.max(baselineBuffer.length, currentScreenshot.length)}).`;
    }

    const hasChanged = diffPercentage > threshold;

    const result: RegressionResult = {
      page_id: pageId,
      has_changed: hasChanged,
      diff_percentage: diffPercentage,
      baseline_r2_key: baselineR2Key,
      current_r2_key: currentR2Key,
      detected_at: timestamp,
      details,
    };

    if (hasChanged) {
      logger.warn("[GESP VR] Visual change detected", {
        pageId,
        companyId,
        diffPercentage,
        threshold,
      });
    }

    return result;
  } catch (error) {
    logger.error("[GESP VR] compareWithBaseline error", {
      error,
      pageId,
      companyId,
    });
    throw error;
  }
}

/**
 * Check all baselines for a company against provided screenshots
 * Runs regression check in parallel for multiple pages
 */
export async function runRegressionCheck(
  companyId: string,
  screenshots: Map<string, Buffer>
): Promise<RegressionResult[]> {
  try {
    logger.info("[GESP VR] Starting regression check", {
      companyId,
      pageCount: screenshots.size,
    });

    const results = await Promise.all(
      Array.from(screenshots.entries()).map(([pageId, buffer]) =>
        compareWithBaseline(pageId, companyId, buffer)
      )
    );

    const changedCount = results.filter((r) => r.has_changed).length;
    if (changedCount > 0) {
      logger.warn("[GESP VR] Regression check complete with changes", {
        companyId,
        totalPages: results.length,
        changedPages: changedCount,
      });
    } else {
      logger.info("[GESP VR] Regression check complete - no changes", {
        companyId,
        totalPages: results.length,
      });
    }

    return results;
  } catch (error) {
    logger.error("[GESP VR] runRegressionCheck error", {
      error,
      companyId,
      pageCount: screenshots.size,
    });
    throw error;
  }
}

/**
 * Handle detected visual regression
 * Emits IML event, inserts system event, and logs structured warning
 */
export async function handleRegressionAlert(
  result: RegressionResult,
  companyId: string
): Promise<void> {
  try {
    const supabase = createSupabaseAdmin();

    // Log structured warning
    logger.warn("[GESP VR] Regression alert", {
      pageId: result.page_id,
      companyId,
      diffPercentage: result.diff_percentage,
      baselineKey: result.baseline_r2_key,
      currentKey: result.current_r2_key,
    });

    // Emit IML event with ERRO_SISTEMA severity
    const eventMetadata = {
      page_id: result.page_id,
      diff_percentage: result.diff_percentage,
      baseline_r2_key: result.baseline_r2_key,
      current_r2_key: result.current_r2_key,
      diff_r2_key: result.diff_r2_key,
      details: result.details,
    };

    const eventId = await emitEvent({
      eventType: "ERRO_SISTEMA",
      entityType: "system",
      entityId: `regression_${result.page_id}`,
      companyId,
      metadata: eventMetadata,
      severity: "high",
    });

    logger.debug("[GESP VR] IML event emitted", {
      eventId,
      pageId: result.page_id,
    });

    // Insert system event record for tracking/audit
    const { error: insertError } = await supabase
      .from("system_events")
      .insert({
        event_type: "VISUAL_REGRESSION_DETECTED",
        company_id: companyId,
        severity: "high",
        page_id: result.page_id,
        diff_percentage: result.diff_percentage,
        baseline_r2_key: result.baseline_r2_key,
        current_r2_key: result.current_r2_key,
        diff_r2_key: result.diff_r2_key,
        details: result.details,
        metadata: eventMetadata,
        occurred_at: result.detected_at,
        iml_event_id: eventId,
      });

    if (insertError) {
      logger.warn("[GESP VR] Failed to insert system_events record", {
        error: insertError,
        pageId: result.page_id,
        companyId,
      });
      // Don't fail — IML event already created
    }

    logger.info("[GESP VR] Regression alert handled", {
      pageId: result.page_id,
      companyId,
      eventId,
    });
  } catch (error) {
    logger.error("[GESP VR] handleRegressionAlert error", {
      error,
      pageId: result.page_id,
      companyId,
    });
    // Don't throw — alerting should not block operations
  }
}

/**
 * Update baseline to current screenshot after admin approval
 * Replaces old baseline with new screenshot
 */
export async function updateBaseline(
  pageId: string,
  companyId: string,
  newScreenshot: Buffer
): Promise<ScreenshotBaseline> {
  try {
    const supabase = createSupabaseAdmin();
    const timestamp = new Date().toISOString();
    const r2Key = getBaselineR2Key(companyId, pageId);
    const pixelHash = computePixelHash(newScreenshot);

    logger.info("[GESP VR] Updating baseline after admin approval", {
      pageId,
      companyId,
      newHash: pixelHash.substring(0, 8),
    });

    // Upload new baseline to R2 (overwrites old)
    await uploadToR2(r2Key, newScreenshot, "image/png");

    // Extract dimensions from PNG header
    let width = 0;
    let height = 0;
    if (newScreenshot.length >= 24) {
      width = newScreenshot.readUInt32BE(16);
      height = newScreenshot.readUInt32BE(20);
    }

    const updatedBaseline: ScreenshotBaseline = {
      page_id: pageId,
      company_id: companyId,
      r2_key: r2Key,
      width,
      height,
      captured_at: timestamp,
      pixel_hash: pixelHash,
    };

    // Update database record
    const { error: updateError } = await supabase
      .from("gesp_baselines")
      .update({
        r2_key: r2Key,
        width,
        height,
        captured_at: timestamp,
        pixel_hash: pixelHash,
      })
      .eq("page_id", pageId)
      .eq("company_id", companyId);

    if (updateError) {
      logger.warn("[GESP VR] Failed to update baseline metadata", {
        error: updateError,
        pageId,
        companyId,
      });
      // Don't fail — R2 upload succeeded
    }

    // Emit IML event for audit trail
    await emitEvent({
      eventType: "ADMIN_ACAO",
      entityType: "system",
      entityId: `baseline_update_${pageId}`,
      companyId,
      metadata: {
        action: "VISUAL_BASELINE_UPDATED",
        page_id: pageId,
        new_hash: pixelHash,
        r2_key: r2Key,
      },
      severity: "info",
    });

    logger.info("[GESP VR] Baseline updated successfully", {
      pageId,
      companyId,
      r2Key,
    });

    return updatedBaseline;
  } catch (error) {
    logger.error("[GESP VR] updateBaseline error", {
      error,
      pageId,
      companyId,
    });
    throw error;
  }
}
