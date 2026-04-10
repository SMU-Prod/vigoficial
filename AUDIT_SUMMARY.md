# VIGI PRO Database Layer Audit Report
**Date:** 2026-04-04
**Scope:** 19 files analyzed across 13 SQL migrations and 6 TypeScript data/cache modules
**Overall Score:** 62/100

## Executive Summary

The VIGI PRO database demonstrates a **well-architected foundational structure** with comprehensive coverage of regulatory requirements, proper referential integrity for most relations, immutable audit logging, and thoughtful RLS policies. However, **5 critical security/data integrity issues** and **17 high-severity performance and architectural issues** require immediate attention before production deployment.

### Critical Issues (Must Fix)
1. **Hardcoded password hash in migrations** - visible in version control, weak entropy
2. **SQL injection in JSONB computed columns** - unparameterized JSON key extraction
3. **Missing email uniqueness in employees** - breaks threading identity assumptions
4. **Array-based foreign keys without referential integrity** - orphaned IDs accumulate
5. **service_role RLS bypass without audit logging** - zero visibility into privileged operations

### Key Findings by Category

## Schema Quality: 72/100

**Strengths:**
- 28 tables with clear domain boundaries (users, companies, employees, email, gesp, vehicles, compliance, etc.)
- Immutable audit_log with write-once trigger enforcement
- CHECK constraints extensively used for domain validation
- RLS enabled on all sensitive tables
- Proper soft-delete patterns (status='inativo', status='cancelado')
- Comprehensive views for compliance, billing, and operational dashboards

**Weaknesses:**
- **Normalization debt:** 5+ JSONB blobs (alertas_ativos, metadata, suggested_params) should be normalized columns
- **Array columns without junction tables:** email_workflows.gesp_task_ids[], email_workflows.email_outbound_ids[], iml_insights.evidence_event_ids[]
- **Inconsistent delete cascade:** 14 foreign keys with ON DELETE SET NULL instead of CASCADE or RESTRICT
- **Weak constraints:** parser_keywords.acao_automatica TEXT with hardcoded list (no FK)
- **Timestamp naming chaos:** created_at, updated_at, started_at, finished_at, executed_at, completed_at, resolved_at, etc.

## Indexing Strategy: 58/100

**Missing Indexes (Performance Bottlenecks):**
- email_inbound: No (company_id, workflow_id) compound index → N+1 on thread loads
- email_inbound: No (company_id, received_at DESC) for pagination
- billing_history: No (company_id, status, data_vencimento DESC) compound
- employees: Missing (company_id, email) index
- vw_dashboard_kpis: No materialization for 9 COUNT(*) subqueries

**Good Indexes:**
- Partial indexes on compliance-critical fields (status='ativo' filters)
- Composite indexes on edge traversal in IML (source_event_id, relation_type)
- Trigram index on dou_alvaras.razao_social for fuzzy search

## Security Posture: 45/100

**Critical Issues:**
1. **Hardcoded admin password hash** (migration 001, line 33)
   - Visible in version control
   - Bcrypt with 12 rounds (acceptable) but compromisable if repo leaked
   - **Impact:** Unauthorized access to production instance
   - **Fix:** Generate temporary credentials, force change on first login

2. **SQL Injection in JSONB access** (migration 003, line 245)
   - Computed column: `COALESCE(metadata->>'resumo', '') || ...`
   - If metadata keys are user-controlled, attackers bypass parameterization
   - **Impact:** Data exfiltration, privilege escalation
   - **Fix:** Whitelist JSON keys, use jsonb_each_text() with explicit extraction

3. **service_role RLS bypass** (migration 003, line 557)
   - Backend uses service_role that bypasses all RLS policies
   - Zero audit logging of privileged operations
   - **Impact:** If key leaked, attacker has unrestricted database access
   - **Fix:** Implement function-level authorization, log service_role writes, rotate key monthly

4. **Missing email uniqueness** (employees table)
   - Allows duplicate emails per company
   - Breaks email threading assumptions
   - **Fix:** ADD UNIQUE(company_id, email)

5. **Array columns without referential integrity** (email_workflows)
   - gesp_task_ids[] and email_outbound_ids[] have no FK validation
   - Orphaned UUIDs accumulate on deletes
   - **Fix:** Normalize to junction tables with CASCADE delete

**Medium Issues:**
- Refresh tokens stored as hash (good) but no rotation policy enforced
- Webhook idempotency not endpoint-scoped (same ID to different endpoints = collision)
- Audit log user_id nullable on delete (breaks attribution)

## Performance Analysis: 52/100

**N+1 Query Patterns:**
1. **vw_validades_criticas** (9 UNION ALL subqueries)
   - Loads all employees 5x (CNV, reciclagem, porte_arma, colete, licenciamento + seguro)
   - Called on every dashboard refresh (300s cache TTL)
   - **Recommendation:** Partition into separate views, use materialized view with hourly refresh

2. **vw_dashboard_kpis** (9 COUNT(*) without indexes)
   - Each KPI is separate subquery
   - No index optimization for aggregates
   - **Recommendation:** Use COUNT(*) with covering indexes or materialized view

3. **Email threading queries**
   - Missing (company_id, workflow_id) index → full table scan
   - Missing pagination index → sort after filter
   - **Recommendation:** Add compound indexes listed above

**Missing Indexes (Query Paths):**
- Compliance: (company_id, status, data_validade DESC) on employees, vehicles
- Billing: (company_id, billing_status, data_proxima_cobranca)
- GESP: (company_id, status, created_at DESC) on gesp_tasks
- DOU: (company_id, company_id) for orphan detection

**Good Performance Design:**
- Partial indexes on WHERE status='ativo' filters (reduces index size)
- Trigram index for fuzzy company name search
- Proper foreign key cascade (mostly) prevents orphan queries

## Data Integrity: 68/100

**Referential Integrity Issues:**
1. **array columns without validation** → gesp_task_ids[] in email_workflows
   - Orphaned task IDs after deletes
   - **Fix:** Normalize to junction table or implement trigger validation

2. **Dual reference patterns** → email_outbound_ids in workflow + workflow_id in outbound
   - Inconsistent on delete (array vs FK)
   - **Fix:** Keep only FK in outbound, remove array from workflow

3. **Nullable FKs without constraints** → dou_alvaras (company_id OR prospect_id)
   - Can have both NULL → orphaned alvaras
   - **Fix:** ADD CHECK((company_id IS NOT NULL) OR (prospect_id IS NOT NULL))

4. **Soft delete patterns inconsistent**
   - employees uses status='inativo' (soft delete)
   - Hard deletes still possible via API
   - **Fix:** Add deleted_at column, prevent hard deletes via trigger

**Constraint Gaps:**
- employees.email: No UNIQUE(company_id, email)
- parser_keywords.acao_automatica: No FK validation
- iml_insights.evidence_event_ids[]: No max size (can bloat to 1000s of IDs)

## Redis Cache Layer: 55/100

**Issues:**
1. **Silent failures** (src/lib/redis/cache.ts, line 83)
   - `catch {}` blocks swallow all errors
   - No logging if Redis unavailable
   - Monitoring blind to cache failures
   - **Impact:** Silent performance degradation

2. **Hardcoded fallback** (src/lib/redis/connection.ts, line 5)
   - Defaults to 127.0.0.1:6379 if env vars missing
   - Production silently falls back to localhost
   - **Impact:** Cache never actually used; undetected miss rate 100%

3. **No cache invalidation triggers**
   - CACHE_TTL.dashboard=300s but no database triggers for invalidation
   - Updated data served from cache for up to 5 minutes
   - **Impact:** Stale KPIs on dashboard

4. **No metrics/observability**
   - No Prometheus export of cache hit rate
   - No alerting on "cache unavailable" state
   - **Impact:** Hidden performance issues

**Strengths:**
- Graceful fallback to direct DB if Redis unavailable
- Pattern-based invalidation with SCAN (non-blocking)
- TTL-based auto-expiration per category

## Recommendations (Priority Order)

### Phase 1: Security (Week 1)
1. Remove hardcoded password from migration 001
2. Implement environment-seeded temporary credentials with forced change
3. Add SQL injection test suite for JSONB access patterns
4. Implement service_role audit logging with triggers
5. Rotate Supabase service_role key
6. Add email UNIQUE constraint to employees table

### Phase 2: Data Integrity (Week 2)
1. Normalize email_workflows arrays → workflow_tasks, workflow_emails junction tables
2. Normalize alertas_* JSONB → specific boolean columns
3. Add CASCADE on email_outbound.workflow_id
4. Implement soft delete (deleted_at) for audit-critical tables
5. Add CHECK constraints for orphan prevention (DOU alvaras, etc.)

### Phase 3: Performance (Week 3)
1. Add compound indexes (email_inbound, billing_history, compliance)
2. Materialize vw_dashboard_kpis with hourly refresh
3. Partition vw_validades_criticas into separate views
4. Implement cache invalidation triggers for dashboard
5. Add pagination index (company_id, created_at DESC) to all list tables

### Phase 4: Observability (Week 4)
1. Add structured logging to Redis cache layer
2. Implement cache hit rate metrics (Prometheus)
3. Add health check endpoint for Redis connectivity
4. Document RLS policy matrix
5. Add integration tests for all data integrity constraints

## Testing Recommendations

**Integration Tests Needed:**
- [ ] Email threading with duplicate emails (missing UNIQUE)
- [ ] Workflow deletion with orphaned gesp_task_ids
- [ ] Array normalization before/after (junction table consistency)
- [ ] RLS policy coverage for all role/company combinations
- [ ] service_role audit logging on all writes
- [ ] Hard delete prevention on employees/companies/weapons
- [ ] Cache invalidation timing on dashboard updates

**Performance Tests Needed:**
- [ ] vw_dashboard_kpis load time (target: <100ms with 100k rows)
- [ ] Email threading query with compound index (target: <50ms)
- [ ] vw_validades_criticas partitioned views (target: <50ms each)
- [ ] Redis cache hit rate monitoring (target: >90% hit rate)

## Migration Strategy

**Safe approach to fixes:**
1. Create new tables/indexes alongside existing
2. Backfill data with dual-write transactions
3. Swap via foreign key + trigger in single transaction
4. Retain old structure for 1 week before drop
5. Test all cascade deletes before production

**Example: Array → Junction Table**
```sql
-- Step 1: Create junction table
CREATE TABLE workflow_tasks (
  id UUID PK,
  workflow_id UUID FK (CASCADE),
  gesp_task_id UUID FK (CASCADE),
  UNIQUE(workflow_id, gesp_task_id)
);

-- Step 2: Backfill from array
INSERT INTO workflow_tasks (workflow_id, gesp_task_id)
SELECT id, unnest(gesp_task_ids) FROM email_workflows;

-- Step 3: Swap in application code + FK validation

-- Step 4: Test cascades with delete trigger

-- Step 5: Drop array column (after 1 week in prod)
ALTER TABLE email_workflows DROP COLUMN gesp_task_ids;
```

## Conclusion

VIGI PRO's database layer is **production-ready in structure but NOT in security posture**. The 5 critical issues must be resolved before any production deployment. The 17 high-severity issues represent technical debt that will accumulate into performance and maintainability problems. With the recommended prioritized fixes over 4 weeks, the database will be enterprise-grade.

**Estimated effort:** 120-160 person-hours (4 weeks, 1 engineer)
**Risk if not addressed:** Data breach, performance degradation, regulatory non-compliance, operational incidents
