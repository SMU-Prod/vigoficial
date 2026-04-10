# Guia de Upgrade — Next.js e TypeScript

## Status Atual

- **Next.js:** 15.5.14
- **TypeScript:** ^5.0
- **React:** 19.1.0
- **Node.js:** ^20

## Next.js 15 → 16

### Breaking Changes Conhecidas

1. **Async Params e SearchParams**
   - No Next.js 16, `params` e `searchParams` são passadas como Promises
   - Nossa classe `withAuth` wrapper já está preparada para isso
   - Verificar que os layout.tsx e page.tsx usam `await params` e `await searchParams`

2. **App Router Changes**
   - Route handlers agora usam automaticamente streaming para respostas grandes
   - Verify que não há regras explícitas em `next.config.ts` para App Router features

3. **Middleware Compatibility**
   - Middleware em `src/middleware.ts` precisa ser testado com Next.js 16
   - Edge Runtime mudanças podem afetar helpers como `getAuth()`

4. **Image Optimization**
   - `next/image` pode ter mudanças no behavior de lazy loading
   - Verificar que `remotePatterns` em `next.config.ts` ainda funcionam

5. **Font Loading**
   - `next/font` pode ter mudanças no preloading automático
   - Checar que fontes estão sendo carregadas corretamente após upgrade

### Checklist de Migração

- [ ] **1. Preparação**
  - [ ] Ler oficiais release notes do Next.js 16 em https://nextjs.org/docs/messages/upgrade-guide
  - [ ] Criar branch de feature: `git checkout -b feat/upgrade-nextjs-16`
  - [ ] Fazer backup de `package-lock.json`

- [ ] **2. Upgrade de Dependências**
  - [ ] Atualizar `package.json`: `next@16`, `eslint-config-next@16`
  - [ ] Rodar `npm install`
  - [ ] Rodar `npm audit fix` (se necessário)

- [ ] **3. Type Checking**
  - [ ] Rodar `npm run build`
  - [ ] Revisar erros de tipo reportados pelo Next.js
  - [ ] Verificar que não há breaking changes em middlewares

- [ ] **4. Testing**
  - [ ] Testar todas as rotas de API: `npm run dev` + manual testing
  - [ ] Testar SSR em páginas dinâmicas (dashboard, empresas, etc)
  - [ ] Testar CSR components (client-side hydration)
  - [ ] Rodar testes unitários: `npm run test:run`
  - [ ] Rodar testes E2E: `npx playwright test`

- [ ] **5. Deployment**
  - [ ] Deploy para staging
  - [ ] Verificar logs de erro em staging
  - [ ] Testar performance (Core Web Vitals)
  - [ ] Verificar que cookies e sessions continuam funcionando

### Risco: Médio

**Preocupações principais:**
- Async params em layouts e pages (já preparados no código)
- Middleware edge runtime compatibility
- Server Actions com streaming (não afeta nosso código)
- Image optimization e font loading

**Mitigações:**
- Nossa classe `withAuth` já trata async params
- Testes E2E abrangentes cobrem fluxos críticos
- Staging environment para validação antes de produção

## TypeScript 5 → 6

### Breaking Changes Conhecidas

1. **Estrita Inferência de Tipos**
   - TypeScript 6 é mais rigoroso com tipo inference em genéricos
   - Pode requerer anotações explícitas em funções com múltiplos tipos genéricos
   - Exemplo: `const fn = <T, U>(a: T, b: U) => ...` pode precisar de types explícitos

2. **Union Types e Narrowing**
   - Melhorias no type narrowing podem alterar behavior em alguns casos edge
   - Rever code que depende de discriminated unions

3. **Bivariance em Callbacks**
   - Callbacks agora são mais estritos em alguns contextos
   - Verificar que callbacks em `Array.map`, `Array.filter`, etc ainda funcionam

4. **Strict Mode Changes**
   - Nosso projeto já usa `"strict": true`, logo é baixo risco
   - Verificar que não há `any` implícitos escondidos

### Checklist de Migração

- [ ] **1. Preparação**
  - [ ] Ler release notes do TypeScript 6 em https://www.typescriptlang.org/docs/
  - [ ] Criar branch: `git checkout -b feat/upgrade-typescript-6`

- [ ] **2. Upgrade**
  - [ ] Atualizar `package.json`: `typescript@^6`
  - [ ] Rodar `npm install`

- [ ] **3. Type Checking**
  - [ ] Rodar `npx tsc --noEmit` (sem emitir código, só checar tipos)
  - [ ] Corrigir novos erros de tipo
  - [ ] Rodar `npm run build` (Next.js build também checka tipos)

- [ ] **4. Validation**
  - [ ] Rodar testes: `npm run test:run`
  - [ ] Verificar que Zod (schema validation) funciona corretamente
  - [ ] Verificar que queries com banco de dados não quebram

- [ ] **5. Code Review**
  - [ ] Revisar PRs para garantir que novos tipos estão corretos
  - [ ] Verificar que não há regression em type inference

### Risco: Baixo

**Razões:**
- TypeScript 6 é backward-compatible com strict mode projects
- Projeto já usa tipos estritos (evita `any`)
- Mudanças de inference geralmente resultam em erros úteis

**Mitigações:**
- Testes abrangentes cobrem lógica crítica
- Type checking com `tsc --noEmit` antes de commit
- Validação com Zod garante dados em runtime

## Estratégia de Upgrade Recomendada

### Fase 1: TypeScript 6 (mais seguro, fazer primeiro)
1. Upgrade apenas TypeScript
2. Resolver erros de tipo
3. Rodar testes
4. Testar em staging
5. Merge e deploy

### Fase 2: Next.js 16 (mais impactante, fazer depois)
1. Upgrade apenas Next.js
2. Testar middlewares e params async
3. Rodar testes E2E completos
4. Testar em staging
5. Merge e deploy

**Não fazer ambos ao mesmo tempo** — assim fica fácil identificar o culpado se algo quebrar.

## Estimativa de Esforço

- **TypeScript 6:** 0.5-1 dia (tipo checking + fixes + testing)
- **Next.js 16:** 2-3 dias (incluindo testes E2E, staging validation)
- **Total:** ~4 dias de desenvolvimento

## Recomendação

**Não fazer upgrade imediatamente.** Aguardar:

1. Cobertura de testes acima de 50% (atualmente em progresso)
2. Ambiente de staging estável
3. Finalização de features críticas em desenvolvimento

Quando essas condições forem atingidas:
- Agendar upgrade durante sprint planning
- Dedicar 1 dev time para TypeScript 6
- Dedicar 1 dev time para Next.js 16
- Validar em staging por no mínimo 48h antes de prod

## Checklist de Pré-Requisitos

Antes de começar qualquer upgrade:

- [ ] Todos os testes E2E estão passando
- [ ] Cobertura de testes >= 50%
- [ ] Não há PRs abertas com mudanças de infraestrutura
- [ ] Staging environment está saudável
- [ ] Nenhuma release em progress
- [ ] Backups de produção foram feitos

## Links Úteis

- [Next.js 16 Release Notes](https://nextjs.org/docs)
- [TypeScript 6.0 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)
- [Next.js Upgrade Guide](https://nextjs.org/docs/upgrading)
- [VigiPRO Architecture Decision Records](./ARCHITECTURE.md)
