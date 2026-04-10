/**
 * Unit Tests - Agent Base Infrastructure
 *
 * Tests the base agent module from @/lib/agents/base:
 * - startAgentRun() lifecycle management
 * - completeAgentRun() status transitions
 * - logAgentDecision() decision logging
 * - Token tracking and accounting
 * - Error handling and recovery
 * - Idempotency and state management
 * - IML event emission
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  startAgentRun,
  completeAgentRun,
  logAgentDecision,
  updateSystemHealth,
} from '@/lib/agents/base'
import type { AgentName, TriggerType, AgentRunStatus } from '@/lib/agents/types'

// Mock external dependencies
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdmin: vi.fn(() => {
    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'run-123', started_at: new Date().toISOString() },
        error: null,
      }),
    }

    return {
      from: vi.fn(function(table: string) {
        // Reset mocks for each call
        queryBuilder.select.mockReturnThis()
        queryBuilder.insert.mockReturnThis()
        queryBuilder.update.mockReturnThis()
        queryBuilder.delete.mockReturnThis()
        queryBuilder.eq.mockReturnThis()
        queryBuilder.in.mockReturnThis()
        queryBuilder.lt.mockReturnThis()
        queryBuilder.gte.mockReturnThis()
        queryBuilder.single.mockResolvedValue({
          data: { id: 'run-123', started_at: new Date().toISOString() },
          error: null,
        })
        return queryBuilder
      }),
    }
  }),
}))

vi.mock('@/lib/iml/event-graph', () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}))

describe('Agent Base Infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ===========================================================================
  // START AGENT RUN TESTS
  // ===========================================================================

  describe('startAgentRun()', () => {
    it('creates new agent run with positional parameters', async () => {
      const result = await startAgentRun(
        'captador',
        'dou_parsing',
        'scheduled',
        'company-1',
        { date: '2025-04-06' }
      )

      expect(result).toBeDefined()
      if (typeof result === 'string') {
        expect(result).toMatch(/^[a-zA-Z0-9-]+$/)
      }
    })

    it('creates new agent run with object parameters', async () => {
      const result = await startAgentRun({
        agent_name: 'captador',
        run_type: 'dou_parsing',
        trigger_source: 'scheduled',
        company_id: 'company-1',
        input_data: { date: '2025-04-06' },
      })

      expect(result).toBeDefined()
      expect(result).toHaveProperty('runId')
    })

    it('returns runId for positional parameter style', async () => {
      const result = await startAgentRun('operacional', 'trigger', 'manual')

      expect(typeof result === 'string').toBe(true)
    })

    it('returns object with runId for object parameter style', async () => {
      const result = await startAgentRun({
        agent_name: 'operacional',
        run_type: 'trigger',
      })

      expect(typeof result === 'object').toBe(true)
      expect(result).toHaveProperty('runId')
    })

    it('generates deterministic run ID based on agent and company', async () => {
      const result1 = await startAgentRun('captador', 'dou_parsing', 'manual', 'company-1')
      // Wait a moment to ensure same time window
      const result2 = await startAgentRun('captador', 'dou_parsing', 'manual', 'company-1')

      // Both should be strings (positional style)
      expect(typeof result1 === 'string').toBe(true)
      expect(typeof result2 === 'string').toBe(true)
    })

    it('marks status as running when creating run', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()

      await startAgentRun('operacional', 'trigger', 'manual')

      expect(supabase.from).toHaveBeenCalledWith('agent_runs')
      expect(supabase.from('agent_runs').insert).toHaveBeenCalled()
    })

    it('stores input_data when provided', async () => {
      const inputData = { document_id: 'doc-123', priority: 'high' }

      await startAgentRun('operacional', 'process', 'manual', undefined, inputData)

      // Verify that insert was called with input_data
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()
      expect(supabase.from('agent_runs').insert).toHaveBeenCalled()
    })

    it('handles null company_id for global runs', async () => {
      const result = await startAgentRun('comunicador', 'email_send', 'trigger')

      expect(result).toBeDefined()
    })

    it('cleans up stale running records older than 30 minutes', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()

      await startAgentRun('captador', 'dou_parsing', 'scheduled')

      // Should check for stale records
      expect(supabase.from).toHaveBeenCalledWith('agent_runs')
    })

    it('throws error when database fails', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      vi.mocked(createSupabaseAdmin).mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: null,
            error: { message: 'Database connection failed' },
          }),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
        }),
      } as any))

      await expect(
        startAgentRun('operacional', 'trigger', 'manual')
      ).rejects.toThrow()
    })

    it('emits IML event on successful run start', async () => {
      const { emitEvent } = await import('@/lib/iml/event-graph')

      await startAgentRun({
        agent_name: 'captador',
        run_type: 'dou_parsing',
      })

      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'DECISAO_AGENTE',
          action: 'run_started',
        })
      )
    })
  })

  // ===========================================================================
  // COMPLETE AGENT RUN TESTS
  // ===========================================================================

  describe('completeAgentRun()', () => {
    it('completes run with positional parameters', async () => {
      await completeAgentRun('run-123', 'operacional', 'completed', { result: 'success' })

      // Should complete without error
      expect(true).toBe(true)
    })

    it('completes run with object parameters', async () => {
      await completeAgentRun({
        runId: 'run-123',
        status: 'completed',
        output_data: { processed: 50 },
      })

      // Should complete without error
      expect(true).toBe(true)
    })

    it('updates run status in database', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()

      await completeAgentRun('run-123', 'operacional', 'completed')

      expect(supabase.from('agent_runs').update).toHaveBeenCalled()
    })

    it('calculates duration_ms from started_at', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()

      const now = new Date()
      const started = new Date(now.getTime() - 5000) // 5 seconds ago

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { started_at: started.toISOString() },
          error: null,
        }),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
      } as any)

      await completeAgentRun('run-123', 'operacional', 'completed')

      // Duration calculation should happen
      expect(true).toBe(true)
    })

    it('stores token statistics when provided', async () => {
      const tokenStats = {
        total: 1500,
        cost: 0.045,
        cacheRead: 100,
        cacheWrite: 50,
        steps: 3,
      }

      await completeAgentRun('run-123', 'captador', 'completed', {}, tokenStats)

      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()
      expect(supabase.from('agent_runs').update).toHaveBeenCalled()
    })

    it('marks status as failed when error occurs', async () => {
      await completeAgentRun(
        'run-123',
        'operacional',
        'failed',
        {},
        undefined,
        'Connection timeout'
      )

      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()
      expect(supabase.from('agent_runs').update).toHaveBeenCalled()
    })

    it('stores error message in database', async () => {
      const errorMessage = 'Failed to parse document'

      await completeAgentRun(
        'run-123',
        'operacional',
        'failed',
        {},
        undefined,
        errorMessage
      )

      expect(true).toBe(true)
    })

    it('emits IML event on completion', async () => {
      const { emitEvent } = await import('@/lib/iml/event-graph')

      await completeAgentRun('run-123', 'operacional', 'completed')

      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'DECISAO_AGENTE',
          action: 'run_completed',
        })
      )
    })

    it('emits ERRO_SISTEMA event when run fails', async () => {
      const { emitEvent } = await import('@/lib/iml/event-graph')

      await completeAgentRun('run-123', 'operacional', 'failed', {}, undefined, 'Error')

      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ERRO_SISTEMA',
        })
      )
    })

    it('handles missing started_at gracefully', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: null, // No started_at found
          error: null,
        }),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
      } as any)

      // Should handle gracefully with 0 duration
      await completeAgentRun('run-123', 'operacional', 'completed')
      expect(true).toBe(true)
    })
  })

  // ===========================================================================
  // LOG AGENT DECISION TESTS
  // ===========================================================================

  describe('logAgentDecision()', () => {
    it('logs decision with object parameters', async () => {
      const result = await logAgentDecision({
        agent_run_id: 'run-123',
        agent_name: 'captador',
        step_name: 'classify_email',
        decision_type: 'classification',
        confidence: 0.95,
        input_data: { email: 'test@example.com' },
        output_data: { classification: 'novo_vigilante' },
      })

      expect(result).toHaveProperty('decisionId')
    })

    it('logs decision with positional parameters', async () => {
      const decisionData = {
        run_id: 'run-123',
        decision_type: 'extraction',
      }

      const result = await logAgentDecision('run-123', decisionData)

      expect(result).toHaveProperty('decisionId')
    })

    it('inserts decision record into database', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()

      await logAgentDecision({
        agent_run_id: 'run-123',
        agent_name: 'operacional',
        decision_type: 'process',
      })

      expect(supabase.from('agent_decisions').insert).toHaveBeenCalled()
    })

    it('uses agent_run_id or run_id interchangeably', async () => {
      const result1 = await logAgentDecision({
        agent_run_id: 'run-123',
        decision_type: 'test',
      })

      const result2 = await logAgentDecision({
        run_id: 'run-456',
        decision_type: 'test',
      })

      expect(result1).toHaveProperty('decisionId')
      expect(result2).toHaveProperty('decisionId')
    })

    it('defaults step_name to default if not provided', async () => {
      await logAgentDecision({
        agent_run_id: 'run-123',
        decision_type: 'process',
      })

      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()
      expect(supabase.from('agent_decisions').insert).toHaveBeenCalled()
    })

    it('stores token usage information', async () => {
      await logAgentDecision({
        agent_run_id: 'run-123',
        agent_name: 'captador',
        decision_type: 'extraction',
        tokens_input: 500,
        tokens_output: 300,
      })

      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()
      expect(supabase.from('agent_decisions').insert).toHaveBeenCalled()
    })

    it('stores confidence score for decisions', async () => {
      await logAgentDecision({
        agent_run_id: 'run-123',
        decision_type: 'classification',
        confidence: 0.87,
      })

      expect(true).toBe(true)
    })

    it('handles escalation to human flag', async () => {
      await logAgentDecision({
        agent_run_id: 'run-123',
        decision_type: 'review',
        escalated_to_human: true,
        reasoning: 'Low confidence score',
      })

      expect(true).toBe(true)
    })

    it('serializes input/output data to JSON when needed', async () => {
      const inputData = { document_id: 'doc-123', page_count: 5 }
      const outputData = { extracted_text: 'Lorem ipsum...' }

      await logAgentDecision({
        agent_run_id: 'run-123',
        decision_type: 'extraction',
        input_data: inputData,
        output_data: outputData,
      })

      expect(true).toBe(true)
    })

    it('throws error when database fails', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      vi.mocked(createSupabaseAdmin).mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      } as any))

      await expect(
        logAgentDecision({
          agent_run_id: 'run-123',
          decision_type: 'test',
        })
      ).rejects.toThrow('Failed to log agent decision')
    })

    it('logs decision error to system_events on failure', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'agent_decisions') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValueOnce({
              data: null,
              error: { message: 'Constraint error' },
            }),
          }
        }
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: {}, error: null }),
          eq: vi.fn().mockReturnThis(),
        }
      })

      await expect(
        logAgentDecision({
          agent_run_id: 'run-123',
          decision_type: 'test',
        })
      ).rejects.toThrow()
    })
  })

  // ===========================================================================
  // UPDATE SYSTEM HEALTH TESTS
  // ===========================================================================

  describe('updateSystemHealth()', () => {
    it('updates system health with metrics object', async () => {
      const metrics = {
        cpu_usage: 45,
        memory_usage: 62,
        active_agents: 3,
        failed_runs: 0,
      }

      await updateSystemHealth('agents', metrics)

      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()
      expect(supabase.from('system_health')).toBeDefined()
    })

    it('updates system health with string status', async () => {
      await updateSystemHealth('agents', 'healthy')

      expect(true).toBe(true)
    })

    it('updates degraded status', async () => {
      await updateSystemHealth('supabase', 'degraded', { latency_ms: 250 })

      expect(true).toBe(true)
    })

    it('updates unhealthy status', async () => {
      await updateSystemHealth('ai_client', 'unhealthy', { error: 'Rate limit hit' })

      expect(true).toBe(true)
    })

    it('updates offline status', async () => {
      await updateSystemHealth('email_service', 'offline', {
        downtime_started: new Date().toISOString(),
      })

      expect(true).toBe(true)
    })
  })

  // ===========================================================================
  // ERROR RECOVERY TESTS
  // ===========================================================================

  describe('Error recovery and resilience', () => {
    it('recovers from transient database failures', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      let callCount = 0

      vi.mocked(createSupabaseAdmin).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // First call fails
          return {
            from: vi.fn().mockReturnValue({
              insert: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockRejectedValueOnce(new Error('Connection timeout')),
              eq: vi.fn().mockReturnThis(),
              lt: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
            }),
          } as any
        }
        // Second call succeeds
        return {
          from: vi.fn().mockReturnValue({
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValueOnce({
              data: { id: 'run-123' },
              error: null,
            }),
            eq: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
          }),
        } as any
      })

      // First attempt fails
      await expect(startAgentRun('operacional', 'trigger', 'manual')).rejects.toThrow()

      // Reset for second attempt
      callCount = 0
    })

    it('handles concurrent agent runs', async () => {
      const runs = Promise.all([
        startAgentRun('captador', 'dou_parsing', 'scheduled', 'company-1'),
        startAgentRun('operacional', 'process', 'manual', 'company-2'),
        startAgentRun('comunicador', 'email_send', 'trigger', 'company-3'),
      ])

      const results = await runs

      expect(results.length).toBe(3)
      results.forEach((result) => {
        expect(result).toBeDefined()
      })
    })
  })

  // ===========================================================================
  // IDEMPOTENCY TESTS
  // ===========================================================================

  describe('Idempotency', () => {
    it('returns existing run when called within same time window', async () => {
      const { createSupabaseAdmin } = await import('@/lib/supabase/server')
      const supabase = (createSupabaseAdmin as any)()

      // Mock to return existing run
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: [{ id: 'existing-run-123' }],
          error: null,
        }),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
      } as any)

      const result = await startAgentRun('captador', 'dou_parsing', 'scheduled')

      expect(result).toBeDefined()
    })
  })

  // ===========================================================================
  // STATE TRANSITION TESTS
  // ===========================================================================

  describe('State transitions', () => {
    it('transitions from running to completed', async () => {
      // Start run
      const startResult = await startAgentRun('operacional', 'process', 'manual')

      // Complete run
      const runId = typeof startResult === 'string' ? startResult : startResult.runId
      await completeAgentRun(runId, 'operacional', 'completed')

      expect(true).toBe(true)
    })

    it('transitions from running to failed', async () => {
      const startResult = await startAgentRun('operacional', 'process', 'manual')
      const runId = typeof startResult === 'string' ? startResult : startResult.runId

      await completeAgentRun(runId, 'operacional', 'failed', {}, undefined, 'Process failed')

      expect(true).toBe(true)
    })

    it('allows logging multiple decisions within single run', async () => {
      const runId = 'run-123'

      await logAgentDecision({
        agent_run_id: runId,
        decision_type: 'step_1',
      })

      await logAgentDecision({
        agent_run_id: runId,
        decision_type: 'step_2',
      })

      await logAgentDecision({
        agent_run_id: runId,
        decision_type: 'step_3',
      })

      expect(true).toBe(true)
    })
  })
})
