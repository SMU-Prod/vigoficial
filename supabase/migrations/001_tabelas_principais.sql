-- =============================================================================
-- VIGI SQL 01 — TABELAS PRINCIPAIS
-- users, audit_log, companies, billing_history, delesp_contacts,
-- employees, job_posts, weapons, vests
-- =============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS
-- PRD Seção 3.8 — Gestão de Usuários e Acessos
-- =============================================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nome          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'operador', 'viewer')),
  company_ids   UUID[] DEFAULT '{}',
  deve_trocar_senha BOOLEAN NOT NULL DEFAULT true,
  tentativas_falhas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  mfa_enabled   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usuário admin padrão (PRD: admin@vigi.local / admin — troca obrigatória)
-- Senha 'admin' com bcrypt 12 rounds
INSERT INTO users (email, password_hash, nome, role, deve_trocar_senha)
VALUES (
  'admin@vigi.local',
  '$2a$12$LJ3m4ys3Lz0QVOqOKqQHYeGJYj8wJZ1Q5zFZm.xjR6k5bN9YwXGOe',
  'Administrador VIGI',
  'admin',
  true
);

-- =============================================================================
-- AUDIT_LOG
-- PRD Seção 3.8 — Registro completo de ações sensíveis
-- =============================================================================
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  acao        TEXT NOT NULL,
  detalhes    JSONB DEFAULT '{}',
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_acao ON audit_log(acao);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- =============================================================================
-- COMPANIES
-- PRD Seção 4 — Modelo de Negócio + Billing
-- =============================================================================
CREATE TABLE companies (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cnpj                  TEXT NOT NULL UNIQUE,
  razao_social          TEXT NOT NULL,
  nome_fantasia         TEXT,
  alvara_numero         TEXT,
  alvara_validade       DATE,
  plano                 TEXT NOT NULL DEFAULT 'starter'
                        CHECK (plano IN ('starter', 'professional', 'enterprise', 'custom')),
  valor_mensal          NUMERIC(10,2) NOT NULL DEFAULT 497.00,
  billing_status        TEXT NOT NULL DEFAULT 'trial'
                        CHECK (billing_status IN ('trial', 'ativo', 'inadimplente', 'suspenso', 'cancelado')),
  data_proxima_cobranca DATE,
  habilitada            BOOLEAN NOT NULL DEFAULT false,
  email_operacional     TEXT NOT NULL,
  email_responsavel     TEXT NOT NULL,
  telefone              TEXT,
  uf_sede               CHAR(2) NOT NULL,
  -- Certificado digital e-CPF A1
  ecpf_r2_path          TEXT,
  ecpf_senha_encrypted  TEXT,
  ecpf_validade         DATE,
  -- Controle de alertas (Regra R9)
  alertas_ativos        JSONB NOT NULL DEFAULT '{
    "alvara_validade": true,
    "ecpf_validade": true
  }',
  -- Asaas
  asaas_customer_id     TEXT,
  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_billing ON companies(billing_status);
CREATE INDEX idx_companies_habilitada ON companies(habilitada);
CREATE INDEX idx_companies_cnpj ON companies(cnpj);

-- =============================================================================
-- BILLING_HISTORY
-- PRD Seção 4.2 — Ciclo de Billing Asaas
-- =============================================================================
CREATE TABLE billing_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  valor           NUMERIC(10,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
  asaas_payment_id TEXT,
  metodo_pagamento TEXT,
  data_vencimento DATE NOT NULL,
  data_pagamento  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_company ON billing_history(company_id);
CREATE INDEX idx_billing_status ON billing_history(status);
CREATE INDEX idx_billing_vencimento ON billing_history(data_vencimento);

-- =============================================================================
-- DELESP_CONTACTS
-- PRD Seção 10.2 — 27 DELESPs estaduais + CGCSP
-- Regra R12: Ofício vai para DELESP do estado onde o POSTO está
-- =============================================================================
CREATE TABLE delesp_contacts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uf          CHAR(2) NOT NULL UNIQUE,
  estado      TEXT NOT NULL,
  email       TEXT NOT NULL,
  telefone    TEXT,
  observacoes TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inserir todas as 27 DELESPs + CGCSP Nacional
INSERT INTO delesp_contacts (uf, estado, email) VALUES
  ('AC', 'Acre',                  'delesp.ac@pf.gov.br'),
  ('AL', 'Alagoas',              'delesp.al@pf.gov.br'),
  ('AM', 'Amazonas',             'delesp.am@pf.gov.br'),
  ('AP', 'Amapá',                'delesp.ap@pf.gov.br'),
  ('BA', 'Bahia',                'delesp.ba@pf.gov.br'),
  ('CE', 'Ceará',                'delesp.ce@pf.gov.br'),
  ('DF', 'Distrito Federal',     'delesp.df@pf.gov.br'),
  ('ES', 'Espírito Santo',       'delesp.es@pf.gov.br'),
  ('GO', 'Goiás',                'delesp.go@pf.gov.br'),
  ('MA', 'Maranhão',             'delesp.ma@pf.gov.br'),
  ('MG', 'Minas Gerais',         'delesp.mg@pf.gov.br'),
  ('MS', 'Mato Grosso do Sul',   'delesp.ms@pf.gov.br'),
  ('MT', 'Mato Grosso',          'delesp.mt@pf.gov.br'),
  ('PA', 'Pará',                 'delesp.pa@pf.gov.br'),
  ('PB', 'Paraíba',              'delesp.pb@pf.gov.br'),
  ('PE', 'Pernambuco',           'delesp.pe@pf.gov.br'),
  ('PI', 'Piauí',                'delesp.pi@pf.gov.br'),
  ('PR', 'Paraná',               'delesp.pr@pf.gov.br'),
  ('RJ', 'Rio de Janeiro',       'delesp.rj@pf.gov.br'),
  ('RN', 'Rio Grande do Norte',  'delesp.rn@pf.gov.br'),
  ('RO', 'Rondônia',             'delesp.ro@pf.gov.br'),
  ('RR', 'Roraima',              'delesp.rr@pf.gov.br'),
  ('RS', 'Rio Grande do Sul',    'delesp.rs@pf.gov.br'),
  ('SC', 'Santa Catarina',       'delesp.sc@pf.gov.br'),
  ('SE', 'Sergipe',              'delesp.se@pf.gov.br'),
  ('SP', 'São Paulo',            'delesp.sp@pf.gov.br'),
  ('TO', 'Tocantins',            'delesp.to@pf.gov.br'),
  ('BR', 'CGCSP Nacional',       'dpsp.cgcsp.dpa@pf.gov.br');

-- =============================================================================
-- JOB_POSTS (Postos de Serviço)
-- PRD Seção 9.2 — Novo Posto de Serviço
-- Criada ANTES de employees por causa da FK posto_designado
-- =============================================================================
CREATE TABLE job_posts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  endereco      TEXT NOT NULL,
  cidade        TEXT NOT NULL,
  uf            CHAR(2) NOT NULL,
  cep           TEXT,
  status        TEXT NOT NULL DEFAULT 'ativo'
                CHECK (status IN ('ativo', 'encerrado', 'pendente')),
  data_abertura DATE,
  data_encerramento DATE,
  gesp_protocolo TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_posts_company ON job_posts(company_id);
CREATE INDEX idx_job_posts_uf ON job_posts(uf);

-- =============================================================================
-- EMPLOYEES (Vigilantes)
-- PRD Seção 3.4 — Cadastro completo baseado na Portaria 18.045/23-DG/PF
-- 7 blocos de dados conforme PRD
-- =============================================================================
CREATE TABLE employees (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- BLOCO 1 — Identificação Civil
  nome_completo   TEXT NOT NULL,           -- NUNCA abreviar (Regra R1)
  cpf             TEXT NOT NULL,
  rg              TEXT NOT NULL,
  rg_orgao_emissor TEXT NOT NULL,
  rg_uf           CHAR(2) NOT NULL,
  rg_data_emissao DATE,
  data_nascimento DATE NOT NULL,
  sexo            CHAR(1) NOT NULL CHECK (sexo IN ('M', 'F')),
  nacionalidade   TEXT DEFAULT 'Brasileira',
  naturalidade    TEXT,
  nome_mae        TEXT NOT NULL,           -- Obrigatório PF
  nome_pai        TEXT,
  estado_civil    TEXT,

  -- BLOCO 2 — Contato e Endereço
  email           TEXT NOT NULL,
  telefone1       TEXT NOT NULL,
  telefone2       TEXT,
  cep             TEXT,
  logradouro      TEXT,
  numero          TEXT,
  complemento     TEXT,
  bairro          TEXT,
  cidade          TEXT,
  uf              CHAR(2),

  -- BLOCO 3 — Situação Funcional
  status          TEXT NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'inativo', 'afastado', 'demitido')),
  data_admissao   DATE NOT NULL,
  data_desligamento DATE,
  tipo_vinculo    TEXT NOT NULL DEFAULT 'CLT'
                  CHECK (tipo_vinculo IN ('CLT', 'Terceirizado')),
  funcao_principal TEXT NOT NULL
                  CHECK (funcao_principal IN (
                    'Vigilante Patrimonial',
                    'Vigilante Armado',
                    'Vigilante Desarmado',
                    'Vigilante de Transporte de Valores',
                    'Vigilante de Escolta Armada',
                    'Vigilante de Segurança Pessoal Privada',
                    'Vigilante de Grandes Eventos'
                  )),
  posto_designado UUID REFERENCES job_posts(id) ON DELETE SET NULL,

  -- BLOCO 4 — CNV (Carteira Nacional de Vigilante)
  cnv_numero      TEXT NOT NULL,
  cnv_uf_emissora CHAR(2) NOT NULL,
  cnv_data_emissao DATE NOT NULL,
  cnv_data_validade DATE NOT NULL,
  cnv_situacao    TEXT NOT NULL DEFAULT 'valida'
                  CHECK (cnv_situacao IN ('valida', 'vencida', 'suspensa', 'cancelada')),

  -- BLOCO 5 — Reciclagem
  reciclagem_data_ultimo_curso DATE,
  reciclagem_data_validade     DATE,
  reciclagem_escola            TEXT,
  reciclagem_municipio         TEXT,

  -- BLOCO 6 — Formação Inicial
  formacao_data      DATE,
  formacao_escola    TEXT,
  formacao_municipio TEXT,
  formacao_uf        CHAR(2),

  -- BLOCO 7 — Armamento e Colete
  arma_numero_serie     TEXT,
  porte_arma_validade   DATE,
  colete_numero_serie   TEXT,
  colete_data_validade  DATE,

  -- Campos adicionais PF
  crv                       TEXT,
  laudo_medico              BOOLEAN DEFAULT false,
  antecedentes_criminais    BOOLEAN DEFAULT false,
  aptidao_porte_arma        BOOLEAN DEFAULT false,
  tipo_arma_habilitada      TEXT,
  municipio_trabalho        TEXT,
  uf_trabalho               CHAR(2),

  -- Controle de alertas (Regra R9)
  alertas_ativos  JSONB NOT NULL DEFAULT '{
    "cnv_data_validade": true,
    "reciclagem_data_validade": true,
    "porte_arma_validade": true,
    "colete_data_validade": true
  }',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(company_id, cpf)
);

CREATE INDEX idx_employees_company ON employees(company_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_cpf ON employees(cpf);
CREATE INDEX idx_employees_cnv_validade ON employees(cnv_data_validade);

-- =============================================================================
-- WEAPONS (Armamento)
-- PRD Seção 9.3 — Venda ou Compra de Arma
-- =============================================================================
CREATE TABLE weapons (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL,        -- Revólver, Pistola, Espingarda, etc.
  marca           TEXT,
  modelo          TEXT,
  calibre         TEXT NOT NULL,
  numero_serie    TEXT NOT NULL,
  registro_sinarm TEXT,
  status          TEXT NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'vendida', 'baixa', 'transporte')),
  -- Eventos
  evento_tipo     TEXT CHECK (evento_tipo IN ('compra', 'venda', 'transporte', 'baixa')),
  evento_data     DATE,
  evento_contraparte TEXT,             -- Nome/CNPJ comprador ou vendedor
  evento_nf       TEXT,                -- Número nota fiscal
  evento_nf_r2_path TEXT,             -- PDF da NF no R2
  -- Vínculo
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(company_id, numero_serie)
);

CREATE INDEX idx_weapons_company ON weapons(company_id);
CREATE INDEX idx_weapons_serie ON weapons(numero_serie);

-- =============================================================================
-- VESTS (Coletes Balísticos)
-- PRD Seção 9.6 — Baixa de Colete por Validade
-- =============================================================================
CREATE TABLE vests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  numero_serie        TEXT NOT NULL,
  nivel_protecao      TEXT NOT NULL,    -- IIIA, III, IV
  fabricante          TEXT,
  data_fabricacao     DATE,
  data_validade       DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ativo'
                      CHECK (status IN ('ativo', 'baixa_validade', 'baixa_defeito')),
  baixa_comprovante_r2 TEXT,           -- Caminho no R2
  baixa_data          DATE,
  -- Vínculo
  employee_id         UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(company_id, numero_serie)
);

CREATE INDEX idx_vests_company ON vests(company_id);
CREATE INDEX idx_vests_validade ON vests(data_validade);

-- =============================================================================
-- Trigger para updated_at automático
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_job_posts_updated_at BEFORE UPDATE ON job_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_weapons_updated_at BEFORE UPDATE ON weapons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vests_updated_at BEFORE UPDATE ON vests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
