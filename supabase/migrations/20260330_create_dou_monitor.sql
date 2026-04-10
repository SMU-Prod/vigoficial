-- =============================================================================
-- VIGI — Monitoramento DOU (Diário Oficial da União)
-- Raspagem automática de alvarás, portarias e processos punitivos da PF
-- =============================================================================

-- 0. Extensão para busca textual
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Tabela principal: publicações do DOU
CREATE TABLE IF NOT EXISTS dou_publicacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identificação da publicação
  titulo TEXT NOT NULL,
  tipo_ato TEXT NOT NULL DEFAULT 'alvara', -- alvara, portaria, despacho, resolucao, instrucao_normativa
  numero_ato TEXT, -- ex: "1.305"
  data_ato DATE, -- data do ato (pode diferir da publicação)
  data_publicacao DATE NOT NULL, -- data que saiu no DOU
  secao INTEGER NOT NULL DEFAULT 1, -- 1, 2 ou 3
  edicao TEXT, -- ex: "59"
  pagina TEXT, -- ex: "313"

  -- Órgão emissor
  orgao_principal TEXT, -- "Ministério da Justiça e Segurança Pública"
  orgao_subordinado TEXT, -- "Polícia Federal"
  unidade TEXT, -- "Coordenação-Geral de Controle de Serviços e Produtos"

  -- Conteúdo
  texto_completo TEXT NOT NULL,
  resumo TEXT, -- resumo gerado automaticamente

  -- URLs
  url_publicacao TEXT, -- link direto no DOU
  url_pdf TEXT, -- link do PDF
  slug TEXT, -- slug da URL para deduplicação
  dou_id TEXT UNIQUE, -- ID numérico do DOU (ex: "696026534")

  -- Assinatura
  assinante TEXT,
  cargo_assinante TEXT,

  -- Controle
  processado BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de alvarás extraídos (cada alvará individual de cada publicação)
CREATE TABLE IF NOT EXISTS dou_alvaras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  publicacao_id UUID REFERENCES dou_publicacoes(id) ON DELETE CASCADE,

  -- Empresa
  razao_social TEXT NOT NULL,
  cnpj TEXT NOT NULL, -- formato XX.XXX.XXX/XXXX-XX
  cnpj_limpo TEXT NOT NULL, -- só números para busca
  uf TEXT, -- estado sede
  municipio TEXT,

  -- Detalhes do alvará
  tipo_alvara TEXT NOT NULL DEFAULT 'autorizacao',
  -- autorizacao, renovacao, cancelamento, revisao, transferencia
  subtipo TEXT,
  -- aquisicao_arma, aquisicao_municao, transporte_arma, funcionamento,
  -- revisao_alvara, autorizacao_compra, porte_arma, etc.

  -- Processo
  numero_processo TEXT, -- ex: "2026/16844"
  delegacia TEXT, -- ex: "DELESP/DREX/SR/PF/SP"

  -- Especificações da liberação
  itens_liberados JSONB DEFAULT '[]'::jsonb,
  -- Array de: { quantidade: 50, descricao: "Munições calibre 38", tipo: "municao" }

  validade_dias INTEGER, -- ex: 90
  data_validade DATE, -- calculada: data_publicacao + validade_dias

  -- Texto original desse alvará específico
  texto_original TEXT NOT NULL,

  -- Vínculo com empresa no VIGI (se existir)
  company_id UUID, -- FK para companies (preenchido se a empresa for cliente)
  prospect_id UUID, -- FK para prospects (preenchido se for prospect)

  -- Status de notificação
  notificado BOOLEAN DEFAULT false,
  data_notificacao TIMESTAMPTZ,
  canal_notificacao TEXT, -- email, whatsapp, sms

  -- Controle
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de alertas gerados
CREATE TABLE IF NOT EXISTS dou_alertas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alvara_id UUID REFERENCES dou_alvaras(id) ON DELETE CASCADE,
  publicacao_id UUID REFERENCES dou_publicacoes(id) ON DELETE CASCADE,

  -- Destinatário
  company_id UUID, -- empresa cadastrada no VIGI
  prospect_id UUID, -- prospect no CRM
  cnpj TEXT NOT NULL,
  razao_social TEXT,

  -- Alerta
  tipo_alerta TEXT NOT NULL DEFAULT 'novo_alvara',
  -- novo_alvara, renovacao, vencimento_proximo, processo_punitivo, cancelamento
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  prioridade TEXT DEFAULT 'normal', -- baixa, normal, alta, urgente

  -- Status de envio
  status TEXT DEFAULT 'pendente', -- pendente, enviado, falha, lido
  enviado_em TIMESTAMPTZ,
  lido_em TIMESTAMPTZ,
  canal TEXT, -- email, whatsapp, dashboard, sms

  -- Controle
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de execuções do scraper (log de cada rodada)
CREATE TABLE IF NOT EXISTS dou_scraper_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  data_alvo DATE NOT NULL, -- qual data do DOU foi raspada
  secao INTEGER NOT NULL DEFAULT 1,

  -- Resultado
  status TEXT DEFAULT 'running', -- running, success, error, partial
  publicacoes_encontradas INTEGER DEFAULT 0,
  alvaras_extraidos INTEGER DEFAULT 0,
  alertas_gerados INTEGER DEFAULT 0,
  empresas_vinculadas INTEGER DEFAULT 0,

  -- Erros
  erro TEXT,
  detalhes JSONB,

  -- Timing
  iniciado_em TIMESTAMPTZ DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  duracao_ms INTEGER
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_dou_pub_data ON dou_publicacoes(data_publicacao DESC);
CREATE INDEX IF NOT EXISTS idx_dou_pub_tipo ON dou_publicacoes(tipo_ato);
CREATE INDEX IF NOT EXISTS idx_dou_pub_secao ON dou_publicacoes(secao);
CREATE INDEX IF NOT EXISTS idx_dou_pub_dou_id ON dou_publicacoes(dou_id);
CREATE INDEX IF NOT EXISTS idx_dou_pub_slug ON dou_publicacoes(slug);

CREATE INDEX IF NOT EXISTS idx_dou_alv_cnpj ON dou_alvaras(cnpj_limpo);
CREATE INDEX IF NOT EXISTS idx_dou_alv_pub ON dou_alvaras(publicacao_id);
CREATE INDEX IF NOT EXISTS idx_dou_alv_tipo ON dou_alvaras(tipo_alvara);
CREATE INDEX IF NOT EXISTS idx_dou_alv_company ON dou_alvaras(company_id);
CREATE INDEX IF NOT EXISTS idx_dou_alv_prospect ON dou_alvaras(prospect_id);
CREATE INDEX IF NOT EXISTS idx_dou_alv_validade ON dou_alvaras(data_validade);
CREATE INDEX IF NOT EXISTS idx_dou_alv_notificado ON dou_alvaras(notificado) WHERE notificado = false;
CREATE INDEX IF NOT EXISTS idx_dou_alv_razao_trgm ON dou_alvaras USING gin(razao_social gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_dou_alertas_cnpj ON dou_alertas(cnpj);
CREATE INDEX IF NOT EXISTS idx_dou_alertas_status ON dou_alertas(status);
CREATE INDEX IF NOT EXISTS idx_dou_alertas_company ON dou_alertas(company_id);

CREATE INDEX IF NOT EXISTS idx_dou_runs_data ON dou_scraper_runs(data_alvo DESC);

-- 6. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_dou_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dou_publicacoes_updated
  BEFORE UPDATE ON dou_publicacoes
  FOR EACH ROW EXECUTE FUNCTION update_dou_updated_at();

CREATE TRIGGER trg_dou_alvaras_updated
  BEFORE UPDATE ON dou_alvaras
  FOR EACH ROW EXECUTE FUNCTION update_dou_updated_at();

-- 7. RLS
ALTER TABLE dou_publicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dou_alvaras ENABLE ROW LEVEL SECURITY;
ALTER TABLE dou_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE dou_scraper_runs ENABLE ROW LEVEL SECURITY;

-- Policies para service_role (backend)
CREATE POLICY "service_role_dou_pub" ON dou_publicacoes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_dou_alv" ON dou_alvaras FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_dou_alertas" ON dou_alertas FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_dou_runs" ON dou_scraper_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8. View resumo de monitoramento
CREATE OR REPLACE VIEW dou_monitor_summary AS
SELECT
  DATE_TRUNC('day', dp.data_publicacao)::date AS dia,
  dp.secao,
  COUNT(DISTINCT dp.id) AS total_publicacoes,
  COUNT(DISTINCT da.id) AS total_alvaras,
  COUNT(DISTINCT da.id) FILTER (WHERE da.company_id IS NOT NULL) AS alvaras_clientes,
  COUNT(DISTINCT da.id) FILTER (WHERE da.prospect_id IS NOT NULL) AS alvaras_prospects,
  COUNT(DISTINCT da.id) FILTER (WHERE da.notificado = true) AS alvaras_notificados,
  COUNT(DISTINCT dal.id) FILTER (WHERE dal.status = 'enviado') AS alertas_enviados,
  COUNT(DISTINCT dal.id) FILTER (WHERE dal.status = 'pendente') AS alertas_pendentes
FROM dou_publicacoes dp
LEFT JOIN dou_alvaras da ON da.publicacao_id = dp.id
LEFT JOIN dou_alertas dal ON dal.publicacao_id = dp.id
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
