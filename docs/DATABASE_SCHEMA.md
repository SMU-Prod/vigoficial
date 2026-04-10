# VigiPRO Database Schema

Complete documentation of the PostgreSQL 15+ schema managed by Supabase.

## Core Tables

### users
- `id` (UUID) - Primary key
- `email` (TEXT, UNIQUE) - Email address
- `password_hash` (TEXT) - Bcrypt hash
- `nome` (TEXT) - Full name
- `role` (TEXT) - admin | operador | viewer
- `company_ids` (UUID[]) - Companies accessible to user
- `deve_trocar_senha` (BOOLEAN) - Force password change on next login
- `tentativas_falhas` (INTEGER) - Failed login attempts
- `bloqueado_ate` (TIMESTAMPTZ) - Account lockout deadline
- `mfa_enabled` (BOOLEAN) - Two-factor authentication enabled
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes**: email (UNIQUE), role

---

### companies
Enterprise customer accounts. Core entity for multi-tenancy.

- `id` (UUID) - Primary key
- `cnpj` (TEXT, UNIQUE) - Tax ID
- `razao_social` (TEXT) - Legal company name
- `nome_fantasia` (TEXT) - Trade name
- `alvara_numero` (TEXT) - Security license number
- `alvara_validade` (DATE) - Security license expiration
- `plano` (TEXT) - starter | professional | enterprise | custom
- `valor_mensal` (NUMERIC) - Monthly billing amount
- `billing_status` (TEXT) - trial | ativo | inadimplente | suspenso | cancelado
- `data_proxima_cobranca` (DATE) - Next billing date
- `habilitada` (BOOLEAN) - Account active / operational gate
- `email_operacional` (TEXT) - Operational email
- `email_responsavel` (TEXT) - Responsible contact email
- `telefone` (TEXT)
- `uf_sede` (CHAR(2)) - State code
- `ecpf_r2_path` (TEXT) - Digital certificate location (R2)
- `ecpf_senha_encrypted` (TEXT) - Encrypted certificate password
- `ecpf_validade` (DATE) - Certificate expiration
- `alertas_ativos` (JSONB) - Enabled alert types (R9)
- `asaas_customer_id` (TEXT) - Asaas billing customer ID
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes**: billing_status, habilitada, cnpj
**RLS**: Users can only see companies in their `company_ids` array

---

### employees (Vigilantes)
Security guards employed by companies.

- `id` (UUID)
- `company_id` (UUID, FK)
- `cpf` (TEXT, UNIQUE)
- `nome` (TEXT)
- `data_nasc` (DATE)
- `sexo` (CHAR(1))
- `status` (TEXT) - ativo | inativo | afastado | demitido
- `funcao` (TEXT) - Guard position/role (from FUNCOES_PF constant)
- `cnv_numero` (TEXT) - Guard card number
- `cnv_data_emissao` (DATE)
- `cnv_data_validade` (DATE)
- `reciclagem_data_proxima` (DATE) - Next training deadline
- `posto_designado` (UUID, FK to job_posts) - Current assignment
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes**: company_id, cpf, status, cnv_data_validade

---

### job_posts (Postos de Serviço)
Guard posts / duty locations.

- `id` (UUID)
- `company_id` (UUID, FK)
- `nome` (TEXT) - Post name/location
- `endereco` (TEXT)
- `cidade` (TEXT)
- `uf` (CHAR(2))
- `cep` (TEXT)
- `status` (TEXT) - ativo | encerrado | pendente
- `data_abertura` (DATE)
- `data_encerramento` (DATE)
- `gesp_protocolo` (TEXT) - GESP submission reference
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes**: company_id, uf

---

### weapons & vests
Guard equipment inventory and validity tracking.

**weapons**: firearms registered with Federal Police
- `id`, `company_id`, `numero_serie`, `tipo`, `calibre`, `data_aquisicao`, `status` (ativo | alienado | perda)

**vests**: Ballistic protection equipment
- `id`, `company_id`, `num_serie`, `marca`, `data_validade`, `status` (valido | vencido)

---

## Email & Communication

### email_inbound
Incoming emails (Rule R2: saved BEFORE processing).

- `id`, `company_id` (FK)
- `gmail_message_id` (TEXT, UNIQUE)
- `from_email`, `to_email`, `subject`, `body_text`, `body_html`
- `attachments` (JSONB) - [{filename, mime, r2_path, size}]
- `received_at` (TIMESTAMPTZ)
- `status` (TEXT) - recebido | processado | erro
- `parser_resultado` (JSONB) - IA classification output
- `tipo_demanda` (TEXT) - Classification category
- `confidence_score` (NUMERIC) - 0.00 to 1.00
- `workflow_id` (UUID, FK) - Links to email_workflows
- `created_at` (TIMESTAMPTZ)

**Indexes**: company_id, status, received_at, tipo_demanda

---

### email_outbound
Outgoing emails (Rule R11: CLIENTE_HTML vs OFICIO_PF separation).

- `id`, `company_id` (FK)
- `template_id` (TEXT) - A-O (templates) or OF-A to OF-E (official documents)
- `mode` (TEXT) - CLIENTE_HTML | OFICIO_PF
- `from_email`, `to_email`, `cc_email`, `subject`
- `body_html`, `body_text`
- `attachments` (JSONB)
- `resend_id` (TEXT) - Resend API message ID
- `status` (TEXT) - pendente | enviado | erro
- `erro_detalhe` (TEXT)
- `workflow_id`, `gesp_task_id` (UUIDs, FKs)
- `created_at`, `sent_at` (TIMESTAMPTZ)

**Indexes**: company_id, template_id, status, sent_at

---

### email_threads
Email conversation threading system.

- `id`, `company_id` (FK)
- `subject` (TEXT)
- `cnpj_detectado` (TEXT)
- `status` (TEXT) - PENDENTE | EM_ANDAMENTO | FINALIZADO
- `tipo_demanda` (TEXT)
- `last_message_id`, `message_ids` (TEXT[])
- `created_at`, `updated_at`, `finalizado_at` (TIMESTAMPTZ)
- `finalizado_por` (UUID, FK to users)

**Indexes**: company_id, status, cnpj_detectado, created_at

---

### thread_participants
Participants in email threads.

- `id`, `thread_id` (FK), `user_id` (FK)
- `email` (TEXT)
- `tipo` (TEXT) - interno_admin | interno_operador | externo_cnpj | externo_outro
- `motivo_entrada` (TEXT) - responsavel_empresa | interveio | cliente_copiou | admin_manual
- `entrou_em` (TIMESTAMPTZ)
- `ativo` (BOOLEAN)
- UNIQUE(thread_id, email)

---

### email_workflows (Rule R8: Confirmation required after each action)
Workflow orchestration triggered by email classification.

- `id`, `company_id` (FK), `email_inbound_id` (FK)
- `tipo_demanda` (TEXT)
- `prioridade` (TEXT) - normal | urgente (Rule R10: immediate cycle if urgent)
- `status` (TEXT) - recebido | classificado | aguardando_aprovacao | aprovado | executando | concluido | erro | caso_desconhecido
- `dados_extraidos` (JSONB) - Parsed data
- `aprovado_por` (UUID, FK to users), `aprovado_em` (TIMESTAMPTZ)
- `gesp_task_ids`, `email_outbound_ids` (UUID[]) - Execution tracking
- `erro_detalhe` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes**: company_id, status, prioridade, tipo_demanda, created_at

---

## GESP Integration (Federal Police Portal)

### gesp_sessions (Rule R5: Max 3 sessions simultaneously on server)
Browser automation sessions.

- `id`, `company_id` (FK)
- `browser_pid` (INTEGER) - Firefox process ID
- `status` (TEXT) - ativo | finalizado | erro
- `started_at`, `finished_at` (TIMESTAMPTZ)
- `erro_detalhe` (TEXT)
- `acoes_executadas`, `prints_capturados` (INTEGER)
- `tempo_total_ms` (INTEGER)

---

### gesp_tasks
Individual actions within GESP sessions (Rule R1: dual screenshots).

- `id`, `company_id` (FK), `session_id` (FK), `workflow_id` (FK)
- `tipo_acao` (TEXT) - Action type (ex: novo_vigilante, renovacao_cnv)
- `payload` (JSONB) - Action parameters
- `status` (TEXT) - pendente | executando | concluido | erro | retry
- `tentativas`, `max_tentativas` (INTEGER)
- `print_antes_r2`, `print_depois_r2`, `print_erro_r2` (TEXT) - R2 paths
- `protocolo_gesp` (TEXT) - GESP reference number
- `erro_detalhe` (TEXT)
- `created_at`, `executed_at`, `completed_at` (TIMESTAMPTZ)

**Indexes**: company_id, session_id, status, workflow_id

---

### gesp_snapshots
Company state snapshots from each GESP sync cycle.

- `id`, `company_id` (FK), `session_id` (FK)
- `snapshot_data` (JSONB) - Full state
- `vigilantes_count`, `postos_count`, `armas_count` (INTEGER)
- `created_at` (TIMESTAMPTZ)

---

### gesp_holidays
National holidays affecting GESP availability.

- `id`, `data` (DATE, UNIQUE)
- `descricao` (TEXT)

---

## Compliance & Billing

### billing_history (Rule R3: Billing gate blocks GESP if not active)
Billing cycle tracking.

- `id`, `company_id` (FK)
- `valor` (NUMERIC)
- `status` (TEXT) - pendente | pago | atrasado | cancelado
- `asaas_payment_id` (TEXT)
- `metodo_pagamento` (TEXT)
- `data_vencimento` (DATE)
- `data_pagamento` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

**Indexes**: company_id, status, data_vencimento

---

### compliance_alertas
Validity alerts for documents and equipment.

- `id`, `company_id` (FK), `entity_id` (UUID)
- `entity_type` (TEXT) - company | employee | vehicle | weapon | vest
- `tipo_alerta` (TEXT) - alvara | cnv | ecpf | reciclagem | licenciamento
- `severidade` (TEXT) - critico | urgente | acao | atencao | informativo
- `data_limite` (DATE)
- `data_alerta_enviado` (TIMESTAMPTZ)
- `status` (TEXT) - ativo | resolvido | ignorado

**Indexes**: company_id, entity_type, severidade, data_limite

---

## Fleet Management

### vehicles
Guard vehicle inventory.

- `id`, `company_id` (FK)
- `placa` (TEXT) - License plate
- `modelo`, `marca`, `ano`, `cor`
- `tipo` (TEXT) - operacional | escolta | transporte_valores | administrativo
- `chassi`, `renavam`
- `km_atual` (NUMERIC)
- `gps_provider`, `gps_device_id`
- `gps_ultimo_lat/lng`, `gps_ultima_leitura`
- `licenciamento_validade`, `seguro_validade`, `seguro_apolice`
- `vistoria_pf_validade` (DATE) - Required for escort vehicles
- Maintenance dates: `ultima_troca_oleo_km`, etc.
- `data_bateria` (DATE)
- `alertas_ativos` (JSONB)
- `created_at`, `updated_at` (TIMESTAMPTZ)

---

### vehicle_telemetry
GPS tracking history.

- `id`, `vehicle_id` (FK)
- `latitude`, `longitude` (NUMERIC)
- `velocidade` (NUMERIC), `direcao` (NUMERIC)
- `acuracia` (NUMERIC) - GPS accuracy
- `timestamp` (TIMESTAMPTZ)

**Indexes**: vehicle_id, timestamp

---

### vehicle_maintenance
Maintenance records.

- `id`, `vehicle_id` (FK)
- `tipo_manutencao` (TEXT)
- `data_manutencao` (DATE)
- `km_manutencao` (NUMERIC)
- `observacoes` (TEXT)

---

## DOU Integration

### dou_publicacoes
Diário Oficial da União (Federal Gazette) publications.

- `id`, `empresa_cnpj` (TEXT)
- `numero_publ` (TEXT)
- `secao` (CHAR(1))
- `data_publicacao` (DATE)
- `texto_inteiro` (TEXT)
- `tipo_ato` (TEXT) - renovacao_alvara | cancelamento | novo_posto
- `status` (TEXT) - novo | processado | ignorado
- `parser_resultado` (JSONB)
- `created_at` (TIMESTAMPTZ)

**Indexes**: empresa_cnpj, data_publicacao, status

---

### dou_alvaras
Security license publications extracted from DOU.

- `id`, `publicacao_id` (FK)
- `numero_alvara` (TEXT)
- `empresa_cnpj` (TEXT)
- `data_validade` (DATE)
- `status` (TEXT)

---

### dou_alertas
Alerts generated from DOU parsing.

- `id`, `publicacao_id` (FK), `company_id` (FK)
- `tipo_alerta` (TEXT) - vencimento_alvara | cancelamento | novo_requisito
- `severidade` (TEXT)
- `resolvido` (BOOLEAN)

---

## AI Agents & Observability

### agent_runs
Execution history of AI agents (captador, operacional, comunicador, orquestrador).

- `id`
- `agent_name` (TEXT) - captador | operacional | comunicador | orquestrador
- `trigger_type` (TEXT) - cron | webhook | manual | urgent | chain
- `trigger_source` (TEXT)
- `company_id` (FK)
- `status` (TEXT) - running | completed | failed | timeout | cancelled
- `input_data`, `output_data` (JSONB)
- `error_message` (TEXT)
- `started_at`, `completed_at` (TIMESTAMPTZ)
- `duration_ms` (INTEGER)
- `total_tokens_used`, `total_cost_usd` (NUMERIC)
- `cache_read_tokens`, `cache_write_tokens` (INTEGER)
- `steps_executed` (INTEGER)

**Indexes**: agent_name, status, company_id, started_at

---

### agent_decisions
Individual decisions made by agents (audit trail).

- `id`, `run_id` (FK), `agent_name`, `step_name`
- `decision_type` (TEXT) - classification | extraction | routing | action | escalation | approval
- `input_summary`, `output_summary` (TEXT)
- `confidence` (NUMERIC) - 0.000 to 1.000
- `model_used` (TEXT) - Claude model identifier
- `tokens_input`, `tokens_output`, `latency_ms` (INTEGER)
- `escalated_to_human` (BOOLEAN)
- `human_override` (TEXT)

**Indexes**: run_id, agent_name, escalated_to_human

---

### agent_metrics
Aggregated performance metrics (updated periodically).

- `id`
- `period_start`, `period_end` (TIMESTAMPTZ)
- `agent_name`
- `total_runs`, `successful_runs`, `failed_runs` (INTEGER)
- `avg_duration_ms`, `p95_duration_ms` (INTEGER)
- `total_tokens`, `total_cost_usd` (NUMERIC)
- `cache_hit_rate` (NUMERIC)
- `escalation_rate` (NUMERIC)
- `avg_confidence` (NUMERIC)
- `top_decision_types` (JSONB)

---

### system_health
Health status of system components.

- `id`
- `component` (TEXT) - worker-dou | agent-captador | redis | supabase
- `status` (TEXT) - healthy | degraded | unhealthy | offline
- `last_heartbeat` (TIMESTAMPTZ)
- `details` (JSONB)
- `error_count` (INTEGER)
- `uptime_seconds` (INTEGER)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**UNIQUE Index**: component

---

## Configuration & Audit

### audit_log (Rule R1: Complete audit trail)
All sensitive actions logged.

- `id`, `user_id` (FK)
- `acao` (TEXT) - Action performed
- `detalhes` (JSONB) - Structured details
- `ip` (TEXT) - Source IP
- `created_at` (TIMESTAMPTZ)

**Indexes**: user_id, acao, created_at DESC

---

### settings
Global system configuration (admin-editable).

- `key` (TEXT, PRIMARY KEY)
- `value` (JSONB)
- `description` (TEXT)
- `updated_at` (TIMESTAMPTZ)
- `updated_by` (UUID, FK to users)

**Examples**: ciclo_horarios, gesp_max_browsers, parser_threshold, billing_trial_dias

---

### delesp_contacts
27 Brazilian state DELESP + CGCSP National contacts.

- `id`, `uf` (CHAR(2), UNIQUE), `estado`, `email`, `telefone`
- `observacoes` (TEXT)
- `ativo` (BOOLEAN)
- `updated_at` (TIMESTAMPTZ)

---

### parser_keywords
Expandable keyword mapping (no deploy required).

- `id`
- `tipo_demanda` (TEXT) - Classification type
- `keywords` (TEXT[]) - Trigger keywords
- `acao_automatica` (TEXT) - Associated action
- `ativo` (BOOLEAN)
- `created_at` (TIMESTAMPTZ)

---

## Row-Level Security (RLS)

All tables with `company_id` are protected by RLS policies:
- Users can only SELECT/UPDATE/DELETE rows where `company_id` IN user's `company_ids`
- Admins can access all rows with role='admin'
- System tables (settings, delesp_contacts) accessible to all authenticated users

Key policies:
- `companies`: Users see only companies in their `company_ids`
- `email_inbound/outbound`: Scoped to company
- `employees`: Scoped to company
- `audit_log`: Readable by admins only

---

## Key Relationships

```
companies
  ├── employees (cnv_data_validade, reciclagem triggers compliance alerts)
  ├── job_posts (posts where employees are assigned)
  ├── vehicles (fleet with GPS telemetry)
  ├── email_inbound → email_workflows (classification & execution)
  ├── email_outbound (billing & compliance communications)
  ├── billing_history (Asaas payment tracking)
  ├── gesp_sessions → gesp_tasks (automation audit trail)
  ├── gesp_snapshots (state history)
  ├── agent_runs (IA execution logs)
  └── dou_publicacoes (gazette monitoring)

users
  ├── audit_log (all actions)
  ├── email_threads → thread_participants
  └── agent_runs (which agent performed action)

email_inbound
  ├── email_workflows (type classification)
  ├── knowledge_base (solution tracking)
  └── dou_publicacoes (if gazette-related)
```

---

## Performance Indexes Summary

Critical indexes for query performance:
- `companies(billing_status, habilitada)` - Billing gate (R3)
- `employees(company_id, cnv_data_validade)` - Validity alerts (R9)
- `email_inbound(company_id, status, received_at)` - Email processing pipeline
- `gesp_tasks(company_id, status, workflow_id)` - Workflow execution
- `audit_log(user_id, created_at DESC)` - Audit queries
- `agent_runs(agent_name, started_at DESC)` - Agent monitoring

---

## View Definitions

- `vw_agent_dashboard` - 24h/7d agent performance metrics
- `vw_compliance_alerts` - Active validity alerts across companies
- `vw_billing_status` - Current billing state (R3 gate)

Consult migration files for view queries.
