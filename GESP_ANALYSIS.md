# VIGI x GESP — Análise Completa (Manual 123 páginas + XSD)

## Status: ANÁLISE COMPLETA — Todas as 123 páginas + imagens analisadas

---

## 1. Estrutura Geral do GESP (PGDWEB)

### 1.1 Tecnologia
- JSF (JavaServer Faces) com URLs: `pgdweb/private/pages/*.jsf;jsessionid=...`
- Navegador: **Apenas Mozilla Firefox ESR** (documento oficial da PF)
- Resolução mínima: 1024x768

### 1.2 Certificados Digitais
- **e-CNPJ**: Primeiro acesso (obrigatório para cadastrar procuração)
- **e-CPF**: Acessos subsequentes (procurador com procuração válida)
- **A1** (.pfx/.p12): Arquivo importável — VIGI usa este tipo para automação
- **A3** (token USB/smartcard): NÃO suportado em automação headless

### 1.3 Fluxo de Login (p3-14)
1. Acessa `servicos.dpf.gov.br/gesp/` → redireciona para Login Único GOV.BR
2. Clica "Seu Certificado Digital"
3. Firefox apresenta certificado automaticamente (pref: `security.default_personal_cert`)
4. Formulário de Identificação → CPF/Nome/Email
5. Seleciona Perfil (GESP-Empresa)
6. Download Assinador GESP (applet Java) — se primeiro acesso
7. Aceita Termo de Ciência
8. Painel principal com menus

### 1.4 Padrão Universal de Botões (TODAS as telas de processo)
```
← | EXCLUIR | VERIFICAR | ENVIAR
```
- **EXCLUIR**: Remove rascunho
- **VERIFICAR**: Checa pendências (documentos obrigatórios)
- **ENVIAR**: Submete para análise PF

### 1.5 Padrão de Confirmação
- Dialog: "Confirma [ação]?" → Botões: **Sim** / **Não**
- Sucesso: "Processo Enviado com Sucesso. Nº Processo: AAAA/NNNN"

---

## 2. Menu Empresa (p15-22)

### 2.1 Dados da Empresa
- Razão Social, CNPJ, endereço, atividades autorizadas
- Apólice de Seguros (obrigatória para cursos sem vigilantes vinculados)
- Filiais

### 2.2 Gerenciar Procuradores (p17-19)
- Listagem de procurações vigentes/revogadas
- "Nova Procuração" → 3 abas: Dados do Procurador, Endereço, Vigência
- Campos: CPF, Nome, Sexo, RG, UF RG, Órgão Expedidor, País/Estado/Município Nascimento
- Botões: **Outorgar** / **Fechar**

### 2.3 Consultar GRU
- Campo: "Linha Digitável" → Botões: **CONSULTAR** / **LIMPAR**
- Retorna saldo e status de todas as GRUs da empresa

---

## 3. Processos Autorizativos (p24-46)

### 3.1 Subtipos Identificados
1. Revisão de Alvará
2. Alteração de Atos Constitutivos
3. Aquisição de Armas
4. Aquisição de Munições
5. Aquisição de Coletes
6. Informar Aquisição de Munições
7. Solicitar Aquisição de Coletes
8. Transporte de Armas
9. Transferência de Armas
10. Cancelamento de Registro de Armas
11. Autorização de Funcionamento
12. Renovação de Autorização
13. Extensão de Área de Atuação
14. Inclusão de Atividade
15. Certificado de Vistoria de Veículo
16. Mudança de Endereço

### 3.2 Lifecycle Universal
```
Rascunho → VERIFICAR PENDÊNCIAS → ENVIAR → Análise PF → Deferido/Indeferido/Notificado
```

### 3.3 Formulário Base
- **Dados Básicos**: Identificação + Dados (unificados na v7.0)
- **Documentos**: Upload .pdf (max 1.5MB) ou .jpg (max 250KB)
- **GRU**: Fonte de Arrecadação + Linha Digitável (quando requer pagamento de taxa)

### 3.4 Campo "Origem da Compra" (processos de armas, v7.0)
- Aparece em processos de aquisição de armas
- Seleção da origem/fornecedor

---

## 4. Processos Punitivos (p47-51)

### 4.1 Tipos
- Auto de Infração
- Processo Administrativo Disciplinar (PAD)
- Cassação

### 4.2 Operações da Empresa
- **Acompanhar**: Consultar processos (tabela com Nº, CNPJ, Tipo, Data, Situação)
- **Enviar Defesa**: Texto + documentos PDF
- **Interpor Recurso**: Prazo 10 dias após decisão
- **Gerar GRU Multa**: Para pagamento de multa via SIAR
- **Declarar Pagamento**: Linha digitável da GRU paga
- **Solicitar Restituição de Multa**: Para casos de anulação

### 4.3 Observações
- Empresa NÃO cria processos punitivos — apenas consulta e responde
- CCASP pode retirar processo da pauta (v7.0)

---

## 5. Turmas (p52-57)

### 5.1 Tipos de Curso
- Formação (prazo envio: 5 dias antes do início)
- Reciclagem (prazo envio: 2 dias antes do início)
- Extensão

### 5.2 Limites
- **45 alunos** por padrão
- **60 alunos** com checkbox "Incluir Excedentes" marcado

### 5.3 Lifecycle Completo
```
Cadastrar → Definir Disciplinas → Adicionar Alunos → VERIFICAR → ENVIAR →
Aprovação PF → Comunicar Início → (Execução) → Comunicar Conclusão OU Comunicar Cancelamento
```

### 5.4 Disciplinas (vinculadas a instrutores credenciados)
- Legislação Aplicada
- Segurança Física de Instalações
- Segurança Pessoal
- Defesa Pessoal
- Primeiros Socorros
- Proteção de Autoridades
- Transporte de Valores
- Escolta Armada
- Armamento e Tiro
- Prevenção e Combate a Incêndio
- Relações Humanas no Trabalho
- Radiocomunicação
- Gerenciamento de Crises
- Defesa com Uso Progressivo da Força
- Tecnologia e Sistemas Eletrônicos de Segurança
- Segurança de Dignitários
- Vigilância Patrimonial
- Segurança Portuária
- Segurança de Grandes Eventos

### 5.5 Importação de Alunos
- Via XML (schema Aluno)
- Via formulário manual (CPF + busca)

---

## 6. Guia de Transporte (p58-66)

### 6.1 Variantes
1. **Sem Transferência**: Mesmo CNPJ (transporte interno)
2. **Com Transferência de CNPJ**: Entre empresas diferentes
3. **Coletes para Destruição**: Envio de coletes vencidos

### 6.2 Lifecycle
```
Criação → Adicionar Itens (armas, munições, não-letais) → VERIFICAR → ENVIAR → Aprovação DELESP
```

### 6.3 Campos Principais
- Origem (cidade/UF) → Destino (cidade/UF)
- Data do transporte
- Responsável (nome + CPF)
- Veículo (placa)
- Itens: tipo, descrição, quantidade, número de série, calibre

---

## 7. Comunicação de Ocorrência (p67-76)

### 7.1 PROCESSO OBRIGATÓRIO EM 2 FASES
**Fase 1 — Comunicação Inicial (PRAZO: 24 horas)**
- Tipo: extravio, furto, roubo de arma/munição
- Campos: data, hora, local, nº BO, descrição, armas envolvidas

**Fase 2 — Complementação (PRAZO: 10 dias)**
- Detalhamento da ocorrência
- Documentos adicionais (BO completo, laudos)

### 7.2 Tipos
- Extravio de arma de fogo
- Furto de arma de fogo
- Roubo de arma de fogo
- Extravio de munição
- Furto de munição
- Roubo de munição

---

## 8. Comunicação de Evento (p77-80)

### 8.1 Campos
- Tipo de evento
- Nome do evento
- Arma de fogo: Sim/Não
- Duração
- Vigilantes (lista de CPFs)
- Local
- Data início / Data fim

---

## 9. Credenciamento de Instrutores (p81-91)

### 9.1 Fluxo
1. Busca instrutor por CPF
2. Preenche 3 formulários:
   - Dados Cadastrais (CPF, Nome, endereço)
   - Dados do Instrutor (3 abas internas)
   - Disciplinas (dropdown com ~20 disciplinas)
3. Upload de 5 certidões criminais OBRIGATÓRIAS
4. VERIFICAR → ENVIAR

### 9.2 Validade: 4 anos
### 9.3 Recurso: 10 dias após indeferimento

---

## 10. Notificação Autônoma (p92-95)

### 10.1 Características
- PF → Empresa (notificação unilateral)
- Aparece automaticamente no login
- **Prazo padrão de resposta: 30 dias**
- Resposta: texto + upload de PDF

---

## 11. CNV — Carteira Nacional de Vigilantes (p96-97)

### 11.1 Solicitar CNV
- Menu: CNV > Solicitar
- Campos: Linha Digitável da GRU + CPF do Vigilante
- Botão: "Buscar Vigilante" → Confirmação → gera PDF

### 11.2 Imprimir CNV
- Menu: CNV > Imprimir
- Campo: CPF → "Buscar Vigilante" → gera PDF

### 11.3 GRU para CNV
- Fonte de Arrecadação: **140295**

---

## 12. Importação XML (p98-99)

### 12.1 Tipos
- **Importar Pessoas** (XML schema v1.0 ou v2.0)
- **Importar Veículos** (XML schema v1.0 ou v2.0)
- **Importar Alunos** (XML schema único)

### 12.2 Regras Críticas
- Encoding: **UTF-8 obrigatório** no arquivo E na declaração XML
- Validação pelo sistema no upload
- Múltiplos arquivos podem ser adicionados (do mesmo tipo)

### 12.3 Interface de Importação
- Botão: "Adicionar Arquivo"
- Seção: "Arquivo enviado para importação"
- Seção: "Resultado do Último Arquivo Importado"

---

## 13. CCASP (p100) — NÃO APLICÁVEL

Perfil exclusivo de membros da Comissão Consultiva para Assuntos da Segurança Privada.
**Não se aplica a empresas de segurança privada.**
Único item de menu: "Portaria Punitiva > Consultar Processos"

---

## 14. Ajuda (p101) — Informativo

Menu com:
- Manual do Usuário (PDF)
- Estruturas para Importação (XSD)
- Notas de Versão (changelog)

---

## 15. Unidade Responsável (p102-106) — NÃO APLICÁVEL

**Exclusivo para Instituições Financeiras.**
Contém: Consultar Dados IF, Gerenciar Procuradores IF, Gerenciar Unidade Estadual, Consultar GRU.

---

## 16. Processo Bancário (p107-123) — NÃO APLICÁVEL

**Exclusivo para Instituições Financeiras.**
Subtipos: Recadastramento, Plano Nova Agência/PAB, Renovação sem Alteração/com Aumento,
Renovação com Redução/Alteração, Plano Emergencial, Plano Mudança Endereço.
Cada um com formulários: Dados Cadastrais, Guias de Recolhimento, Plano de Segurança,
Projeto de Construção, e Justificativa (quando redução/alteração).

---

## 17. GRU — Fontes de Arrecadação (códigos oficiais)

| Código | Descrição |
|--------|-----------|
| 140244 | Multa |
| 140252 | Taxa de autorização |
| 140260 | Taxa de porte de arma |
| 140279 | Taxa de renovação |
| 140295 | CNV |
| 140309 | Vistoria |
| 140325 | Credenciamento |
| 140368 | Vistoria Estabelecimentos Financeiros (IF only) |

---

## 18. Prazos Críticos

| Operação | Prazo | Consequência |
|----------|-------|--------------|
| Comunicação de Ocorrência (Fase 1) | **24 horas** | Infração administrativa |
| Complementação de Ocorrência (Fase 2) | **10 dias** | Processo punitivo |
| Resposta Notificação Autônoma | **30 dias** | Revelia |
| Recurso Credenciamento | **10 dias** | Perda do direito de recurso |
| Envio Turma Formação | **5 dias antes** | Turma não aprovada |
| Envio Turma Reciclagem | **2 dias antes** | Turma não aprovada |
| Plano Bancário Nova Agência | **60 dias antes** abertura | IF only |
| Recurso Processo Punitivo | **10 dias** | Perda do recurso |

---

## 19. Limites de Arquivo

| Tipo | Tamanho Máximo |
|------|----------------|
| PDF (documento processo) | 1.5 MB |
| JPG (documento processo) | 250 KB |
| XML (importação) | UTF-8 obrigatório |

---

## 20. Arquivos de Código Atualizados

### 20.1 `database.ts` — Tipos completos
- ✅ 37 task types em `GespTaskTipoAcao`
- ✅ 17 subtipos de Processo Autorizativo
- ✅ 20 disciplinas de Credenciamento
- ✅ 8 códigos GRU Fonte de Arrecadação
- ✅ 3 variantes de Guia de Transporte
- ✅ 2 fases de Ocorrência (24h + 10 dias)
- ✅ Turma lifecycle com comunicações (início/conclusão/cancelamento)
- ✅ Processo Punitivo (consulta, defesa, recurso, multa)
- ✅ Excedentes de turma (45 → 60 alunos)

### 20.2 `browser.ts` — Operações GESP
- ✅ Login via Login Único GOV.BR com certificado A1
- ✅ Primeiro acesso com e-CNPJ
- ✅ Cadastrar procurador
- ✅ Snapshot da empresa
- ✅ Cadastrar vigilante
- ✅ Criar/verificar/enviar processo autorizativo
- ✅ Adicionar documento a processo
- ✅ Criar/enviar turma
- ✅ Comunicar início/conclusão/cancelamento de turma
- ✅ Criar guia de transporte (3 variantes)
- ✅ Enviar guia de transporte
- ✅ Comunicação de ocorrência (Fase 1)
- ✅ Enviar complementação (Fase 2)
- ✅ Comunicação de evento
- ✅ Credenciamento de instrutor
- ✅ Solicitar e imprimir CNV
- ✅ Importar XML (pessoa/veículo/aluno)
- ✅ Consultar/responder notificação autônoma
- ✅ Consultar processos punitivos
- ✅ Enviar defesa / interpor recurso punitivo
- ✅ Gerar GRU / declarar pagamento multa
- ✅ Consultar GRU
- ✅ Consultar dados da empresa
- ✅ Helper: handleGespConfirmation (Sim/Não)
- ✅ Helper: clickGespActionButton (EXCLUIR/VERIFICAR/ENVIAR)

### 20.3 `sync.ts` — Task Types
- ✅ 37 task types no switch (alinhado com `GespTaskTipoAcao`)

### 20.4 `validation/schemas.ts` — Schemas
- ✅ Credenciamento com enum de disciplinas
- ✅ Processo Autorizativo com enum de subtipos
- ✅ Guia de Transporte com variantes
- ✅ Turma com excedentes
- ✅ CNV solicitação
- ✅ Complementação de ocorrência
- ✅ Defesa de processo punitivo
- ✅ GRU fontes de arrecadação

### 20.5 `xml-generator.ts` — XML Generation
- ✅ Pessoa XML v1.0 e v2.0
- ✅ Veículo XML v1.0 e v2.0
- ✅ Aluno XML

---

## 21. Seletores — Status

**IMPORTANTE**: Todos os seletores CSS/XPath em `browser.ts` são genéricos baseados em
padrões comuns de JSF. Seletores REAIS precisam ser mapeados acessando o GESP ao vivo.

O GESP usa JSF com IDs dinâmicos (`j_id_XXX`), portanto a estratégia recomendada é:
1. Usar seletores baseados em texto visível (`has-text()`)
2. Usar seletores de atributo parcial (`[name*=""]`, `[id*=""]`)
3. Mapear IDs JSF estáticos quando encontrados

---

## 22. Próximos Passos (Implementação)

1. **Acesso ao GESP real**: Mapear seletores JSF exatos para cada operação
2. **Screenshot-based mapping**: Capturar HTML de cada tela para gerar seletores
3. **Testes E2E**: Executar cada operação em sandbox/homologação
4. **Monitoramento de prazos**: Alertas automáticos para os prazos críticos (24h, 10d, 30d)
5. **XML validation**: Testar importação com XMLs gerados pelo `xml-generator.ts`
6. **GRU integration**: Integrar com SIAR para geração automática de GRUs
