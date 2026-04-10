# VigiPRO Naming Conventions

Consistent naming across the codebase improves readability and maintainability without requiring massive refactors.

## Principle

**Domain terms (business entities) use Portuguese. Technical terms use English.**

This reflects the product's nature: built FOR a Brazilian company (Portuguese domain), BY engineers (English technical implementation).

---

## Domain Terms (Portuguese)

Business entities and domain concepts always use Portuguese:

- `empresa` - Company / client
- `vigilante` - Security guard
- `cnv` - Guard card / qualification
- `alvara` - Security operating license
- `ecpf` - Digital certificate (e-CPF A1)
- `procuracao` - Power of attorney
- `delesp` - State police authority
- `gesp` - Federal Police online portal
- `dou` - Federal Gazette
- `posto` (de serviço) - Guard post / duty location
- `arma` - Firearm
- `colete` - Ballistic vest
- `veiculo` - Vehicle
- `frota` - Fleet
- `reciclagem` - Training renewal
- `validade` - Validity / expiration
- `demanda` - Request / case
- `thread` - Email conversation
- `oficio` - Official document

**Examples in code:**
```typescript
// Good
const { empresa, vigilantes } = await fetchCompanyData();
const cnvValidade = new Date(employee.cnv_data_validade);
function criarNovaEmpresa() { }

// Bad (mixing languages)
const { company, guardians } = await fetchCompanyData();
const guardCardValidity = ...;
```

---

## Technical Terms (English)

All technical, architectural, and implementation terms use English:

- `request`, `response` - HTTP operations
- `middleware`, `handler`, `router` - Framework concepts
- `hook`, `component`, `provider` - React patterns
- `service`, `repository`, `factory` - Design patterns
- `queue`, `worker`, `job` - Async processing
- `error`, `exception`, `warning` - Diagnostics
- `config`, `constant`, `enum` - Configuration
- `schema`, `validator`, `sanitizer` - Data validation
- `token`, `session`, `auth` - Authentication
- `cache`, `store`, `state` - Data management
- `trigger`, `action`, `state` - Workflow/agent concepts
- `payload`, `metadata`, `context` - Data structures
- `pipeline`, `flow`, `cycle` - Process orchestration

**Examples in code:**
```typescript
// Good
interface CreateCompanyRequest {
  razao_social: string;
  cnpj: string;
  email_operacional: string;
}

const companyService = new CompanyService();
await companyService.criarEmpresa(payload);

// Bad (using English for domain)
interface CreateCompanyPayload {
  corporateName: string;
  taxpayerId: string;
  operatingEmail: string;
}
```

---

## File Naming

**All files use kebab-case:**

```
src/
├── lib/
│   ├── agents/               # Agent implementations
│   │   ├── captador.ts
│   │   ├── operacional.ts
│   │   ├── comunicador.ts
│   │   └── orquestrador.ts
│   ├── compliance/           # Domain: compliance
│   │   ├── engine.ts         # Core logic
│   │   ├── alert-dispatcher.ts
│   │   └── validity-checker.ts
│   ├── billing/              # Domain: billing
│   │   ├── asaas.ts
│   │   └── types.ts
│   ├── email/                # Domain: email
│   │   ├── sender.ts
│   │   ├── threading.ts
│   │   └── templates.ts
│   ├── gesp/                 # Domain: GESP automation
│   │   ├── browser.ts
│   │   ├── sync.ts
│   │   └── knowledge-base.ts
│   └── queue/                # Technical: job queue
│       ├── queues.ts
│       └── jobs.ts
├── components/ui/            # Technical: UI components
│   ├── button.tsx
│   ├── modal.tsx
│   └── form-input.tsx
├── app/                       # Next.js App Router
│   ├── api/                   # API routes
│   │   ├── webhooks/
│   │   │   ├── asaas/
│   │   │   └── resend/
│   │   └── companies/
│   ├── (dashboard)/          # Admin dashboard
│   └── (portal)/             # Customer portal
└── types/
    ├── database.ts           # Database types
    └── api.ts                # API types
```

**Exceptions:**
- React component files: `PascalCase.tsx` (e.g., `CompanyCard.tsx`)
- Test files: `*.test.ts` or `*.spec.ts`

---

## Type/Interface Naming

**Format: `PascalCase + Domain Nouns (Portuguese)`**

Use English descriptors with Portuguese domain concepts:

```typescript
// Domain: Company management
interface CreateCompanyInput {
  razao_social: string;
  cnpj: string;
}

interface EmpresaDTO {
  id: string;
  razao_social: string;
  cnpj: string;
  habilitada: boolean;
}

type EmpresaStatus = "ativa" | "inativa" | "suspensa";

// Domain: Vigilante (guard)
interface VigilantePayload {
  cpf: string;
  nome: string;
  cnv_numero?: string;
}

// Domain: Compliance
interface ValidadeAlerta {
  id: string;
  entity_id: string;
  tipo: "alvara" | "cnv" | "ecpf";
  severidade: "critico" | "urgente";
}

// Technical: API
interface ApiResponse<T> {
  data: T;
  error?: string;
  status: number;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
}
```

**Pattern**: `[Adjective][DomainConcept]` or `[DomainConcept][Adjective]`

```typescript
// Good patterns:
type EmpresaStatus = "ativa" | "suspensa"; // Status for company
interface NovaEmpresa { }                  // Creating new company
interface EmpresaBillingGate { }           // Company billing gate
interface VigilanteSearchFilter { }        // Search for guards

// Bad patterns:
type CompanyState = ...  // Should: EmpresaStatus
interface NewCompany { } // Should: NovaEmpresa
interface GuardFilter { } // Should: VigilanteSearchFilter
```

---

## Function Naming

**Format: `camelCase + Domain Verbs/Nouns (Portuguese Objects)`**

English verbs with Portuguese domain objects:

```typescript
// Domain verbs (English) + domain nouns (Portuguese)
async function criarEmpresa(input: CreateCompanyInput): Promise<Empresa> { }
async function obterEmpresa(empresaId: string): Promise<Empresa | null> { }
async function atualizarEmpresaBillingStatus(empresaId: string): Promise<void> { }
async function listarVigilantes(empresaId: string): Promise<Vigilante[]> { }
async function verificarValidadeAlarvas(empresaId: string): Promise<ValidadeAlerta[]> { }
async function disparaTemplateEmail(empresaId: string): Promise<void> { }

// Technical functions (pure English)
async function rateLimit(request: NextRequest): Promise<RateLimitResult> { }
async function validateSchema(data: unknown, schema: Schema): Promise<ValidationResult> { }
async function parseJsonPayload(raw: string): Promise<Record<string, unknown>> { }
async function hashPassword(password: string): Promise<string> { }

// Helpers with domain context
function diasRestantes(dataValidade: string): number { }
function mapEmpleadoToVigilante(raw: RawData): Vigilante { }
function construirUrlOficio(empresa: Empresa, tipo: string): string { }
```

**Verb conventions:**
- `criar*` - Create new resource
- `obter*` / `get*` - Retrieve resource
- `atualizar*` / `update*` - Modify existing
- `deletar*` / `delete*` - Remove resource
- `listar*` / `list*` - Fetch multiple
- `verificar*` / `check*` - Validation or query
- `disparar*` / `dispatch*` - Send/trigger (emails, jobs)
- `mapear*` / `map*` - Transform data
- `construir*` / `build*` - Generate/assemble

---

## Constant Naming

**Format: `UPPER_SNAKE_CASE` (English)**

All constants use English, regardless of domain:

```typescript
// Configuration constants
const CICLO_HORARIOS = ["06:00", "10:00", "14:00"];
const GESP_MAX_BROWSERS = 3;
const PARSER_THRESHOLD = 0.60;
const BILLING_TRIAL_DIAS = 30;

// Status enums
const EMPRESA_STATUS = {
  ATIVA: "ativa",
  SUSPENSA: "suspensa",
  CANCELADA: "cancelada",
} as const;

const VALIDADE_SEVERIDADE = {
  CRITICO: "critico",
  URGENTE: "urgente",
  ACAO: "acao",
} as const;

// API / technical constants
const API_TIMEOUT_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const CACHE_TTL_SECONDS = 3600;
const EMAIL_BATCH_SIZE = 50;

// Domain-specific constants (still English keys)
const FUNCOES_PF = [
  "VIGILANTE_DIURNO",
  "VIGILANTE_NOTURNO",
  "SUPERVISOR",
] as const;

const UFS_BRASIL = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  // ... (Brazilian state codes)
] as const;
```

**No Portuguese in constant names**, even for domain concepts:

```typescript
// Good
const ALERTAS_DIAS_ANTES = [90, 60, 30, 15, 5, 0];

// Bad
const ALERTAS_DIAS_ANTES_VENCIMENTO = [...]; // Use English for the variable name
const DIASALERTA = [...]; // Use proper casing
```

---

## Variable Naming

**Format: `camelCase` (English technical terms, Portuguese domain terms)**

```typescript
// Good: mixing English technical + Portuguese domain
const empresaId: string = "uuid-...";
const vigilantesCadastrados: Vigilante[] = [];
const cnvDataValidade: Date = new Date();
const emailsEnviados: EmailOutbound[] = [];
const procedurasEmAndamento: Procedure[] = [];

// Bad: pure English for domain concepts
const companyId: string = "...";
const registeredGuards: Guard[] = [];
const guardCardExpiry: Date = ...;
```

**Loop variables:**
```typescript
// Good
for (const empresa of empresas) { }
for (const vigilante of vigilantes) { }

// Bad
for (const company of companies) { }
for (const guard of guards) { }
```

---

## Database & ORM Naming

**Tables & Columns: snake_case (Portuguese domain, English technical)**

```sql
-- Tables: snake_case, domain terms in Portuguese
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  cnpj TEXT UNIQUE,
  razao_social TEXT,
  email_operacional TEXT,
  billing_status TEXT,
  habilitada BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE TABLE employees (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  cpf TEXT UNIQUE,
  nome TEXT,
  cnv_numero TEXT,
  cnv_data_validade DATE,
  status TEXT,
  created_at TIMESTAMPTZ
);

CREATE TABLE email_outbound (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  template_id TEXT,
  mode TEXT,  -- CLIENTE_HTML or OFICIO_PF
  to_email TEXT,
  subject TEXT,
  body_html TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ
);

-- Indexes: descriptive names
CREATE INDEX idx_companies_billing ON companies(billing_status);
CREATE INDEX idx_employees_validade ON employees(cnv_data_validade);
CREATE INDEX idx_email_outbound_status ON email_outbound(status);
```

**Supabase client queries:**
```typescript
// Good: table names are domain-specific
const { data: empresas } = await supabase
  .from("companies")
  .select("id, razao_social, cnpj")
  .eq("billing_status", "ativo");

const { data: vigilantes } = await supabase
  .from("employees")
  .select("*")
  .eq("company_id", empresaId);
```

---

## Comment Naming in Issues/PRs

Use English for issue titles/PR titles (searchable, standard), but Portuguese in descriptions:

```markdown
// Good
- Title: "Fix billing gate for inactive companies"
- Description: "Corrigir o gate de billing para empresas inativas conforme regra R3"

- Title: "Implement compliance alert dispatcher"
- Description: "Implementar dispatcher de alertas de validade para vigilantes"

// Bad
- Title: "Corrigir gate billing" (non-English title)
- Description: "Fix the billing gate for inactive companies" (missing domain context)
```

---

## Summary Table

| Context | Format | Example | Purpose |
|---------|--------|---------|---------|
| **Files** | `kebab-case` | `email-sender.ts` | Standard file naming |
| **Types/Interfaces** | `PascalCase` + domain | `EmpresaDTO`, `VigilantePayload` | Type safety, clarity |
| **Functions** | `camelCase` + domain | `criarEmpresa()`, `listarVigilantes()` | Action clarity |
| **Variables** | `camelCase` + domain | `empresaId`, `vigilantesCadastrados` | Consistency |
| **Constants** | `UPPER_SNAKE_CASE` | `GESP_MAX_BROWSERS`, `ALERTA_DIAS` | Configuration |
| **Database Tables** | `snake_case` + domain | `companies`, `employees` | SQL convention |
| **Database Columns** | `snake_case` + domain | `cnv_data_validade`, `email_operacional` | SQL convention |
| **React Components** | `PascalCase` | `CompanyCard.tsx`, `VigilanteModal.tsx` | Component standard |

---

## When to Break These Rules

1. **External API integration**: Use provider's naming (e.g., Asaas API uses camelCase)
2. **Third-party libraries**: Follow their conventions (e.g., React hooks are `camelCase`)
3. **Legacy code**: Don't refactor solely for naming; fix during natural refactors
4. **Team preference**: If team agrees on variation, document it locally

---

## Benefits of This Convention

- **Clarity**: English verbs + Portuguese nouns = clear action + clear business context
- **No refactoring**: Works with existing code, no massive rename needed
- **Search friendly**: Portuguese domain terms make business searches effective
- **Onboarding**: New developers understand "this is Portuguese for business, English for tech"
- **Consistency**: Repeatable pattern reduces decision paralysis
