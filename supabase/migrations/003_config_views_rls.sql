-- =============================================================================
-- VIGI SQL 03 — CONFIG, VEÍCULOS, VIEWS, ÍNDICES, RLS
-- system_events, settings, parser_keywords,
-- vehicles, vehicle_telemetry, vehicle_maintenance,
-- 4 views analíticas, RLS policies
-- =============================================================================

-- =============================================================================
-- SYSTEM_EVENTS
-- Eventos do sistema (ciclos, erros, indisponibilidades GESP)
-- =============================================================================
CREATE TABLE system_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo        TEXT NOT NULL,
  severidade  TEXT NOT NULL DEFAULT 'info'
              CHECK (severidade IN ('info', 'warning', 'error', 'critical')),
  mensagem    TEXT NOT NULL,
  detalhes    JSONB DEFAULT '{}',
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_events_tipo ON system_events(tipo);
CREATE INDEX idx_system_events_severidade ON system_events(severidade);
CREATE INDEX idx_system_events_created ON system_events(created_at DESC);

-- =============================================================================
-- SETTINGS
-- Configurações globais do sistema (editáveis pelo admin)
-- =============================================================================
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Settings iniciais
INSERT INTO settings (key, value, description) VALUES
  ('ciclo_horarios', '["06:00","10:00","14:00","18:00","22:00"]',
   'Horários dos ciclos automáticos (seg a sáb)'),
  ('ciclo_domingo_horarios', '["09:00","14:00"]',
   'Horários do ciclo dominical leve (apenas DOU + emails)'),
  ('gesp_max_browsers', '3',
   'Máximo de browsers Firefox simultâneos no servidor (Regra R5)'),
  ('gesp_delay_min_ms', '1500',
   'Delay mínimo entre ações no GESP (ms)'),
  ('gesp_delay_max_ms', '4000',
   'Delay máximo entre ações no GESP (ms)'),
  ('gesp_timeout_empresa_ms', '600000',
   'Timeout por empresa no GESP — 10 minutos'),
  ('gesp_lote_maximo', '999',
   'Máximo de vigilantes por submissão GESP (Regra R4)'),
  ('parser_threshold', '0.60',
   'Score mínimo do parser IA para classificar automaticamente'),
  ('parser_model_classificacao', '"claude-haiku-4-5-20251001"',
   'Modelo Claude para classificação de emails (rápido/barato)'),
  ('parser_model_extracao', '"claude-sonnet-4-6"',
   'Modelo Claude para extração de dados complexos'),
  ('alerta_dias', '[90, 60, 30, 15, 5, 0]',
   'Dias antes do vencimento para enviar alertas'),
  ('email_vigi_operacoes', '"operacoes@vigi.com.br"',
   'Email principal para recebimento de demandas'),
  ('email_vigi_equipe', '"equipe@vigi.com.br"',
   'Email da equipe para casos desconhecidos (Template E)'),
  ('email_vigi_suporte', '"suporte@vigi.com.br"',
   'Email de suporte'),
  ('email_vigi_urgencias', '"urgencias@vigi.com.br"',
   'Email para urgências'),
  ('billing_trial_dias', '30',
   'Duração do período trial em dias'),
  ('billing_inadimplente_dias', '5',
   'Dias após vencimento para marcar inadimplente'),
  ('billing_suspenso_dias', '15',
   'Dias após vencimento para suspender operações'),
  ('billing_cancelado_dias', '30',
   'Dias após vencimento para cancelar'),
  ('cor_navy', '"#0B1F3A"',
   'Cor primária navy VIGI'),
  ('cor_gold', '"#C8A75D"',
   'Cor secundária gold VIGI');

-- =============================================================================
-- PARSER_KEYWORDS
-- PRD Seção 3.3 — Expansível sem deploy
-- =============================================================================
CREATE TABLE parser_keywords (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_demanda    TEXT NOT NULL,
  keywords        TEXT[] NOT NULL,
  acao_automatica TEXT NOT NULL,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO parser_keywords (tipo_demanda, keywords, acao_automatica) VALUES
  ('urgente',              ARRAY['URGENTE', 'PRAZO HOJE', 'AUTUAÇÃO', 'IMEDIATO', 'URGÊNCIA'], 'ciclo_imediato'),
  ('novo_vigilante',       ARRAY['ADMISSÃO', 'NOVO VIGILANTE', 'CONTRATAR', 'ADMITIR'],        'criar_employee_gesp'),
  ('renovacao_cnv',        ARRAY['CNV', 'RENOVAR CNV', 'HABILITAÇÃO', 'CARTEIRA'],             'processo_cnv_dou'),
  ('reciclagem',           ARRAY['RECICLAGEM', 'CURSO DE RECICLAGEM', 'RECICLAGEM CURSO'],     'agenda_reciclagem'),
  ('novo_posto',           ARRAY['NOVO POSTO', 'ABERTURA DE POSTO', 'ABRIR POSTO'],            'gesp_oficio_ofa'),
  ('encerramento_posto',   ARRAY['ENCERRAMENTO', 'FECHAR POSTO', 'ENCERRAR POSTO'],            'gesp_oficio_ofe'),
  ('transferencia_posto',  ARRAY['TRANSFERIR', 'REALOCAÇÃO', 'MUDAR POSTO', 'TRANSFERÊNCIA'],  'gesp_atualiza'),
  ('compra_arma',          ARRAY['COMPRA DE ARMA', 'AQUISIÇÃO ARMA', 'COMPRAR ARMA'],          'banco_oficio_ofb'),
  ('venda_arma',           ARRAY['VENDA DE ARMA', 'ALIENAÇÃO', 'VENDER ARMA'],                 'banco_oficio_ofb'),
  ('transporte_equipamento', ARRAY['TRANSPORTE', 'REMESSA', 'ENVIO ARMA', 'ENVIO EQUIPAMENTO'],'oficio_ofc'),
  ('compra_colete',        ARRAY['COMPRAR COLETE', 'AQUISIÇÃO COLETE', 'COLETE NOVO'],         'banco_registra'),
  ('baixa_colete',         ARRAY['BAIXA COLETE', 'COLETE VENCIDO', 'COLETE EXPIRADO'],         'banco_oficio_delesp'),
  ('renovacao_alvara',     ARRAY['ALVARÁ', 'RENOVAR ALVARÁ', 'ALVARA VENCENDO'],               'protocolo_pf'),
  ('correcao_dados',       ARRAY['CORRIGIR NOME', 'RETIFICAÇÃO', 'CORRIGIR DADOS', 'ERRO CADASTRO'], 'gesp_prints'),
  ('manutencao_veiculo',   ARRAY['MANUTENÇÃO', 'TROCA ÓLEO', 'PNEU', 'REVISÃO VEÍCULO'],      'registra_agenda');

-- =============================================================================
-- VEHICLES (Frota)
-- PRD Seção 3.5 — Gestão de Frota
-- =============================================================================
CREATE TABLE vehicles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  placa                 TEXT NOT NULL,
  modelo                TEXT NOT NULL,
  marca                 TEXT,
  ano                   INTEGER,
  cor                   TEXT,
  tipo                  TEXT NOT NULL DEFAULT 'operacional'
                        CHECK (tipo IN ('operacional', 'escolta', 'transporte_valores', 'administrativo')),
  chassi                TEXT,
  renavam               TEXT,
  km_atual              NUMERIC(10,1) NOT NULL DEFAULT 0,
  -- GPS
  gps_provider          TEXT,
  gps_device_id         TEXT,
  gps_ultimo_lat        NUMERIC(10,7),
  gps_ultimo_lng        NUMERIC(10,7),
  gps_ultima_leitura    TIMESTAMPTZ,
  -- Validades
  licenciamento_validade DATE,
  seguro_validade        DATE,
  seguro_apolice         TEXT,
  vistoria_pf_validade   DATE,           -- Obrigatória para escolta (PRD)
  -- Manutenção
  ultima_troca_oleo_km   NUMERIC(10,1),
  ultima_troca_pneu_km   NUMERIC(10,1),
  ultima_pastilha_km     NUMERIC(10,1),
  ultima_correia_km      NUMERIC(10,1),
  ultima_revisao_km      NUMERIC(10,1),
  data_bateria           DATE,
  -- Alertas (Regra R9)
  alertas_ativos        JSONB NOT NULL DEFAULT '{
    "licenciamento_validade": true,
    "seguro_validade": true,
    "vistoria_pf_validade": true,
    "troca_oleo": true,
    "troca_pneu": true,
    "pastilha_freio": true,
    "correia_dentada": true,
    "bateria": true,
    "revisao_geral": true
  }',
  -- Status
  status                TEXT NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo', 'inativo', 'manutencao')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(company_id, placa)
);

CREATE INDEX idx_vehicles_company ON vehicles(company_id);
CREATE INDEX idx_vehicles_placa ON vehicles(placa);
CREATE INDEX idx_vehicles_status ON vehicles(status);

CREATE TRIGGER trg_vehicles_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- VEHICLE_TELEMETRY
-- Dados GPS recebidos dos rastreadores
-- =============================================================================
CREATE TABLE vehicle_telemetry (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id  UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  latitude    NUMERIC(10,7) NOT NULL,
  longitude   NUMERIC(10,7) NOT NULL,
  velocidade  NUMERIC(5,1),
  ignicao     BOOLEAN,
  odometro    NUMERIC(10,1),
  provider    TEXT,
  raw_data    JSONB,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_vehicle ON vehicle_telemetry(vehicle_id);
CREATE INDEX idx_telemetry_recorded ON vehicle_telemetry(recorded_at DESC);

-- Particionamento por mês recomendado em produção para volume alto
-- Por enquanto, index composto é suficiente
CREATE INDEX idx_telemetry_vehicle_recorded ON vehicle_telemetry(vehicle_id, recorded_at DESC);

-- =============================================================================
-- VEHICLE_MAINTENANCE
-- PRD Seção 3.5 — Histórico de manutenções com valores e NF
-- =============================================================================
CREATE TABLE vehicle_maintenance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL,           -- troca_oleo, troca_pneu, pastilha, etc.
  descricao       TEXT,
  km_na_manutencao NUMERIC(10,1),
  valor           NUMERIC(10,2),
  nota_fiscal     TEXT,
  nf_r2_path      TEXT,
  oficina         TEXT,
  proxima_km      NUMERIC(10,1),          -- KM para próxima manutenção deste tipo
  proxima_data    DATE,                    -- Data para próxima (se aplicável)
  realizada_em    DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_vehicle ON vehicle_maintenance(vehicle_id);
CREATE INDEX idx_maintenance_company ON vehicle_maintenance(company_id);
CREATE INDEX idx_maintenance_tipo ON vehicle_maintenance(tipo);

-- =============================================================================
-- VIEWS ANALÍTICAS
-- PRD Seção 6.5 — 4 views
-- =============================================================================

-- VIEW 1: vw_processos_ativos
-- PRD Seção 8: /processos com semáforo e filtros
CREATE OR REPLACE VIEW vw_processos_ativos AS
SELECT
  w.id,
  w.company_id,
  c.razao_social,
  c.nome_fantasia,
  w.tipo_demanda,
  w.prioridade,
  w.status,
  w.dados_extraidos,
  w.created_at,
  w.updated_at,
  EXTRACT(EPOCH FROM (now() - w.created_at)) / 86400 AS dias_aberto,
  CASE
    WHEN w.prioridade = 'urgente' THEN 'vermelho'
    WHEN EXTRACT(EPOCH FROM (now() - w.created_at)) / 86400 > 3 THEN 'vermelho'
    WHEN EXTRACT(EPOCH FROM (now() - w.created_at)) / 86400 > 1 THEN 'amarelo'
    ELSE 'verde'
  END AS semaforo
FROM email_workflows w
JOIN companies c ON c.id = w.company_id
WHERE w.status NOT IN ('concluido', 'caso_desconhecido')
ORDER BY
  CASE w.prioridade WHEN 'urgente' THEN 0 ELSE 1 END,
  w.created_at ASC;

-- VIEW 2: vw_validades_criticas
-- PRD Seção 3.7 — Motor de Validades e Compliance
CREATE OR REPLACE VIEW vw_validades_criticas AS
-- CNV dos vigilantes
SELECT
  'cnv' AS tipo,
  e.id AS entidade_id,
  e.nome_completo AS entidade_nome,
  e.company_id,
  c.razao_social,
  e.cnv_data_validade AS data_validade,
  (e.cnv_data_validade - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (e.cnv_data_validade - CURRENT_DATE) <= 5 THEN 'critico'
    WHEN (e.cnv_data_validade - CURRENT_DATE) <= 15 THEN 'urgente'
    WHEN (e.cnv_data_validade - CURRENT_DATE) <= 30 THEN 'urgente'
    WHEN (e.cnv_data_validade - CURRENT_DATE) <= 60 THEN 'atencao'
    WHEN (e.cnv_data_validade - CURRENT_DATE) <= 90 THEN 'informativo'
    ELSE 'ok'
  END AS severidade
FROM employees e
JOIN companies c ON c.id = e.company_id
WHERE e.status = 'ativo'
  AND e.cnv_data_validade IS NOT NULL
  AND (e.cnv_data_validade - CURRENT_DATE) <= 90

UNION ALL

-- Alvará das empresas
SELECT
  'alvara' AS tipo,
  c.id AS entidade_id,
  c.razao_social AS entidade_nome,
  c.id AS company_id,
  c.razao_social,
  c.alvara_validade AS data_validade,
  (c.alvara_validade - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (c.alvara_validade - CURRENT_DATE) <= 5 THEN 'critico'
    WHEN (c.alvara_validade - CURRENT_DATE) <= 15 THEN 'urgente'
    WHEN (c.alvara_validade - CURRENT_DATE) <= 30 THEN 'urgente'
    WHEN (c.alvara_validade - CURRENT_DATE) <= 60 THEN 'atencao'
    WHEN (c.alvara_validade - CURRENT_DATE) <= 90 THEN 'informativo'
    ELSE 'ok'
  END AS severidade
FROM companies c
WHERE c.habilitada = true
  AND c.alvara_validade IS NOT NULL
  AND (c.alvara_validade - CURRENT_DATE) <= 90

UNION ALL

-- e-CPF A1 (CRÍTICO — sem ele, GESP não funciona)
SELECT
  'ecpf' AS tipo,
  c.id AS entidade_id,
  c.razao_social AS entidade_nome,
  c.id AS company_id,
  c.razao_social,
  c.ecpf_validade AS data_validade,
  (c.ecpf_validade - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (c.ecpf_validade - CURRENT_DATE) <= 5 THEN 'critico'
    WHEN (c.ecpf_validade - CURRENT_DATE) <= 15 THEN 'urgente'
    WHEN (c.ecpf_validade - CURRENT_DATE) <= 30 THEN 'urgente'
    WHEN (c.ecpf_validade - CURRENT_DATE) <= 60 THEN 'atencao'
    WHEN (c.ecpf_validade - CURRENT_DATE) <= 90 THEN 'informativo'
    ELSE 'ok'
  END AS severidade
FROM companies c
WHERE c.habilitada = true
  AND c.ecpf_validade IS NOT NULL
  AND (c.ecpf_validade - CURRENT_DATE) <= 90

UNION ALL

-- Reciclagem dos vigilantes
SELECT
  'reciclagem' AS tipo,
  e.id AS entidade_id,
  e.nome_completo AS entidade_nome,
  e.company_id,
  c.razao_social,
  e.reciclagem_data_validade AS data_validade,
  (e.reciclagem_data_validade - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (e.reciclagem_data_validade - CURRENT_DATE) <= 5 THEN 'critico'
    WHEN (e.reciclagem_data_validade - CURRENT_DATE) <= 15 THEN 'urgente'
    WHEN (e.reciclagem_data_validade - CURRENT_DATE) <= 30 THEN 'urgente'
    WHEN (e.reciclagem_data_validade - CURRENT_DATE) <= 60 THEN 'atencao'
    WHEN (e.reciclagem_data_validade - CURRENT_DATE) <= 90 THEN 'informativo'
    ELSE 'ok'
  END AS severidade
FROM employees e
JOIN companies c ON c.id = e.company_id
WHERE e.status = 'ativo'
  AND e.reciclagem_data_validade IS NOT NULL
  AND (e.reciclagem_data_validade - CURRENT_DATE) <= 90

UNION ALL

-- Porte de arma dos vigilantes
SELECT
  'porte_arma' AS tipo,
  e.id AS entidade_id,
  e.nome_completo AS entidade_nome,
  e.company_id,
  c.razao_social,
  e.porte_arma_validade AS data_validade,
  (e.porte_arma_validade - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (e.porte_arma_validade - CURRENT_DATE) <= 5 THEN 'critico'
    WHEN (e.porte_arma_validade - CURRENT_DATE) <= 15 THEN 'urgente'
    WHEN (e.porte_arma_validade - CURRENT_DATE) <= 30 THEN 'urgente'
    WHEN (e.porte_arma_validade - CURRENT_DATE) <= 60 THEN 'atencao'
    WHEN (e.porte_arma_validade - CURRENT_DATE) <= 90 THEN 'informativo'
    ELSE 'ok'
  END AS severidade
FROM employees e
JOIN companies c ON c.id = e.company_id
WHERE e.status = 'ativo'
  AND e.porte_arma_validade IS NOT NULL
  AND (e.porte_arma_validade - CURRENT_DATE) <= 90

UNION ALL

-- Coletes balísticos
SELECT
  'colete' AS tipo,
  v.id AS entidade_id,
  v.numero_serie AS entidade_nome,
  v.company_id,
  c.razao_social,
  v.data_validade AS data_validade,
  (v.data_validade - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (v.data_validade - CURRENT_DATE) <= 5 THEN 'critico'
    WHEN (v.data_validade - CURRENT_DATE) <= 15 THEN 'urgente'
    WHEN (v.data_validade - CURRENT_DATE) <= 30 THEN 'urgente'
    WHEN (v.data_validade - CURRENT_DATE) <= 60 THEN 'atencao'
    WHEN (v.data_validade - CURRENT_DATE) <= 90 THEN 'informativo'
    ELSE 'ok'
  END AS severidade
FROM vests v
JOIN companies c ON c.id = v.company_id
WHERE v.status = 'ativo'
  AND (v.data_validade - CURRENT_DATE) <= 90

UNION ALL

-- Licenciamento de veículos
SELECT
  'licenciamento' AS tipo,
  vh.id AS entidade_id,
  vh.placa AS entidade_nome,
  vh.company_id,
  c.razao_social,
  vh.licenciamento_validade AS data_validade,
  (vh.licenciamento_validade - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (vh.licenciamento_validade - CURRENT_DATE) <= 15 THEN 'critico'
    WHEN (vh.licenciamento_validade - CURRENT_DATE) <= 30 THEN 'urgente'
    WHEN (vh.licenciamento_validade - CURRENT_DATE) <= 60 THEN 'atencao'
    ELSE 'informativo'
  END AS severidade
FROM vehicles vh
JOIN companies c ON c.id = vh.company_id
WHERE vh.status = 'ativo'
  AND vh.licenciamento_validade IS NOT NULL
  AND (vh.licenciamento_validade - CURRENT_DATE) <= 60

UNION ALL

-- Seguro de veículos
SELECT
  'seguro_veiculo' AS tipo,
  vh.id AS entidade_id,
  vh.placa AS entidade_nome,
  vh.company_id,
  c.razao_social,
  vh.seguro_validade AS data_validade,
  (vh.seguro_validade - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (vh.seguro_validade - CURRENT_DATE) <= 15 THEN 'critico'
    WHEN (vh.seguro_validade - CURRENT_DATE) <= 30 THEN 'urgente'
    WHEN (vh.seguro_validade - CURRENT_DATE) <= 60 THEN 'atencao'
    ELSE 'informativo'
  END AS severidade
FROM vehicles vh
JOIN companies c ON c.id = vh.company_id
WHERE vh.status = 'ativo'
  AND vh.seguro_validade IS NOT NULL
  AND (vh.seguro_validade - CURRENT_DATE) <= 60

UNION ALL

-- Vistoria PF de veículos de escolta
SELECT
  'vistoria_pf' AS tipo,
  vh.id AS entidade_id,
  vh.placa AS entidade_nome,
  vh.company_id,
  c.razao_social,
  vh.vistoria_pf_validade AS data_validade,
  (vh.vistoria_pf_validade - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (vh.vistoria_pf_validade - CURRENT_DATE) <= 15 THEN 'critico'
    WHEN (vh.vistoria_pf_validade - CURRENT_DATE) <= 30 THEN 'urgente'
    WHEN (vh.vistoria_pf_validade - CURRENT_DATE) <= 60 THEN 'atencao'
    ELSE 'informativo'
  END AS severidade
FROM vehicles vh
JOIN companies c ON c.id = vh.company_id
WHERE vh.status = 'ativo'
  AND vh.tipo = 'escolta'
  AND vh.vistoria_pf_validade IS NOT NULL
  AND (vh.vistoria_pf_validade - CURRENT_DATE) <= 60

ORDER BY dias_restantes ASC;

-- VIEW 3: vw_dashboard_kpis
-- PRD Seção 8 — Dashboard com KPIs
CREATE OR REPLACE VIEW vw_dashboard_kpis AS
SELECT
  (SELECT COUNT(*) FROM companies WHERE habilitada = true AND billing_status = 'ativo')
    AS total_empresas_ativas,
  (SELECT COUNT(*) FROM employees WHERE status = 'ativo')
    AS total_vigilantes_ativos,
  (SELECT COUNT(*) FROM email_workflows WHERE status NOT IN ('concluido', 'caso_desconhecido'))
    AS workflows_abertos,
  (SELECT COUNT(*) FROM email_workflows WHERE prioridade = 'urgente' AND status NOT IN ('concluido', 'caso_desconhecido'))
    AS workflows_urgentes,
  (SELECT COUNT(*) FROM vw_validades_criticas WHERE severidade IN ('critico', 'urgente'))
    AS validades_criticas,
  (SELECT COUNT(*) FROM gesp_tasks WHERE status IN ('pendente', 'retry'))
    AS gesp_tasks_pendentes,
  (SELECT COUNT(*) FROM email_outbound WHERE sent_at >= CURRENT_DATE)
    AS emails_enviados_hoje,
  (SELECT COUNT(*) FROM vehicles WHERE status = 'ativo')
    AS total_veiculos_ativos,
  (SELECT COUNT(*) FROM discrepancies WHERE status = 'aberta')
    AS divergencias_abertas;

-- VIEW 4: vw_billing_resumo
-- Resumo de billing por empresa (para Template D e financeiro)
CREATE OR REPLACE VIEW vw_billing_resumo AS
SELECT
  c.id AS company_id,
  c.razao_social,
  c.plano,
  c.valor_mensal,
  c.billing_status,
  c.data_proxima_cobranca,
  (SELECT COUNT(*) FROM employees e WHERE e.company_id = c.id AND e.status = 'ativo')
    AS vigilantes_ativos,
  (SELECT COUNT(*) FROM email_workflows w WHERE w.company_id = c.id AND w.status = 'concluido'
    AND w.updated_at >= date_trunc('month', CURRENT_DATE))
    AS workflows_concluidos_mes,
  (SELECT COUNT(*) FROM gesp_tasks g WHERE g.company_id = c.id AND g.status = 'concluido'
    AND g.completed_at >= date_trunc('month', CURRENT_DATE))
    AS acoes_gesp_mes,
  (SELECT COUNT(*) FROM email_outbound eo WHERE eo.company_id = c.id AND eo.status = 'enviado'
    AND eo.sent_at >= date_trunc('month', CURRENT_DATE))
    AS emails_enviados_mes,
  (SELECT COUNT(*) FROM discrepancies d WHERE d.company_id = c.id AND d.status = 'resolvida'
    AND d.resolved_at >= date_trunc('month', CURRENT_DATE))
    AS divergencias_resolvidas_mes
FROM companies c
WHERE c.habilitada = true
ORDER BY c.razao_social;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- PRD Seção 7 — Isolamento de dados por empresa
-- =============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE weapons ENABLE ROW LEVEL SECURITY;
ALTER TABLE vests ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_inbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbound ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE gesp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gesp_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE gesp_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pf_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Nota: O backend usa service_role que bypassa RLS.
-- Estas policies protegem contra acesso direto via anon_key.
-- Em produção, a anon_key NÃO deve ter acesso a nenhuma tabela.

-- Policy: Bloquear acesso via anon_key (padrão seguro)
-- O backend sempre usa service_role, então RLS serve como
-- camada de proteção contra vazamento da anon_key.

CREATE POLICY "Deny all for anon" ON users FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON companies FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON employees FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON job_posts FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON weapons FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON vests FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON email_inbound FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON email_outbound FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON email_workflows FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON gesp_sessions FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON gesp_tasks FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON gesp_snapshots FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON discrepancies FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON pf_requests FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON vehicles FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON vehicle_telemetry FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON vehicle_maintenance FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON billing_history FOR ALL TO anon USING (false);
CREATE POLICY "Deny all for anon" ON audit_log FOR ALL TO anon USING (false);

-- Tabelas públicas (leitura) — sem dados sensíveis
CREATE POLICY "Public read" ON delesp_contacts FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON gesp_holidays FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON settings FOR SELECT TO anon USING (true);
CREATE POLICY "Public read" ON parser_keywords FOR SELECT TO anon USING (true);

-- =============================================================================
-- ÍNDICES COMPOSTOS PARA QUERIES FREQUENTES
-- =============================================================================

-- Dashboard: workflows urgentes abertos
CREATE INDEX idx_workflows_urgentes_abertos
  ON email_workflows(prioridade, status)
  WHERE prioridade = 'urgente' AND status NOT IN ('concluido', 'caso_desconhecido');

-- Compliance: validades próximas de vencer
CREATE INDEX idx_employees_cnv_ativo
  ON employees(cnv_data_validade)
  WHERE status = 'ativo' AND cnv_data_validade IS NOT NULL;

-- GESP: tasks pendentes por empresa
CREATE INDEX idx_gesp_tasks_pendentes
  ON gesp_tasks(company_id, status)
  WHERE status IN ('pendente', 'retry');

-- Billing: empresas com cobrança próxima
CREATE INDEX idx_companies_cobranca
  ON companies(data_proxima_cobranca)
  WHERE habilitada = true AND billing_status = 'ativo';

-- Email: outbound pendentes para envio
CREATE INDEX idx_email_outbound_pendentes
  ON email_outbound(status)
  WHERE status = 'pendente';
