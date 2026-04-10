# VigiPRO — Arquitetura de Refatoração Python para Escala

## Decisão Executiva

Após análise da documentação atual (abril 2026) dos principais frameworks Python para agentes IA, filas de tarefas, automação de browser e APIs assíncronas, esta é a stack recomendada:

| Componente | Framework Escolhido | Justificativa |
|---|---|---|
| **AI Agents** (Captador, Operacional, Comunicador) | **Agno Agent** | Instanciação ~2μs, ~3.75KiB memória/agente. Structured output via Pydantic, tools async, RunContext com session_state, memory persistente em PostgreSQL |
| **Orquestração Multi-Agent** (Orquestrador) | **Agno Workflow** | Steps sequenciais/condicionais com session_state compartilhado, persistência em PostgreSQL, StepInput/StepOutput tipados |
| **Coordenação entre Agentes** | **Agno Teams** | TeamMode (broadcast, route, coordinate), delegação explícita, sub-teams, callable factories para tools dinâmicas |
| **Cognitive Engine** | **Agno Agent + Pydantic Models** | Agent dedicado com output_schema para classificação de demandas, confiança tipada, multi-provider (Haiku/Sonnet) |
| **IML (Institutional Memory Layer)** | **Agno Memory + Python puro** | Memory nativo com persistência PostgreSQL (agno_memories table) + lógica custom para Event Graph, Pattern Distiller, Adaptive Playbook |
| **Task Queue / Workers** | **Taskiq + Redis** | Async-nativo, 10x mais rápido que RQ, tipado com Pydantic, middlewares de retry/throttle, suporte Redis Streams |
| **Browser Automation (GESP)** | **Playwright Python (async)** | Mesma engine do TypeScript atual, API nativa async/await, Firefox ESR suportado |
| **API / Deploy** | **Agno AgentOS + FastAPI** | AgentOS gera endpoints SSE para agentes + custom FastAPI routes para API de negócio. Deploy via Uvicorn/Gunicorn multi-worker |
| **ORM / Database** | **SQLAlchemy 2.0 async + Supabase** | Async sessions, repository pattern tipado, compatível com Supabase PostgreSQL |
| **Observabilidade** | **Langfuse** (já em uso) | Open-source, integra com Agno via OpenTelemetry. Tracing unificado, scoring, prompt versioning. Sem vendor lock-in |
| **Validação / Modelos** | **Pydantic v2** | Base de toda a stack — modelos de dados, configs, inputs/outputs de agentes |

---

## Por que Agno como Framework Principal

Agno (ex-Phidata, 39k+ stars GitHub) unifica em um framework o que antes precisaria de PydanticAI + LangGraph + código custom:

### O que Agno resolve sozinho
- **Agentes individuais**: Agent com tools async, structured output (Pydantic), RunContext com session_state
- **Orquestração**: Workflow com Steps sequenciais/condicionais, StepInput/StepOutput tipados, session_state compartilhado
- **Multi-agent**: Teams com TeamMode (broadcast, route, coordinate), delegação explícita entre agentes
- **Memória**: Memory built-in com persistência PostgreSQL — aproveitamos para IML
- **Deploy**: AgentOS gera endpoints SSE + aceita custom FastAPI routes
- **Performance**: Instanciação ~2μs/agente, ~3.75KiB memória/agente (benchmarks oficiais 2026)

### Por que NÃO PydanticAI + LangGraph
- Dois frameworks = dois ecossistemas, dois patterns de state, overhead cognitivo
- LangGraph traz dependência do LangChain (bloat) para resolver apenas checkpointing do Orquestrador
- PydanticAI não tem memory/knowledge nativos — teríamos que construir do zero para o IML
- Agno cobre os mesmos casos de uso com uma API coerente e única

### Por que NÃO CrewAI / Celery
- CrewAI: delegação automática "mágica", menos controle fino, sem type-safety
- Celery: thread-based (nosso stack é async), 500ms+ latência acima de 30k TPS, configuração complexa

### Nota sobre Benchmarks
- O benchmark de 43.7% frequentemente citado é do AutoAgents (Rust) vs LangGraph — vantagem do Rust vs Python
- PydanticAI vs LangChain: P95 1.8s vs 3.2s (44% menor), 5x menos erros, 2.7x menos tokens
- Agno: instanciação ~2μs, memória ~3.75KiB/agente (10.000x mais rápido que LangGraph em instanciação)

---

## DDD, Event Sourcing, CQRS, Kafka — Análise de Necessidade

### TL;DR: NÃO para o VigiPRO na escala atual e projetada (500-2.000 empresas)

### Kafka — NÃO PRECISA
- VigiPRO: ~1.000 jobs/hora no pico (9 filas, 40-80 empresas)
- Kafka: projetado para milhões de eventos/segundo (Uber, Netflix, LinkedIn)
- Redis Streams via Taskiq suporta 50k+ msg/s — 50x mais que o necessário
- Kafka adiciona: ZooKeeper/KRaft, cluster management, partitioning, replication
- Custo operacional desproporcional ao benefício
- **Quando migrar**: se/quando o throughput ultrapassar 10k msg/s sustentado

### Event Sourcing — NÃO PRECISA (parcial já existe)
- O IML já faz event sourcing seletivo: Event Graph registra DECISAO_AGENTE, ERRO_SISTEMA com relações causais
- Event Sourcing completo (todo estado derivado de eventos imutáveis) é para sistemas financeiros com audit trail perfeito
- VigiPRO precisa de audit trail para agent runs e decisões (IML faz) — não para CRUD de empresas/funcionários
- **Quando migrar**: se compliance exigir audit trail completo de todas as mutações

### CQRS — NÃO PRECISA
- CQRS separa modelo de leitura e escrita em datastores diferentes
- Útil quando reads e writes têm requisitos radicalmente opostos (ex: analytics em real-time + transações ACID)
- VigiPRO: dashboard lê do mesmo PostgreSQL que os agentes escrevem
- Repository pattern com queries otimizadas + índices resolve o mesmo problema sem dois modelos
- **Quando migrar**: se queries do dashboard degradarem >2s com >5.000 empresas

### DDD — JÁ PRATICAMOS (light)
- Bounded Contexts já existem: agents/, gesp/, cognitive/, iml/, billing/, prospect/
- Entidades de domínio: Company, Employee, Workflow, AgentRun
- Regras de negócio encapsuladas: R1-R12 no PRD
- O que NÃO precisamos: Aggregates formais, Value Objects, Domain Events bus, Anti-Corruption Layers
- **Quando formalizar**: se o time crescer para 5+ devs e bounded contexts começarem a se acoplar

---

## O que o VigiPRO PRECISA para Concorrência e Escala Horizontal

Patterns simples e comprovados que escalam para 2.000+ empresas:

### 1. API — Concorrência via ASGI Workers
```
Gunicorn (process manager)
  └── Uvicorn Worker 1 (async event loop) ─── handles ~1000 concurrent requests
  └── Uvicorn Worker 2 (async event loop) ─── handles ~1000 concurrent requests
  └── Uvicorn Worker N (async event loop) ─── handles ~1000 concurrent requests
```
- **Horizontal**: adicionar mais workers (1 por CPU core) ou mais servidores atrás de load balancer
- **Config**: `gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker`
- **Stateless**: JWT auth, sem session no server — qualquer worker atende qualquer request

### 2. Workers — Concorrência via Taskiq Processes
```
Taskiq Worker Process 1
  └── gesp-sync queue (concurrency: 3)     ─── 3 GESP browsers simultâneos
  └── gesp-action queue (concurrency: 3)

Taskiq Worker Process 2
  └── email-read queue (concurrency: 5)     ─── 5 classificações paralelas
  └── email-send queue (concurrency: 5)     ─── 5 envios paralelos

Taskiq Worker Process 3
  └── compliance queue (concurrency: 10)    ─── 10 checks paralelos
  └── dou queue (concurrency: 1)            ─── 1 parse por vez (rate limit DOU)
  └── billing queue (concurrency: 1)        ─── 1 sync Asaas por vez
```
- **Horizontal**: replicar worker processes em múltiplos servidores
- **Redis Streams**: cada mensagem é consumida por exatamente 1 worker (consumer groups)
- **Concurrency limits**: definidos por fila via middleware Taskiq

### 3. GESP Browser — Pool Distribuído
```
Servidor A: BrowserPool(max=3)  ─── 3 sessões Firefox ESR simultâneas
Servidor B: BrowserPool(max=3)  ─── 3 sessões Firefox ESR simultâneas
```
- **Horizontal**: cada servidor adicional = +3 sessões GESP
- **R5**: Semaphore + set de empresas ativas garante 1 sessão por empresa
- **Certificados A1**: distribuídos via R2/S3, não ficam em disco local

### 4. Database — Connection Pooling
```python
# SQLAlchemy async com pool
engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,           # Conexões persistentes por worker
    max_overflow=20,        # Burst: até 30 conexões por worker
    pool_pre_ping=True,     # Valida conexões antes de usar
    pool_recycle=3600,      # Renova conexões a cada hora
)
```
- **Supabase**: connection pooler via PgBouncer (6000 connections suportadas)
- **Sem CQRS**: índices otimizados + queries específicas por use case no repository

### 5. Redis — Particionamento por Função
```
Redis 0: Taskiq broker (Redis Streams) — filas de trabalho
Redis 1: Taskiq results — resultados de tasks
Redis 2: Rate limiting — contadores por rota/IP
Redis 3: Cache — dados frequentes (company configs, templates)
```

### Escala Projetada

| Servidores | GESP Sessions | Workers | Empresas Simultâneas |
|---|---|---|---|
| 1 (atual) | 3 | 1 processo | 40-80 |
| 1 (Python) | 3 | 4 processos | 200-400 |
| 2 | 6 | 8 processos | 500-1.000 |
| 4 | 12 | 16 processos | 1.500-2.000 |

---

## Arquitetura de Serviços

```
                    ┌──────────────────────┐
                    │     Next.js 15       │
                    │   (Frontend SSR)     │
                    │   Mantém TypeScript  │
                    └──────────┬───────────┘
                               │ HTTP/REST
                    ┌──────────▼───────────┐
                    │  Agno AgentOS +      │
                    │  FastAPI Custom      │
                    │  (Python async)      │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼──────┐ ┌──────▼──────┐ ┌───────▼───────┐
    │  Agno Agents   │ │ GESP Service│ │ Email Service │
    │                │ │ (Playwright)│ │   (Resend)    │
    │ - Captador     │ │             │ │               │
    │ - Operacional  │ │ - Browser   │ │ - Comunicador │
    │ - Comunicador  │ │   Pool (3+) │ │ - Templates   │
    │                │ │ - Sessions  │ │ - Oficios     │
    │ Agno Workflow  │ └──────┬──────┘ └───────┬───────┘
    │ - Orquestrador │        │                │
    │                │        │                │
    │ Agno Teams     │        │                │
    │ - Coordenação  │        │                │
    └────────┬───────┘        │                │
             │                │                │
    ┌────────▼────────────────▼────────────────▼───────┐
    │                  Taskiq Workers                    │
    │              (Redis Streams Broker)                │
    │                                                    │
    │  Filas: DOU | Email-Read | GESP-Sync | GESP-Action│
    │         Compliance | Fleet | Email-Send | Billing  │
    │         Prospector                                 │
    └────────────────────────┬─────────────────────────┘
                             │
    ┌────────────────────────▼─────────────────────────┐
    │              Shared Infrastructure                 │
    │                                                    │
    │  ┌──────────┐  ┌──────────┐  ┌─────────────────┐ │
    │  │ Supabase │  │  Redis   │  │    Langfuse     │ │
    │  │ Postgres │  │  7.x     │  │  (OpenTelemetry) │ │
    │  │  (RLS)   │  │          │  │  Tracing+Scoring │ │
    │  └──────────┘  └──────────┘  └─────────────────┘ │
    │                                                    │
    │  ┌──────────┐  ┌──────────┐  ┌─────────────────┐ │
    │  │   IML    │  │ Cognitive│  │  Prospect       │ │
    │  │  Engine  │  │  Engine  │  │  Scoring        │ │
    │  └──────────┘  └──────────┘  └─────────────────┘ │
    └──────────────────────────────────────────────────┘
```

---

## Estrutura de Diretórios (Completa)

```
vigipro-python/
├── pyproject.toml                    # UV/Poetry — deps centralizadas
├── Dockerfile
├── docker-compose.yml                # Dev: Redis, Postgres, Workers
├── alembic/                          # Migrations (se necessário além do Supabase)
│
├── src/
│   ├── __init__.py
│   ├── main.py                       # FastAPI app factory + AgentOS
│   ├── config.py                     # Pydantic Settings (env vars)
│   │
│   ├── api/                          # FastAPI Routers
│   │   ├── __init__.py
│   │   ├── deps.py                   # Dependency injection (auth, db, rate-limit, billing gate R3)
│   │   ├── companies.py
│   │   ├── employees.py
│   │   ├── workflows.py
│   │   ├── relatorios.py
│   │   ├── threads.py
│   │   ├── prospects.py
│   │   └── webhooks/
│   │       ├── asaas.py              # ← billing-service.ts webhooks
│   │       └── resend.py             # ← email event webhooks
│   │
│   ├── agents/                       # Agno Agents
│   │   ├── __init__.py
│   │   ├── base.py                   # BaseAgent: logging, token tracking, IML hooks, Langfuse spans
│   │   ├── models.py                 # AgentName, TriggerType, AgentRunStatus, DecisionType, all State types
│   │   ├── tracing.py               # TraceCollector + Langfuse integration (← trace.ts)
│   │   ├── captador/
│   │   │   ├── __init__.py
│   │   │   ├── agent.py              # Agno Agent: DOU(Sonnet) + Email(Haiku→Sonnet)
│   │   │   ├── tools.py              # Tools: parse_dou, classify_email, security_keywords
│   │   │   ├── models.py             # Input/Output Pydantic models
│   │   │   ├── prompts.py            # System prompts versionados
│   │   │   └── cognitive_integration.py  # ← cognitive-captador.ts: bridge Engine↔Captador
│   │   ├── operacional/
│   │   │   ├── __init__.py
│   │   │   ├── agent.py              # Agno Agent: GESP sync, billing R3, workflow mgmt
│   │   │   ├── tools.py              # Tools: gesp_navigate, fill_form, extract_data
│   │   │   ├── models.py
│   │   │   ├── compliance.py         # ← compliance/engine.ts + operacional compliance logic
│   │   │   └── prompts.py
│   │   ├── comunicador/
│   │   │   ├── __init__.py
│   │   │   ├── agent.py              # Agno Agent: batch(R13), alerts, ofício(R12)
│   │   │   ├── tools.py              # Tools: send_email, generate_oficio, DELESP lookup
│   │   │   ├── models.py
│   │   │   └── templates.py          # Templates A-O, OF-A a OF-E (R11: CLIENTE_HTML vs OFICIO_PF)
│   │   ├── team.py                   # Agno Team (coordenação multi-agent para demandas)
│   │   └── orquestrador/
│   │       ├── __init__.py
│   │       ├── workflow.py           # Agno Workflow (FULL/LIGHT/URGENT, session_state PostgreSQL)
│   │       ├── steps.py              # plan_cycle, dispatch_agents, aggregate_results
│   │       ├── dispatcher.py         # Dispatch para filas Taskiq (BATCH_SIZE=5, DELAY=500ms)
│   │       └── models.py             # CycleType, DispatchResult, ConcurrencyLimiter
│   │
│   ├── cognitive/                    # Cognitive Engine (8 TS files → 8 Python files)
│   │   ├── __init__.py
│   │   ├── engine.py                 # Pipeline: classify(Haiku) → navigate(3 deep, $0.50 budget) → reclassify(Sonnet) → extract → resolve → escalate
│   │   ├── classifier.py             # Classificação de demandas (24 TipoDemanda)
│   │   ├── extractor.py              # ← document-processor.ts: raw content → ContentUnit, HTML/attachment parsing
│   │   ├── navigator.py              # ← page-navigator.ts: fetch HTML/PDF, User-Agent bot, skip GESP
│   │   ├── workflow_resolver.py      # ← workflow-resolver.ts (1,098 lines!): 24 demand types → workflow defs
│   │   ├── few_shot_bank.py          # ← few-shot-bank.ts: learning bank, R2 storage, quality scoring
│   │   ├── confidence.py             # Scoring de confiança (R7: <0.70 = escalar)
│   │   └── models.py                 # ContentType(6), ContentSource(6), ContentUnit, TipoDemanda(24), CognitiveConfig
│   │
│   ├── iml/                          # Institutional Memory Layer (7 TS files → 7 Python files)
│   │   ├── __init__.py
│   │   ├── event_graph.py            # 14 event types, 10 entity types, 8 relations, 5 severities
│   │   ├── pattern_distiller.py      # Daily aggregation: timing, performance, correlation, anomalies
│   │   ├── adaptive_playbook.py      # Context matching: time_range, day_of_week, company_id, agent_name
│   │   ├── reinforcement.py          # Decision tree: success rate → attempt/escalate
│   │   ├── feedback_loop.py          # Auto-approve: confidence≥0.95, accuracy≥0.9, total≥5
│   │   ├── decorator.py              # ← agent-decorator.ts: @with_iml — non-blocking agent wrapper
│   │   └── models.py                 # IMLEvent, Insight, PlaybookRule, DecisionWeight
│   │
│   ├── gesp/                         # GESP Browser Automation (13 TS files → 14 Python files)
│   │   ├── __init__.py
│   │   ├── browser.py                # GespBrowser facade (50+ process methods)
│   │   ├── browser_pool.py           # Pool de 3-15 browsers (R5), Semaphore
│   │   ├── sync.py                   # ← sync.ts (947 lines): syncEmpresa orchestrator
│   │   ├── session.py                # GespSession (1 por empresa, certificado A1)
│   │   ├── knowledge_base.py         # ← knowledge-base.ts (936 lines): 50+ GESP processes, Manual v15.0
│   │   ├── admin_gate.py             # ← admin-gate.ts (461 lines): approval TTL (critical:2h→low:72h)
│   │   ├── visual_regression.py      # ← visual-regression.ts (548 lines): pixel diff, SHA-256
│   │   ├── xml_generator.py          # ← xml-generator.ts (448 lines): bulk import (Pessoa/Veículo/Aluno)
│   │   ├── lock.py                   # ← lock.ts: R5 distributed lock via Redis
│   │   ├── timeout_guard.py          # ← timeout-guard.ts: async timeout context manager
│   │   ├── navigator.py              # Page navigation, URLs, wait states
│   │   ├── form_filler.py            # Form input, dropdowns, buttons, dialogs
│   │   ├── document_extractor.py     # Table parsing, data extraction
│   │   └── screenshot.py             # Screenshot capture for audit trail
│   │
│   ├── prospect/                     # Sistema de Prospecção
│   │   ├── __init__.py
│   │   ├── scorer.py                 # Multi-layer scoring (multa=45, cancelamento=40, prazo=35)
│   │   ├── temperature.py            # quente(≥55), morno(30-54), frio(<30)
│   │   ├── layers.py                 # Layer 1 (structured/free), 2 (Haiku batches of 5), 3 (Sonnet outreach)
│   │   ├── reply_handler.py          # ← prospect-reply.ts: intentions (positiva/negativa/neutra/fora_contexto)
│   │   ├── service.py                # ← prospect-service.ts: CRM ops, pipeline advancement
│   │   └── models.py
│   │
│   ├── workers/                      # Taskiq Workers (12 queues, 9 worker types)
│   │   ├── __init__.py
│   │   ├── broker.py                 # Taskiq broker config (Redis Streams)
│   │   ├── worker_registry.py        # ← workers/index.ts: 9 workers with concurrency configs
│   │   ├── tasks/
│   │   │   ├── __init__.py
│   │   │   ├── dou.py                # DOU parsing (concurrency: 1)
│   │   │   ├── email_read.py         # Email classification (concurrency: 5)
│   │   │   ├── gesp_sync.py          # GESP sync (concurrency: 3, retry: 5x/3min)
│   │   │   ├── gesp_action.py        # GESP action (concurrency: 3)
│   │   │   ├── compliance.py         # Compliance check (concurrency: 10)
│   │   │   ├── fleet.py              # Fleet management (concurrency: 5)
│   │   │   ├── email_send.py         # Email sending (concurrency: 5, rate: 5req/s)
│   │   │   ├── billing.py            # Billing sync (concurrency: 1)
│   │   │   ├── prospector.py         # Prospect processing (concurrency: 1, dedup by date)
│   │   │   ├── comunicador_alerts.py # Alert processing
│   │   │   └── insight_distill.py    # IML pattern distillation
│   │   └── middleware/
│   │       ├── __init__.py
│   │       ├── retry.py              # Retry com backoff (GESP: 5x, 3-12min)
│   │       ├── concurrency.py        # Limites por fila
│   │       ├── health.py             # Health monitoring (90s stale), Prometheus port 9090
│   │       └── dlq.py                # Dead letter queue (30-day retention + system_events audit)
│   │
│   ├── services/                     # Business Services (standalone)
│   │   ├── __init__.py
│   │   ├── dou_scraper.py            # ← dou-scraper-service.ts (1,010 lines): in.gov.br, 3 sections
│   │   ├── dou_prospector.py         # ← dou/prospector.ts (395 lines): separate DOU prospector
│   │   ├── dou_alerts.py             # ← dou-alert-service.ts: Template H alerts
│   │   ├── cnpj_enrichment.py        # ← cnpj-enrichment.ts: BrasilAPI, 3 req/s rate limit
│   │   ├── procuracao.py             # ← procuracao-service.ts: 7-day deadline workflow
│   │   ├── company.py                # ← company-service.ts: CRUD + CNPJ validation
│   │   ├── employee.py               # ← employee-service.ts: CRUD + email validation
│   │   └── fleet.py                  # ← fleet/gps.ts: GPS tracking, maintenance checking
│   │
│   ├── db/                           # Database Layer
│   │   ├── __init__.py
│   │   ├── session.py                # SQLAlchemy async session factory + connection pooling
│   │   ├── models/                   # SQLAlchemy models (47+ tabelas)
│   │   │   ├── __init__.py
│   │   │   ├── company.py
│   │   │   ├── employee.py
│   │   │   ├── workflow.py
│   │   │   ├── agent_run.py
│   │   │   ├── iml.py                # iml_events, iml_event_edges, iml_playbook_rules, etc.
│   │   │   ├── gesp.py               # gesp_sessions, gesp_tasks
│   │   │   └── prospect.py           # prospects, prospect_scores
│   │   └── repositories/             # Repository pattern
│   │       ├── __init__.py
│   │       ├── base.py               # BaseRepository[T] genérico
│   │       ├── companies.py
│   │       ├── agent_runs.py
│   │       ├── gesp_tasks.py
│   │       ├── iml.py                # IML events, playbook, feedback
│   │       └── prospects.py
│   │
│   ├── email/                        # Email Service
│   │   ├── __init__.py
│   │   ├── reader.py                 # ← gmail.ts: Gmail API reading
│   │   ├── parser.py                 # ← parser.ts: Email content parsing/classification
│   │   ├── sender.py                 # ← sender.ts: Resend API wrapper (5 req/s)
│   │   ├── templates.py              # Template rendering (A-O, OF-A a OF-E)
│   │   └── models.py                 # EmailTemplateId, EmailMode, etc.
│   │
│   ├── billing/                      # Billing Service
│   │   ├── __init__.py
│   │   ├── provider.py               # BillingProvider ABC
│   │   ├── asaas.py                  # Asaas implementation
│   │   ├── service.py                # ← billing-service.ts: overview + payment processing
│   │   └── models.py
│   │
│   ├── security/                     # Security
│   │   ├── __init__.py
│   │   ├── auth.py                   # JWT + Supabase auth
│   │   ├── billing_gate.py           # ← security/billing-gate.ts: R3 enforcement
│   │   ├── rate_limit.py             # Rate limiting por rota
│   │   └── csrf.py
│   │
│   └── core/                         # Shared utilities
│       ├── __init__.py
│       ├── ai_client.py              # ← ai/client.ts: Agno multi-provider config (Haiku/Sonnet)
│       ├── storage.py                # ← r2/client.ts: R2/S3 abstraction (traces, few-shot, screenshots)
│       ├── redis.py                  # ← redis/connection.ts: Connection pool
│       ├── constants.py              # GESP_TIMING, FLEET_THRESHOLDS, SECURITY_KEYWORDS, etc.
│       ├── token_tracker.py          # Token usage tracking
│       ├── exceptions.py             # Custom exceptions
│       └── logging.py                # Structured logging config (JSON, correlation IDs)
│
├── tests/
│   ├── conftest.py                   # Fixtures: db, redis mock, agent deps, Langfuse mock
│   ├── unit/
│   │   ├── agents/                   # Tests para todos os 4 agentes + prospect
│   │   ├── cognitive/                # Tests engine, classifier, workflow_resolver, few_shot
│   │   ├── iml/                      # Tests event_graph, distiller, playbook, reinforcement
│   │   ├── gesp/                     # Tests browser, sync, knowledge_base, admin_gate, xml
│   │   └── services/                 # Tests DOU scraper, CNPJ, procuracao, fleet
│   ├── integration/
│   │   ├── api/
│   │   └── workers/
│   └── e2e/
│       ├── test_full_cycle.py
│       ├── test_light_cycle.py
│       ├── test_urgent_cycle.py
│       └── test_gesp_flow.py
│
└── scripts/
    ├── migrate_data.py               # Migração de dados TypeScript → Python
    └── seed_dev.py                   # Seed para desenvolvimento
```

---

## Detalhamento dos Frameworks

### 1. Agno Agent — Captador

```python
# src/agents/captador/agent.py
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools import tool
from agno.run import RunContext
from agno.db.postgres import PostgresDb
from pydantic import BaseModel, Field

from src.agents.captador.models import CaptadorOutput, DemandaClassificada
from src.cognitive.engine import CognitiveEngine
from src.core.constants import SUPABASE_DB_URL

class ClassificationResult(BaseModel):
    demand_type: str = Field(description="Um dos 14 tipos de demanda")
    confidence: float = Field(ge=0, le=1, description="Score de confiança R7")
    extracted_data: dict = Field(default_factory=dict)

@tool
async def classify_email(
    run_context: RunContext,
    email_content: str,
    attachments: list[str],
) -> str:
    """Classifica um email em uma das 14 categorias de demanda.

    Args:
        email_content: Conteúdo do email a classificar.
        attachments: Lista de URLs/paths dos anexos.
    """
    engine = CognitiveEngine()
    result = await engine.classify(email_content, attachments)

    # Salvar resultado no session_state para próximos steps
    run_context.session_state["last_classification"] = {
        "demand_type": result.demand_type,
        "confidence": result.confidence,
    }

    return f"Classificado como {result.demand_type} (confiança: {result.confidence})"

@tool
async def parse_dou_section(
    run_context: RunContext,
    section: int,
    content: str,
) -> str:
    """Parseia uma seção do DOU identificando alvarás de vigilância.

    Args:
        section: Número da seção do DOU (1, 2 ou 3).
        content: Conteúdo textual da seção.
    """
    from src.services.dou_parser import DouParser
    parser = DouParser()

    # Tier 1: regex rápido
    matches = parser.regex_scan(section, content)
    # Tier 2: Haiku enrichment para matches ambíguos
    enriched = []
    for match in matches:
        if match.needs_enrichment:
            enriched.append(await parser.haiku_enrich(match))
        else:
            enriched.append(match)

    run_context.session_state["dou_matches"] = len(enriched)
    return f"Encontrados {len(enriched)} alvarás na seção {section}"

# Definição do agente
captador_agent = Agent(
    id="captador",
    name="Agente Captador",
    model=Claude(id="claude-haiku-4-5"),
    instructions=(
        "Você é o Agente Captador do VigiPRO. Sua função é:\n"
        "1. Parsear publicações do DOU (3 seções) identificando alvarás de vigilância\n"
        "2. Classificar emails recebidos em 14 tipos de demanda\n"
        "3. Atribuir score de confiança (R7: <0.70 = escalar para humano)\n"
        "4. Extrair dados estruturados para encaminhar ao Operacional"
    ),
    tools=[classify_email, parse_dou_section],
    output_schema=CaptadorOutput,
    db=PostgresDb(db_url=SUPABASE_DB_URL),
    update_memory_on_run=True,  # IML: memoriza padrões de classificação
    session_state={
        "last_classification": None,
        "dou_matches": 0,
    },
    markdown=False,
)
```

### 2. Agno Workflow — Orquestrador (Ciclos FULL/LIGHT/URGENT)

```python
# src/agents/orquestrador/workflow.py
from agno.workflow import Workflow, Step, StepInput, StepOutput, Condition
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.db.postgres import PostgresDb
from enum import Enum
import asyncio

from src.core.constants import SUPABASE_DB_URL, BATCH_DELAY_MS

class CycleType(str, Enum):
    FULL = "full"
    LIGHT = "light"
    URGENT = "urgent"

# Step 1: Planejar ciclo — determina empresas alvo
async def plan_cycle(step_input: StepInput, session_state: dict) -> StepOutput:
    from src.db.repositories import repositories
    repo = repositories.companies

    cycle_type = session_state.get("cycle_type", CycleType.FULL)

    if cycle_type == CycleType.URGENT:
        companies = await repo.get_urgent()
    elif cycle_type == CycleType.FULL:
        companies = await repo.get_all_active()
    else:
        companies = await repo.get_pending_sync()

    company_ids = [c.id for c in companies]
    session_state["companies"] = company_ids
    session_state["total_companies"] = len(company_ids)
    session_state["current_index"] = 0
    session_state["succeeded"] = 0
    session_state["failed"] = 0
    session_state["errors"] = []

    return StepOutput(content=f"Planejado ciclo {cycle_type}: {len(company_ids)} empresas")

# Step 2: Despachar agentes via Taskiq
async def dispatch_agents(step_input: StepInput, session_state: dict) -> StepOutput:
    from src.workers.tasks.gesp_sync import gesp_sync_task

    companies = session_state["companies"]
    start_index = session_state["current_index"]  # Retoma de onde parou

    for i in range(start_index, len(companies)):
        company_id = companies[i]
        try:
            result = await gesp_sync_task.kiq(
                company_id=company_id,
                dispatch_id=f"{session_state['cycle_type']}-{i}",
            )
            session_state["succeeded"] += 1
        except Exception as e:
            session_state["failed"] += 1
            session_state["errors"].append(f"{company_id}: {e}")

        session_state["current_index"] = i + 1  # Checkpoint no PostgreSQL
        await asyncio.sleep(BATCH_DELAY_MS / 1000)  # Stagger 500ms

    return StepOutput(
        content=f"Despachados: {session_state['succeeded']} ok, {session_state['failed']} falhas"
    )

# Step 3: Agregar resultados e registrar no IML
async def aggregate_results(step_input: StepInput, session_state: dict) -> StepOutput:
    from src.iml.event_graph import emit_event

    await emit_event(
        event_type="CICLO_COMPLETO",
        agent="orquestrador",
        data={
            "cycle_type": session_state["cycle_type"],
            "total": session_state["total_companies"],
            "succeeded": session_state["succeeded"],
            "failed": session_state["failed"],
        },
    )

    return StepOutput(
        content=(
            f"Ciclo {session_state['cycle_type']} completo: "
            f"{session_state['succeeded']}/{session_state['total_companies']} sucesso"
        )
    )

# Condição: só despacha se há empresas
def has_companies(step_input: StepInput, session_state: dict) -> bool:
    return len(session_state.get("companies", [])) > 0

# Montagem do Workflow
orchestrator_workflow = Workflow(
    name="Orquestrador VigiPRO",
    steps=[
        Step(name="plan", description="Planejar ciclo", executor=plan_cycle),
        Condition(
            name="has_companies",
            evaluator=has_companies,
            steps=[
                Step(name="dispatch", description="Despachar agentes", executor=dispatch_agents),
                Step(name="aggregate", description="Agregar resultados", executor=aggregate_results),
            ],
        ),
    ],
    db=PostgresDb(db_url=SUPABASE_DB_URL),  # session_state persiste no PostgreSQL
    debug_mode=True,
)

# Uso:
# result = await orchestrator_workflow.arun(
#     "Iniciar ciclo FULL",
#     session_state={"cycle_type": CycleType.FULL},
#     session_id="cycle-2026-04-06-full",  # Mesmo ID = retoma estado do PostgreSQL
# )
```

### 2b. Agno Teams — Coordenação Multi-Agent

```python
# src/agents/team.py
from agno.agent import Agent
from agno.team import Team, TeamMode
from agno.models.anthropic import Claude
from agno.db.postgres import PostgresDb

from src.agents.captador.agent import captador_agent
from src.agents.operacional.agent import operacional_agent
from src.agents.comunicador.agent import comunicador_agent
from src.core.constants import SUPABASE_DB_URL

# Team para processar uma demanda completa (captação → operação → comunicação)
demanda_team = Team(
    name="Processamento de Demanda",
    mode=TeamMode.coordinate,  # Líder coordena sequencialmente
    members=[captador_agent, operacional_agent, comunicador_agent],
    instructions=(
        "Processe a demanda na ordem:\n"
        "1. Captador classifica e extrai dados\n"
        "2. Operacional executa ação no GESP se necessário\n"
        "3. Comunicador envia email/ofício de resultado"
    ),
    db=PostgresDb(db_url=SUPABASE_DB_URL),
    enable_agentic_memory=True,  # IML: team aprende com execuções anteriores
)
```

### 3. Taskiq — Workers

```python
# src/workers/broker.py
from taskiq import TaskiqScheduler
from taskiq_redis import RedisStreamBroker, RedisAsyncResultBackend

broker = RedisStreamBroker(
    url="redis://localhost:6379/0",
    result_backend=RedisAsyncResultBackend(
        redis_url="redis://localhost:6379/1",
    ),
)

# src/workers/tasks/gesp_sync.py
from src.workers.broker import broker
from src.gesp.browser_pool import browser_pool

@broker.task(
    task_name="gesp_sync",
    retry_on_error=True,
    max_retries=5,
    # Labels para middleware de concurrency
    labels={"queue": "gesp-sync", "max_concurrent": 3},
)
async def gesp_sync_task(
    company_id: str,
    certificate_path: str,
    dispatch_id: str,
) -> dict:
    """Sincroniza dados da empresa com GESP."""
    async with browser_pool.acquire() as browser:
        session = await browser.new_session(
            company_id=company_id,
            certificate_path=certificate_path,
        )
        try:
            snapshot = await session.snapshot_empresa()
            return {"success": True, "data": snapshot}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            await session.close()
```

### 4. Agno AgentOS + FastAPI Custom Routes

```python
# src/main.py
from fastapi import FastAPI, Depends, HTTPException, Security
from fastapi.security import HTTPBearer
from agno.os import AgentOS

from src.agents.captador.agent import captador_agent
from src.agents.operacional.agent import operacional_agent
from src.agents.comunicador.agent import comunicador_agent
from src.agents.team import demanda_team
from src.api import companies, employees, workflows, relatorios, threads, prospects
from src.security.auth import verify_jwt, JWTPayload

# Custom FastAPI app com rotas de negócio
app = FastAPI(title="VigiPRO API", version="2.0.0")

# Rotas de negócio (CRUD, relatórios, etc.)
app.include_router(companies.router, prefix="/api/companies", tags=["companies"])
app.include_router(employees.router, prefix="/api/employees", tags=["employees"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["workflows"])
app.include_router(relatorios.router, prefix="/api/relatorios", tags=["relatorios"])
app.include_router(threads.router, prefix="/api/threads", tags=["threads"])
app.include_router(prospects.router, prefix="/api/prospects", tags=["prospects"])

@app.get("/api/health")
async def health():
    return {"status": "healthy", "version": "2.0.0"}

# AgentOS: gera endpoints SSE para interação com agentes + usa nosso FastAPI
agent_os = AgentOS(
    agents=[captador_agent, operacional_agent, comunicador_agent],
    teams=[demanda_team],
    base_app=app,  # Agno respeita nossas rotas custom + adiciona as dele
)

app = agent_os.get_app()

# Deploy: gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker

# src/api/deps.py — Dependency injection para rotas de negócio
security = HTTPBearer()

async def get_current_user(credentials=Security(security)) -> JWTPayload:
    payload = await verify_jwt(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Não autenticado")
    return payload

async def require_admin(user: JWTPayload = Depends(get_current_user)) -> JWTPayload:
    if user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Sem permissão")
    return user
```

### 5. Playwright Python — GESP Browser Pool

```python
# src/gesp/browser_pool.py
import asyncio
from contextlib import asynccontextmanager
from playwright.async_api import async_playwright, Browser, BrowserContext

from src.core.constants import GESP_MAX_BROWSERS

class BrowserPool:
    """Pool de browsers Firefox ESR para GESP.

    PRD Regra R5: Máx. 1 sessão por empresa, 3 browsers no servidor.
    """

    def __init__(self, max_browsers: int = GESP_MAX_BROWSERS):
        self._max = max_browsers
        self._semaphore = asyncio.Semaphore(max_browsers)
        self._playwright = None
        self._browsers: list[Browser] = []
        self._available: asyncio.Queue[Browser] = asyncio.Queue()
        self._active_companies: set[str] = set()

    async def startup(self):
        self._playwright = await async_playwright().start()
        for _ in range(self._max):
            browser = await self._playwright.firefox.launch(
                headless=True,
                firefox_user_prefs={
                    "security.enterprise_roots.enabled": True,
                },
            )
            self._browsers.append(browser)
            await self._available.put(browser)

    async def shutdown(self):
        for browser in self._browsers:
            await browser.close()
        if self._playwright:
            await self._playwright.stop()

    @asynccontextmanager
    async def acquire(self, company_id: str | None = None):
        """Adquire um browser do pool. Respeita R5."""
        if company_id and company_id in self._active_companies:
            raise RuntimeError(f"Empresa {company_id} já tem sessão ativa (R5)")

        await self._semaphore.acquire()
        browser = await self._available.get()

        if company_id:
            self._active_companies.add(company_id)

        try:
            yield browser
        finally:
            if company_id:
                self._active_companies.discard(company_id)
            await self._available.put(browser)
            self._semaphore.release()

browser_pool = BrowserPool()
```

### 6. SQLAlchemy 2.0 Async — Repository Pattern

```python
# src/db/repositories/base.py
from typing import TypeVar, Generic, Type
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models.base import Base

T = TypeVar("T", bound=Base)

class BaseRepository(Generic[T]):
    """Repository base genérico com operações CRUD tipadas."""

    def __init__(self, session: AsyncSession, model: Type[T]):
        self._session = session
        self._model = model

    async def get_by_id(self, id: str) -> T | None:
        return await self._session.get(self._model, id)

    async def get_all(self, limit: int = 100, offset: int = 0) -> list[T]:
        result = await self._session.execute(
            select(self._model).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def create(self, **kwargs) -> T:
        instance = self._model(**kwargs)
        self._session.add(instance)
        await self._session.flush()
        return instance

    async def update(self, id: str, **kwargs) -> T | None:
        instance = await self.get_by_id(id)
        if instance:
            for key, value in kwargs.items():
                setattr(instance, key, value)
            await self._session.flush()
        return instance

    async def count(self) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(self._model)
        )
        return result.scalar_one()
```

---

## Mapeamento Completo TypeScript → Python

> **Auditoria completa**: 70+ arquivos TypeScript mapeados cobrindo 100% do codebase.

### Agentes (src/lib/agents/ → src/agents/) — 10 arquivos, 5.838 linhas

| TypeScript | Linhas | Python | Notas |
|---|---|---|---|
| `base.ts` — startAgentRun, completeAgentRun, logAgentDecision, updateSystemHealth, TokenTracker | 385 | `base.py` — decorators com Langfuse spans | Tables: agent_runs, agent_decisions, system_health, system_events |
| `types.ts` — AgentName, TriggerType, AgentRunStatus, DecisionType, BaseAgentState, CaptadorState, OperacionalState, ComunicadorState, OrquestradorState | 265 | `models.py` — Pydantic enums + BaseModel states | Todas as interfaces tipadas como BaseModel |
| `trace.ts` — TraceCollector, persistTrace, getCompanyTraces, getTraceStats | 494 | `tracing.py` — integrado com Langfuse | Supabase `agent_traces` + R2 `traces/{companyId}/{agentName}/{date}/{traceId}.json` |
| `captador.ts` — runCaptadorDOU (Sonnet + prompt caching), runCaptadorEmail (Haiku 0.70 → Sonnet) | 917 | `captador/` — agent.py, tools.py, models.py, prompts.py | Keywords: vigilância, alvará, CNV, etc. |
| `operacional.ts` — runOperacionalGESP (billing R3), runOperacionalCompliance (CNV/alvará), runOperacionalWorkflow (critical ops → human approval) | 710 | `operacional/` — agent.py, tools.py, models.py, compliance.py, prompts.py | Critical ops: arma, encerramento, destruicao, alteracao_postos |
| `comunicador.ts` — runComunicadorBatch (priority R13), runComunicadorAlerts (compliance+DOU), runComunicadorOficio (DELESP by state R12) | 759 | `comunicador/` — agent.py, tools.py, models.py, templates.py | Email modes: CLIENTE_HTML vs OFICIO_PF (R11) |
| `orquestrador.ts` — runFullCycle (Mon-Sat 5x/day), runLightCycle (Sun 2x), runUrgentCycle (R10). pollJobCompletion (300s timeout), createConcurrencyLimiter (max 3) | 1.198 | `orquestrador/` — workflow.py (Agno Workflow), steps.py, dispatcher.py, models.py | BATCH_SIZE=5, BATCH_DELAY_MS=500 |
| `prospect-reply.ts` — isProspectReply, processProspectReply. Intentions: positiva(+30), negativa(opt_out, 90d cooldown), neutra(+10), fora_contexto | 381 | `prospect/reply_handler.py` | Integra com prospect scoring |
| `prospector.ts` — runProspectorDaily, runProspectorBackfill. 3-layer intelligence: structured, semi-structured(Haiku batches of 5), contextual(Sonnet). Scoring: multa=45, cancelamento=40, prazo_vencendo=35 | 681 | `prospect/scorer.py` + `prospect/layers.py` | Temperature: quente(≥55), morno(30-54), frio(<30) |
| `index.ts` — barrel export | 48 | `__init__.py` | — |

### Cognitive Engine (src/lib/cognitive/ → src/cognitive/) — 8 arquivos, 3.170 linhas

| TypeScript | Linhas | Python | Notas |
|---|---|---|---|
| `types.ts` — ContentType(6), ContentSource(6), ContentUnit, CognitiveAnalysis, CognitiveClassification, WorkflowAction, TipoDemanda(24 tipos), DEFAULT_COGNITIVE_CONFIG | 272 | `models.py` — Pydantic BaseModel | depth:3, maxLinks:5, timeout:30s, confidence:0.70 |
| `engine.ts` — CognitiveEngine: process → classify(Haiku) → navigate(depth≤3, budget≤$0.50) → reclassify(Sonnet) → extract → resolve workflow → escalate R7 | 661 | `engine.py` — Pipeline principal | PRD rules R1-R12 enforced |
| `document-processor.ts` — DocumentProcessor: raw content → ContentUnit. HTML link extraction (regex), button extraction, attachment type inference | 263 | `extractor.py` — Content transformation | Inclui HTML parsing e attachment detection |
| `page-navigator.ts` — PageNavigator: fetch HTML/PDF. User-Agent "VIG-PRO-Compliance-Bot/1.0". Skip GESP URLs. Fallback PDF text extraction | 218 | `navigator.py` — Autonomous link navigation | 3 níveis de profundidade |
| `workflow-resolver.ts` — WorkflowResolver: 24 demand types → workflow definitions. Each workflow has steps, templates, applicable rules | 1.098 | `workflow_resolver.py` — Demand type routing | 24 tipos: novo_vigilante → importacao_xml. Cada tipo define steps, templates, regras |
| `cognitive-captador.ts` — Integration CognitiveEngine↔Captador. Creates email_workflows + escalations in Supabase | 255 | `captador/cognitive_integration.py` | Bridge layer entre engine e agente |
| `few-shot-bank.ts` — Few-shot learning bank. R2 storage `few_shot_bank/{demandType}/{exampleId}.json`. Quality scoring: human=0.9, agent=0.5, +0.05/-0.1 feedback | 367 | `few_shot_bank.py` — Learning from examples | Supabase `iml_few_shot_examples` + R2 |
| `index.ts` — barrel export | 36 | `__init__.py` | — |

### IML (src/lib/iml/ → src/iml/) — 7 arquivos, 1.678 linhas

| TypeScript | Linhas | Python | Notas |
|---|---|---|---|
| `event-graph.ts` — emitEvent, linkEvents, getAgentEvents, getEventChain, getCompanyEventHistory. 14 event types, 10 entity types, 8 relation types, 5 severity levels | 263 | `event_graph.py` | Tables: iml_events, iml_event_edges |
| `pattern-distiller.ts` — runPatternDistillation (daily). 4 aggregation dims: timing, performance, correlation, anomalies. Haiku interprets. Confidence 0.3→grows. Ready: evidence_count≥5 AND confidence≥0.85 | 307 | `pattern_distiller.py` | ~2.5K tokens/run |
| `adaptive-playbook.ts` — queryPlaybook, approveInsightToPlaybook, rejectInsight. Context matching: time_range, day_of_week, company_id, agent_name. MIN_CONFIDENCE=0.7 | 337 | `adaptive_playbook.py` | Tables: iml_playbook_rules, iml_playbook_log |
| `reinforcement.ts` — recordOutcome, shouldAttempt. Decision tree: no history→0.5, ≥70%→high, 30-70%→medium, <30% AND ≥10→escalate | 301 | `reinforcement.py` | Table: iml_decision_weights |
| `feedback-loop.ts` — recordInsightFeedback, getDistillerCalibration, shouldAutoApprove. Auto-approve: confidence≥0.95 AND accuracy≥0.9 AND total≥5 | 193 | `feedback_loop.py` | Accuracy=(approved+0.5*modified)/total |
| `agent-decorator.ts` — withIML\<T\> wrapper. Non-blocking. Agent→rule mapping: captador→R1,R3,R5,R8; operacional→R2,R3,R4,R6,R8; comunicador→R3,R5,R7,R8; orquestrador→R1,R2,R9,R10,R11,R12 | 231 | `decorator.py` — @with_iml decorator | Python decorator pattern nativo |
| `index.ts` — barrel export | 46 | `__init__.py` | — |

### GESP Browser Automation (src/lib/gesp/ → src/gesp/) — 13 arquivos, ~7.000+ linhas

| TypeScript | Linhas | Python | Notas |
|---|---|---|---|
| `browser.ts` — GespBrowser facade: 50+ métodos de processo GESP | 3.473 | `browser.py` — GespBrowser facade (decomposed) | Mantém facade pattern, delega para sub-módulos |
| `sync.ts` — syncEmpresa: validate → billing → open browser → execute tasks → close | 947 | `sync.py` — Sync orchestrator | Entry point principal para GESP operations |
| `knowledge-base.ts` — ~50+ GESP processes (Manual v15.0). Risk levels, deadlines, required fields | 936 | `knowledge_base.py` — Process catalog | Mapeamento completo de processos GESP |
| `admin-gate.ts` — Approval workflow. TTL por urgência: critical:2h, high:8h, normal:24h, low:72h | 461 | `admin_gate.py` — Human approval flow | Integra com dashboard para aprovações |
| `visual-regression.ts` — Pixel comparison, SHA-256 hashing | 548 | `visual_regression.py` — Screenshot diffing | Detecta mudanças no portal GESP |
| `xml-generator.ts` — XML para bulk import GESP (Pessoa, Veículo, Aluno) | 448 | `xml_generator.py` — Bulk XML creation | 3 tipos de importação |
| `lock.ts` — R5 enforcement, gesp_sessions table | 222 | `lock.py` — Distributed lock (Redis) | Max concurrent sessions |
| `timeout-guard.ts` — Operation timeout enforcement | 117 | `timeout_guard.py` — async timeout context | Previne operações penduradas |
| `form-filler.ts` — Form input, dropdowns, button clicks, dialogs | 133 | `form_filler.py` | Playwright selectors |
| `document-extractor.ts` — Table parsing, data extraction, HTML content | 165 | `document_extractor.py` | Extração de dados do portal |
| `page-navigator.ts` — Page navigation, URLs, wait states | 117 | `navigator.py` | Navegação e espera |
| `screenshot-manager.ts` — Screenshot capture and management | 30 | `screenshot.py` | Captura para auditoria |
| `index.ts` — barrel export | 26 | `__init__.py` | — |

### Services (src/lib/services/ → distribuídos) — 8 arquivos, 3.278 linhas

| TypeScript | Linhas | Python Destino | Notas |
|---|---|---|---|
| `dou-scraper-service.ts` — DOU scraping from in.gov.br, 3 sections, keyword filtering, alvará extraction | 1.010 | `services/dou_scraper.py` | Scraping das 3 seções do DOU |
| `prospect-service.ts` — CRM operations, scoring algorithm, pipeline advancement | 513 | `prospect/service.py` | Operações de CRM e pipeline |
| `cnpj-enrichment.ts` — BrasilAPI integration, 3 req/s rate limit | 437 | `services/cnpj_enrichment.py` | Rate-limited HTTP client |
| `procuracao-service.ts` — Electronic procuration workflow (7-day deadline) | 390 | `services/procuracao.py` | Workflow de procuração eletrônica |
| `dou-alert-service.ts` — Alert email sending with Template H | 328 | `services/dou_alerts.py` | Usa email/sender.py |
| `billing-service.ts` — Billing overview and payment processing | 233 | `billing/service.py` | Integração Asaas |
| `company-service.ts` — Company CRUD with CNPJ validation | 190 | `services/company.py` | Validação CNPJ |
| `employee-service.ts` — Employee CRUD with email validation | 177 | `services/employee.py` | Validação email |

### Workers/Queue (src/workers/ + src/lib/queue/ → src/workers/) — 4 arquivos, 901 linhas

| TypeScript (BullMQ) | Linhas | Python (Taskiq) | Notas |
|---|---|---|---|
| `queues.ts` — 12 queue factories. Default: 3 attempts, 5s exponential backoff | 64 | `broker.py` — RedisStreamBroker | Redis Streams > Redis Lists |
| `jobs.ts` — Job creation functions with typed payloads. GESP_RETRY: 5 attempts, 3min backoff. Prospector dedup. DLQ: 30-day retention + system_events audit | 281 | `tasks/*.py` — @broker.task decorators | Tipado com Pydantic |
| `workers/index.ts` — 9 workers: DOU(1), prospector(1), email-read(5), gesp-sync(3), gesp-action(3), compliance(10), fleet(5), email-send(5, 5req/s), billing(1). Graceful shutdown: 30s grace + 5s hard | 391 | `worker_registry.py` + `middleware/concurrency.py` | Mesmo controle fino |
| `workers/health.ts` — Health monitoring, 90s stale threshold, Prometheus metrics port 9090 | 165 | `middleware/health.py` | Prometheus /metrics endpoint |

### Supporting Modules (espalhados → src/core/ + src/services/) — 12+ arquivos

| TypeScript | Python Destino | Notas |
|---|---|---|
| `lib/dou/prospector.ts` (395 lines) — Separate DOU prospector module | `services/dou_prospector.py` | Diferente do agents/prospector — faz scraping específico |
| `lib/ai/client.ts` — Anthropic client wrapper | `core/ai_client.py` — Agno provider config | Multi-provider (Haiku/Sonnet) via Agno |
| `lib/ai/prompts.ts` — All system prompts | `agents/*/prompts.py` — Distribuídos por agente | Cada agente gerencia seus prompts |
| `lib/r2/client.ts` — Cloudflare R2 storage client | `core/storage.py` — R2/S3 client abstraction | Traces, few-shot bank, screenshots |
| `lib/compliance/engine.ts` — Compliance checking engine | `agents/operacional/compliance.py` | Absorvido pelo agente operacional |
| `lib/fleet/gps.ts` — Fleet/GPS maintenance checking | `services/fleet.py` | GPS tracking e manutenção |
| `lib/email/gmail.ts` — Email reading (Gmail API) | `email/reader.py` | Leitura de emails para classificação |
| `lib/email/sender.ts` — Email sending (Resend API) | `email/sender.py` | 5 req/s rate limit |
| `lib/parser.ts` — Email parsing/classification | `email/parser.py` | Parsing de conteúdo de email |
| `lib/security/billing-gate.ts` — Billing gating (R3) | `security/billing_gate.py` | CNV/alvará always allowed |
| `lib/redis/connection.ts` — Redis connection pool | `core/redis.py` | Connection pool reusable |
| `lib/supabase/repositories/*.ts` — Repository layer (3 repos + base) | `db/repositories/*.py` | SQLAlchemy 2.0 async |

### Infrastructure & Utilities (espalhados → src/core/, src/security/, src/email/) — 30+ arquivos

| TypeScript | Python Destino | Notas |
|---|---|---|
| `lib/auth/*.ts` (6 files: jwt, jwt-edge, mfa, middleware, password, refresh-token, exchange-store) | `security/auth.py` — consolidado | JWT, MFA, password hashing — consolidado em 1-2 files |
| `lib/api/response.ts` + `lib/api/with-auth.ts` | `api/deps.py` — FastAPI dependencies | Response helpers + auth wrapper unificados |
| `lib/billing/asaas.ts` + `lib/billing/types.ts` | `billing/asaas.py` + `billing/models.py` | Já mapeado na seção billing/ |
| `lib/config/env.ts` + `lib/config/constants.ts` + `lib/config/env-warning.ts` | `config.py` — Pydantic Settings | Validação automática de env vars |
| `lib/constants/*.ts` (funcoes, pipeline, planos, queues, index) | `core/constants.py` | Todas as constantes de negócio em um módulo |
| `lib/core/token-tracker.ts` | `core/token_tracker.py` | Já mapeado |
| `lib/dou/parser.ts` — DOU content parsing | `services/dou_parser.py` | Separado do scraper — parsing puro |
| `lib/email/oficios.ts` — Ofício PDF templates | `email/oficios.py` | Templates OF-A a OF-E para DELESP |
| `lib/email/threading.ts` — Email thread management | `email/threading.py` | Thread tracking e grouping |
| `lib/lgpd/compliance.ts` — LGPD data protection | `security/lgpd.py` | Compliance com Lei Geral de Proteção de Dados |
| `lib/observability/langfuse.ts` + `lib/observability/logger.ts` + `lib/observability/failure-alerts.ts` | `core/observability.py` | Langfuse config + structured logging + alert triggers |
| `lib/parser/classifier.ts` + `lib/parser/extractor.ts` + `lib/parser/index.ts` | `email/parser.py` — consolidado | Email content classification + extraction |
| `lib/r2/client.ts` + `lib/r2/security.ts` | `core/storage.py` | R2/S3 client + signed URL security |
| `lib/redis/connection.ts` + `lib/redis/cache.ts` | `core/redis.py` | Connection pool + caching layer |
| `lib/security/billing-gate.ts` | `security/billing_gate.py` | Já mapeado (R3) |
| `lib/security/cron-auth.ts` | `security/cron_auth.py` | Autenticação de cron jobs (Bearer token) |
| `lib/security/crypto.ts` | `security/crypto.py` | Encryption utilities |
| `lib/security/csrf.ts` + `lib/security/csrf-middleware.ts` | `security/csrf.py` | CSRF protection |
| `lib/security/file-validation.ts` | `security/file_validation.py` | Upload file type/size validation |
| `lib/security/rate-limit.ts` | `security/rate_limit.py` | Já mapeado |
| `lib/supabase/client.ts` + `lib/supabase/server.ts` + `lib/supabase/middleware.ts` | `db/session.py` + `core/supabase.py` | SQLAlchemy substitui client direto; Supabase Auth mantém SDK |
| `lib/validation/sanitize.ts` + `lib/validation/schemas.ts` | `core/validation.py` | Input sanitization + Pydantic schemas |
| `lib/webhooks/signature.ts` + `lib/webhooks/verify.ts` | `api/webhooks/verify.py` | Webhook signature verification |
| `lib/formatters.ts` + `lib/utils.ts` | `core/utils.py` | Formatadores e utilidades gerais |

### Arquivos que PERMANECEM em TypeScript (Frontend-only)

| Arquivo | Motivo |
|---|---|
| `lib/design-tokens.ts` | Tokens de design CSS — frontend only |
| `lib/suspense-utils.ts` | React Suspense helpers — frontend only |
| `lib/__tests__/*.test.ts` (8 files) | Testes do frontend — permanecem com Next.js |

---

## Regras de Negócio Preservadas

Todas as regras R1-R12 do PRD são mantidas exatamente:

| Regra | Implementação Python |
|---|---|
| **R3** — Billing gating | `api/deps.py` — dependency que verifica status Asaas. CNV/alvará sempre permitidos |
| **R5** — Max browsers | `gesp/browser_pool.py` — Semaphore(3) + active_companies set |
| **R7** — Confiança <0.70 | `cognitive/confidence.py` — ConfidenceScore.should_escalate() |
| **R9** — Stop alerts renovação | `agents/captador/tools.py` — check DOU antes de alertar |
| **R10** — URGENTE → ciclo imediato | `agents/orquestrador/workflow.py` — CycleType.URGENT path (Agno Workflow) |
| **R11** — PF text vs Cliente HTML | `email/templates.py` — EmailMode enum |
| **R12** — Ofício → DELESP estado | `agents/comunicador/tools.py` — lookup UF da empresa |

---

## Plano de Migração em 8 Fases

### Fase 1: Fundação + Core (1 semana)
- Configurar projeto Python (pyproject.toml, UV)
- FastAPI app factory + config Pydantic Settings
- SQLAlchemy 2.0 async models (mapear 47+ tabelas do Supabase)
- Repository base genérico + repositories concretos (companies, agent_runs, gesp_tasks, iml, prospects)
- `core/`: ai_client.py (Agno multi-provider), storage.py (R2/S3), redis.py (connection pool), token_tracker, logging
- `security/`: auth.py (JWT Supabase), billing_gate.py (R3), rate_limit.py
- Docker Compose (Redis, Postgres dev)

### Fase 2: Workers + Queue (1 semana)
- Taskiq broker com Redis Streams
- Middlewares: retry, concurrency, health (Prometheus 9090), DLQ (30-day retention)
- Migrar as 12 definições de fila com mesmas configs e concurrency limits
- Worker registry (9 workers com configs: DOU:1, email-read:5, gesp-sync:3, etc.)
- Graceful shutdown (30s grace + 5s hard timeout)
- Testes unitários de cada middleware

### Fase 3: GESP Browser (2 semanas)
- Playwright Python async browser pool (3-15 browsers, Semaphore R5)
- GespSession com gerenciamento de certificado A1
- Navigator, FormFiller, DocumentExtractor, ScreenshotManager
- `sync.py` — syncEmpresa orchestrator (947 lines de lógica)
- `knowledge_base.py` — 50+ GESP processes do Manual v15.0
- `admin_gate.py` — approval workflow com TTL (critical:2h → low:72h)
- `visual_regression.py` — pixel comparison, SHA-256 hashing
- `xml_generator.py` — bulk import (Pessoa, Veículo, Aluno)
- `lock.py` — distributed lock via Redis
- `timeout_guard.py` — async timeout context manager
- Testes de integração com mock do GESP

### Fase 4: Cognitive Engine + IML (1.5 semanas)
- Pipeline cognitivo: engine.py, classifier.py (24 TipoDemanda), extractor.py, navigator.py, confidence.py
- `workflow_resolver.py` — 24 demand types → workflow definitions (1,098 lines de lógica de negócio)
- `few_shot_bank.py` — learning bank com R2 storage + quality scoring
- IML completo: event_graph (14 events, 10 entities, 8 relations), pattern_distiller, adaptive_playbook, reinforcement, feedback_loop
- `decorator.py` — @with_iml non-blocking wrapper com agent→rule mapping
- Pydantic models para todas as interfaces
- Testes unitários com mock de LLM

### Fase 5: Agentes Agno (2 semanas)
- `base.py` + `models.py` + `tracing.py` (Langfuse integration)
- Captador (DOU Sonnet + email Haiku→Sonnet classification) + `cognitive_integration.py`
- Operacional (GESP sync, billing R3, compliance engine, critical ops → human approval)
- Comunicador (batch R13, alerts, ofício R12, DELESP lookup, templates A-O / OF-A a OF-E)
- Orquestrador (Agno Workflow — ciclos FULL/LIGHT/URGENT, session_state PostgreSQL)
- `team.py` — Agno Team para coordenação multi-agent
- Prospect: scorer, temperature, layers, reply_handler, service
- Testes com dependency injection (mock providers)

### Fase 6: Services (1 semana)
- `dou_scraper.py` — DOU scraping (in.gov.br, 3 seções, keywords, alvará extraction)
- `dou_prospector.py` — DOU-specific prospector
- `dou_alerts.py` — Template H alert sending
- `cnpj_enrichment.py` — BrasilAPI (3 req/s rate limit)
- `procuracao.py` — electronic procuration workflow (7-day deadline)
- `company.py` + `employee.py` — CRUD com validação
- `fleet.py` — GPS tracking, manutenção
- `email/`: reader.py (Gmail), parser.py, sender.py (Resend 5 req/s), templates.py
- Testes unitários de cada service

### Fase 7: API Migration (1 semana)
- FastAPI routers para todas as rotas do Next.js API
- AgentOS: endpoints SSE para interação com agentes
- Proxy temporário: Next.js → FastAPI para migração gradual
- Rate limiting, CSRF
- Testes de integração API

### Fase 8: Integração + Deploy (1 semana)
- Next.js frontend aponta para FastAPI
- Deploy: Gunicorn + Uvicorn workers (multi-core)
- Langfuse configurado (tracing unificado, OpenTelemetry)
- Load testing com locust
- Runbook de operação
- Remover rotas API do Next.js

**Total estimado: 10 semanas** (vs 8 original — inclui GESP completo + Services que estavam ausentes)

---

## Limites de Escala Pós-Migração

| Métrica | TypeScript (atual) | Python (após migração) |
|---|---|---|
| Empresas simultâneas | 40-80 | **500-2.000** |
| GESP browser sessions | 3 fixas (single process) | **3-15** (pool distribuído, múltiplos workers) |
| Workers concorrentes | 1 processo Node.js | **N processos Taskiq** (horizontal) |
| Throughput de filas | BullMQ single-thread | **Taskiq Redis Streams** (10x RQ) |
| Latência de agente | ~10s (overhead BullMQ) | **~2-5s** (Taskiq + Agno ~2μs instantiation) |
| CPU utilization | Single-thread Node.js | **Multi-core** (Uvicorn + Gunicorn) |
| Memory per worker | ~200MB (V8 heap) | **~80MB** (Python process) |

O gargalo deixa de ser o runtime e passa a ser apenas o número de certificados A1 e as sessões GESP do governo. Com múltiplos servidores rodando pools de browser independentes, o sistema escala linearmente.

---

## Dependências Python (pyproject.toml)

```toml
[project]
name = "vigipro"
version = "2.0.0"
requires-python = ">=3.12"

dependencies = [
    # Framework
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "gunicorn>=23.0.0",

    # AI Agents (hibrido)
    "agno>=2.5.0",                  # Framework principal: Agents, Teams, Workflows, AgentOS, Memory
    "anthropic>=0.45.0",

    # Data Validation
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",

    # Database
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30.0",           # PostgreSQL async driver
    "supabase>=2.12.0",          # Supabase client (auth, storage)

    # Task Queue
    "taskiq>=0.11.0",
    "taskiq-redis>=1.2.0",

    # Browser Automation
    "playwright>=1.49.0",

    # Email
    "resend>=2.7.0",

    # HTTP
    "httpx>=0.28.0",

    # Observability
    "langfuse>=2.50.0",             # Tracing unificado via OpenTelemetry

    # Utilities
    "python-jose[cryptography]>=3.3.0",  # JWT
    "redis>=5.2.0",
    "orjson>=3.10.0",                     # Fast JSON
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.25.0",
    "pytest-cov>=6.0.0",
    "ruff>=0.9.0",              # Linting + formatting
    "mypy>=1.14.0",             # Type checking
    "locust>=2.32.0",           # Load testing
]
```

---

## Checklist de Qualidade (Fazer Certo Desde o Início)

- [ ] **Type hints em 100% do código** — mypy strict mode desde dia 1
- [ ] **Pydantic models para todo I/O** — nenhum dict genérico
- [ ] **Repository pattern** — nenhum SQL direto nos agentes/API
- [ ] **Dependency injection** — testável, mockável, sem singletons globais
- [ ] **Structured logging** — JSON logs com correlation IDs
- [ ] **Ruff** — linting + formatting unificado (substitui black + isort + flake8)
- [ ] **pytest-asyncio** — testes async desde o início
- [ ] **Coverage >80%** — threshold no CI
- [ ] **Docker-first** — docker-compose.yml para dev, Dockerfile otimizado para prod
- [ ] **Alembic** — migrations versionadas (se necessário além do Supabase)
- [ ] **Pre-commit hooks** — ruff + mypy antes de cada commit
- [ ] **OpenTelemetry** — tracing de cada request, cada agent run, cada task
