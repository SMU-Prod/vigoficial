# VigiPRO — Sistema Interno de Automação e Gestão

> Sistema interno da Vigi Consultoria para automação de compliance em segurança privada.

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend Admin | Next.js 15 (App Router), React 19, Tailwind CSS 4 |
| Linguagem | TypeScript 5.x (strict mode) |
| Banco de Dados | Supabase (PostgreSQL 15+, Auth, RLS) |
| Fila de Jobs | BullMQ 5.x + Redis 7 |
| Automação Web | Playwright (Firefox ESR) |
| Storage | Cloudflare R2 (AWS SDK v3) |
| Email | Resend v6.9+ (envio + inbound + webhooks) |
| Billing | Asaas (cobrança + webhooks) |
| IA | Anthropic Claude (via SDK) |
| Observabilidade | Langfuse (traces), Sentry (errors) |

## Estrutura do Projeto

```
src/
├── app/                  # Next.js App Router
│   ├── (auth)/           # Páginas de autenticação
│   ├── (dashboard)/      # Dashboard admin (interno)
│   ├── (portal)/         # Portal do cliente
│   └── api/              # 78 rotas de API
├── components/           # Componentes React reutilizáveis
│   └── ui/               # Design system interno
├── hooks/                # Custom hooks (useFetch, useAuth, etc.)
├── lib/                  # Lógica de negócio
│   ├── agents/           # Agentes IA (captador, operacional, comunicador, orquestrador)
│   ├── ai/               # Cliente Anthropic + prompts
│   ├── auth/             # JWT, MFA, refresh tokens
│   ├── billing/          # Integração Asaas
│   ├── cognitive/        # Motor cognitivo (classificação, workflows)
│   ├── compliance/       # Motor de compliance
│   ├── config/           # Variáveis de ambiente + constantes
│   ├── core/             # Módulos compartilhados (TokenTracker)
│   ├── dou/              # Parser e prospector DOU
│   ├── email/            # Envio, threading, oficios
│   ├── fleet/            # Gestão de frota + GPS
│   ├── gesp/             # Automação do portal GESP (PF)
│   ├── iml/              # Intelligence Meta-Learning
│   ├── lgpd/             # Conformidade LGPD
│   ├── observability/    # Langfuse, logger, alertas
│   ├── queue/            # BullMQ queues + jobs
│   ├── redis/            # Conexão Redis
│   ├── security/         # Rate limit, CSRF, crypto
│   ├── services/         # Serviços de domínio
│   ├── supabase/         # Cliente + repositories
│   └── validation/       # Schemas Zod + sanitização
├── types/                # TypeScript types
└── workers/              # Workers BullMQ
```

## Setup Local

```bash
# Instalar dependências
npm ci

# Configurar variáveis de ambiente
cp .env.example .env.local
# Preencher todas as variáveis em .env.local

# Rodar em desenvolvimento
npm run dev

# Rodar testes
npm run test:run

# Rodar testes com cobertura
npm run test:coverage

# Build de produção
npm run build
```

## Variáveis de Ambiente

Consulte `.env.example` para a lista completa. Serviços obrigatórios:
Supabase, Redis, Anthropic, Resend, Asaas, Cloudflare R2.

## CI/CD

Pipeline GitHub Actions com 7 estágios:
1. **Security Scan** — npm audit + gitleaks (bloqueante)
2. **Lint** — ESLint
3. **Typecheck** — TypeScript compiler
4. **Tests** — Vitest (thresholds: 40% lines)
5. **Build** — Next.js production build
6. **E2E** — Playwright (PRs para main)
7. **Deploy** — Vercel (staging: develop, produção: main) + Supabase migrations

## Regras de Negócio Críticas

- **R5**: Máximo 3 sessões simultâneas no GESP
- **R3**: Billing gate bloqueia GESP se status ≠ ativo
- **REGRA ABSOLUTA**: Nome "VigiPRO" e referências a IA nunca aparecem em comunicações externas

## Contribuição

1. Branch a partir de `develop`
2. Manter cobertura de testes acima dos thresholds
3. PR para `develop` (staging) → depois PR para `main` (produção)
