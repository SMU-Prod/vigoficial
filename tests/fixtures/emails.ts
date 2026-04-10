/**
 * Email Test Fixtures for VIGI Classification & Extraction
 * Realistic sample emails for testing email processing pipeline
 */

export interface EmailFixture {
  subject: string;
  bodyText: string;
  fromEmail: string;
  expectedTipoDemanda:
    | "novo_vigilante"
    | "novo_posto"
    | "compra_arma"
    | "renovacao_alvara"
    | "encerramento_posto"
    | "caso_desconhecido";
  expectedConfidenceAbove: number; // e.g., 0.75
  expectedUrgente: boolean;
}

export const emailFixtures: EmailFixture[] = [
  /**
   * novo_vigilante: Full employee registration with all details
   */
  {
    subject: "Cadastro de Novo Vigilante - João Carlos Silva Santos",
    bodyText: `
Prezados,

Solicitamos o cadastro do novo vigilante conforme dados abaixo:

DADOS PESSOAIS:
Nome Completo: João Carlos Silva Santos
CPF: 12345678901
RG: 4567891
Órgão Emissor: SSP-SP
Data de Nascimento: 1990-05-15
Sexo: M
Nome da Mãe: Maria Silva dos Santos
Nome do Pai: Carlos Alberto Santos

CONTATO:
Email: joao.silva@email.com
Telefone 1: (11) 98765-4321
Telefone 2: (11) 3456-7890

ENDEREÇO:
CEP: 01234-567
Logradouro: Rua das Flores
Número: 789
Bairro: Vila Mariana
Cidade: São Paulo
UF: SP

DADOS LABORAIS:
Data de Admissão: 2026-04-01
Tipo de Vínculo: CLT
Função Principal: Vigilante de Segurança

CNV (se aplicável):
CNV Número: 0123456789
UF Emissora: SP
Data de Emissão: 2024-03-15
Data de Validade: 2027-03-15

Favor confirmar recebimento e atualizar o sistema.

Atenciosamente,
RH - Segurança Total LTDA
    `,
    fromEmail: "rh@segurancatotal.com.br",
    expectedTipoDemanda: "novo_vigilante",
    expectedConfidenceAbove: 0.85,
    expectedUrgente: false,
  },

  /**
   * renovacao_alvara: Alvará renewal notice
   */
  {
    subject: "Renovação de Alvará de Funcionamento - CNPJ 12.345.678/0001-91",
    bodyText: `
Prezada Direção,

Informamos que o alvará de funcionamento da empresa está próximo do vencimento:

DADOS DO ALVARÁ:
Alvará Número: DPF/SP-2023-0001847
CNPJ: 12.345.678/0001-91
Razão Social: SECURITEC VIGILÂNCIA LTDA
Data de Validade Atual: 31 de março de 2026
Data de Validade Nova: 31 de março de 2029

Empresa de Vigilância: Segurança Privada
Atividades Autorizadas: Vigilância patrimonial, transporte de valores

Solicita-se atenção para o cumprimento de todas as exigências legais conforme Lei 7.102/83.

Att.
Departamento de Segurança Privada - MJ
    `,
    fromEmail: "dou@imprensanacional.gov.br",
    expectedTipoDemanda: "renovacao_alvara",
    expectedConfidenceAbove: 0.80,
    expectedUrgente: false,
  },

  /**
   * compra_arma: Weapon purchase request
   */
  {
    subject: "Requisição de Compra de Armas de Fogo",
    bodyText: `
Departamento de Armamento,

Solicitamos a compra dos seguintes armamentos:

ITEM 1:
Tipo: Pistola
Marca: TAURUS
Modelo: PT 940
Calibre: .40
Número de Série: TSB123456
Quantidade: 2

ITEM 2:
Tipo: Revólver
Marca: ROSSI
Modelo: M92
Calibre: .38
Número de Série: ROS789012
Quantidade: 3

Dados da Transação:
Evento Tipo: Compra
Fornecedor: Importadora Brasil Armamentos LTDA
CNPJ Fornecedor: 98.765.432/0001-42
Número Nota Fiscal: NF-2026-00156
Valor Total: R$ 18.500,00

Favor processar com urgência para reposição de arsenal.

Att. Gerente de Logística
Vigilância Brasil Segurança S.A.
    `,
    fromEmail: "armamento@vigilanciabrasil.com.br",
    expectedTipoDemanda: "compra_arma",
    expectedConfidenceAbove: 0.88,
    expectedUrgente: false,
  },

  /**
   * encerramento_posto: Service closure notification
   */
  {
    subject: "Encerramento de Posto de Serviço - Unidade Centro",
    bodyText: `
Prezados Gestores,

Comunicamos o encerramento do seguinte posto de serviço:

DADOS DO ENCERRAMENTO:
Nome do Posto: Banco Safra - Agência Centro
Endereço: Avenida Paulista, 1000, São Paulo, SP
Data de Encerramento: 2026-04-30
Motivo: Fechamento da agência bancária + consolidação de serviços

IMPACTOS:
Vigilantes Alocados: 8 (oito)
Vigilantes para Realocar: 8
Turno: 24 horas (3 vigilantes por turno)

Os vigilantes serão realocados para postos em São Bernardo do Campo conforme acordado.
Comunicar todos os vigilantes com antecedência de 15 dias.

Favor confirmar recebimento e atualizar o sistema de gestão de postos.

Att.
Diretoria de Operações
    `,
    fromEmail: "operacoes@shield-protecao.com.br",
    expectedTipoDemanda: "encerramento_posto",
    expectedConfidenceAbove: 0.82,
    expectedUrgente: false,
  },

  /**
   * caso_desconhecido: Ambiguous/unclear classification
   */
  {
    subject: "Documentação para Análise",
    bodyText: `
Prezados,

Segue documentação para análise e parecer da administração:

Temos recebido algumas dúvidas quanto aos procedimentos internos de nossa empresa.
Gostaríamos de esclarecer alguns pontos sobre conformidade e regulamentação.

Poderia verificar a documentação em anexo e nos informar se está tudo correto?

Alguns pontos de dúvida:
- Procedimentos gerais
- Conformidade com leis aplicáveis
- Padrões de operação

Favor retornar com análise.

Atenciosamente,
Administração
    `,
    fromEmail: "admin@empresa-seguranca.com.br",
    expectedTipoDemanda: "caso_desconhecido",
    expectedConfidenceAbove: 0.0, // Confidence should be low
    expectedUrgente: false,
  },

  /**
   * URGENTE: Urgent email with priority keywords
   */
  {
    subject: "URGENTE - Autuação em Andamento - Regularização Imediata Necessária",
    bodyText: `
ASSUNTO URGENTE - AÇÃO IMEDIATA REQUERIDA

Prezados Responsáveis,

Fomos notificados sobre uma autuação em andamento por não conformidade regulatória.

DETALHES DA AUTUAÇÃO:
Auto de Infração Nº: 2026-0001156
Data: 25 de março de 2026
Motivo: Funcionamento sem alvará de funcionamento válido
Empresa: Nossa Vigilância Expressa EIRELI
CNPJ: 56.789.012/0001-34

AÇÃO REQUERIDA:
- Apresentar alvará regularizado em 48 HORAS
- Comprovar CNV de todos os funcionários
- Apresentar plano de correção

URGÊNCIA MÁXIMA: Prazo para resposta - HOJE

A falta de cumprimento pode resultar em multa de R$ 8.500,00 e suspensão de operações.

Por favor, contate imediatamente a diretoria para ações emergenciais.

Att. Departamento Jurídico
    `,
    fromEmail: "juridico@seguranca-urgente.com.br",
    expectedTipoDemanda: "renovacao_alvara", // Or could be autuacao, but we map to alvara context
    expectedConfidenceAbove: 0.70,
    expectedUrgente: true, // Keywords: URGENTE, Autuação, HOJE, Imediata
  },
];
