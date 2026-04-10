/**
 * VIGI — GESP XML Generator
 *
 * Gera arquivos XML para importação no GESP conforme schemas XSD oficiais da PF.
 *
 * Tipos de importação:
 * 1. Pessoa (v1.0 e v2.0) — Atualiza cadastro da empresa
 * 2. Veículo (v1.0 e v2.0) — Atualiza cadastro da empresa
 * 3. Aluno — Inclui alunos em turma (max 60 por turma)
 *
 * REGRAS IMPORTANTES:
 * - Encoding UTF-8 obrigatório (declaração E arquivo)
 * - Pessoa/Veículo: item não no XML mas vinculado → sistema fecha vínculo
 * - Pessoa/Veículo: item no XML mas não no cadastro → sistema cria vínculo
 * - Aluno: se não existe no processo, será incluído; se existe, será atualizado
 * - Datas formato DDMMAAAA
 */

// ─── XSD Types (match exact XSD patterns) ───────────────────────

export type XsdSituacaoPessoa = 5 | 8; // 5=Ativo, 8=Afastado INSS
export type XsdVinculoEmpregaticio = 1 | 2 | 3 | 9; // 1=Vigilante, 2=Supervisor, 3=Instrutor, 9=Outros
export type XsdSexo = "M" | "F" | "m" | "f";
export type XsdTipoVeiculo = "1" | "2" | "3" | "4"; // 1=Carro Forte, 2=Escolta Armada, 3=Outros, 4=Carro Leve TV
export type XsdSituacaoVeiculoV1 = "0" | "1" | "2" | "3" | "4";
export type XsdSituacaoVeiculoV2 = "1"; // Only Ativo in v2
export type XsdTipoPropriedade = "1" | "2" | "3" | "4" | "5"; // 1=Próprio, 2=Leasing, 3=Alugado, 4=Outros, 5=Alien.Fiduc.

export const XSD_MARCAS = [
  "AGRALE", "ALFA-ROMEU", "ASIA", "AUDI", "BMW", "CHRYSLER", "CITROEN",
  "DAEWOO", "DODGE", "FIAT", "FORD", "GENERAL MOTORS", "HONDA", "HYUNDAY",
  "ISUZU", "ITRAXX", "IVECO", "KIA", "LADA", "LAND ROVER", "MAZDA",
  "MERCEDES BENZ", "MITSUBISHI", "MONTEX", "NISSAN", "PEUGEOT", "RENAULT",
  "SAAB-SCANIA", "SUNDOWN", "SUZUKI", "TOYOTA", "TROLLER", "VOLKSWAGEN",
  "VOLVO", "WILLYS OVERLAND", "YAMAHA",
] as const;

export type XsdMarca = typeof XSD_MARCAS[number];

export const XSD_ESTADOS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
] as const;

export type XsdEstado = typeof XSD_ESTADOS[number];

// ─── Input Types ────────────────────────────────────────────────

export interface PessoaV1Input {
  vinculoEmpregaticio: XsdVinculoEmpregaticio;
  cpf: string; // 11 dígitos
  nome: string; // max 60 chars
  pis?: string; // 11 dígitos ou "0"
  dataAdmissao?: string; // YYYY-MM-DD (será convertido para DDMMAAAA)
  sexo?: XsdSexo;
  cargo?: string; // max 30 chars
}

export interface PessoaV2Input extends PessoaV1Input {
  situacao: XsdSituacaoPessoa; // Obrigatório na v2
}

export interface VeiculoV1Input {
  situacao: XsdSituacaoVeiculoV1;
  tipoVeiculo: XsdTipoVeiculo;
  chassi: string; // alfanumérico 17 posições
  ufPlaca: XsdEstado;
  cidadePlaca: string;
  numeroPlaca: string; // [a-zA-Z]{3}[0-9]{4}
  renavam: string; // numérico 1-12 posições
  modelo: string;
  marca: XsdMarca;
  anoFabricacao: number; // >= 1900
  dataAquisicao?: string; // YYYY-MM-DD
  inicioVigenciaContrato?: string;
  fimVigenciaContrato?: string;
}

export interface VeiculoV2Input {
  tipoVeiculo: XsdTipoVeiculo;
  situacao: XsdSituacaoVeiculoV2;
  chassi: string;
  renavam: string;
  modelo: string;
  marca: XsdMarca;
  anoFabricacao: number;
  tipoPropriedade: XsdTipoPropriedade;
  ufPlaca?: XsdEstado;
  cidadePlaca?: string;
  numeroPlaca?: string;
  numeroPlacaMercosul?: string; // [a-zA-Z]{3}[0-9]{1}[a-zA-Z]{1}[0-9]{2}
  dataAquisicao?: string;
  inicioVigenciaContrato?: string;
  fimVigenciaContrato?: string;
}

export interface AlunoInput {
  cpf: string; // 11 dígitos
  logradouroEndereco: string; // max 150 chars
  bairroEndereco: string; // max 70 chars
  ufEndereco: XsdEstado;
  municipioEndereco: string;
  cepEndereco: string; // 8 dígitos
  telefone1: string; // 10-11 dígitos
  nomePai?: string; // max 60 chars
  nomeSocial?: string; // max 60 chars
  telefone2?: string; // 10-11 dígitos
}

// ─── Date Conversion ────────────────────────────────────────────

/**
 * Converte data YYYY-MM-DD para DDMMAAAA (formato GESP)
 */
export function toGespDate(isoDate: string): string {
  if (!isoDate) return "";
  // Already in DDMMAAAA format?
  if (/^\d{8}$/.test(isoDate)) return isoDate;
  // YYYY-MM-DD → DDMMAAAA
  const parts = isoDate.split("-");
  if (parts.length !== 3) throw new Error(`Data inválida: ${isoDate}. Formato esperado: YYYY-MM-DD`);
  const [year, month, day] = parts;
  return `${day}${month}${year}`;
}

/**
 * Converte data DDMMAAAA para YYYY-MM-DD
 */
export function fromGespDate(gespDate: string): string {
  if (!gespDate || gespDate.length !== 8) return "";
  const day = gespDate.substring(0, 2);
  const month = gespDate.substring(2, 4);
  const year = gespDate.substring(4, 8);
  return `${year}-${month}-${day}`;
}

// ─── XML Escape ─────────────────────────────────────────────────

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlElement(name: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  return `    <${name}>${xmlEscape(String(value))}</${name}>`;
}

// ─── Validation ─────────────────────────────────────────────────

function validateCpf(cpf: string): void {
  if (!/^[0-9]{11}$/.test(cpf)) {
    throw new Error(`CPF inválido: "${cpf}". Deve ter 11 dígitos numéricos.`);
  }
}

function validateChassi(chassi: string): void {
  if (!/^[a-zA-Z0-9]{17}$/.test(chassi)) {
    throw new Error(`Chassi inválido: "${chassi}". Deve ter 17 caracteres alfanuméricos.`);
  }
}

function validateRenavam(renavam: string): void {
  if (!/^[0-9]{1,12}$/.test(renavam)) {
    throw new Error(`RENAVAM inválido: "${renavam}". Deve ter 1-12 dígitos numéricos.`);
  }
}

function validatePlaca(placa: string): void {
  if (!/^[a-zA-Z]{3}[0-9]{4}$/.test(placa)) {
    throw new Error(`Placa inválida: "${placa}". Formato esperado: XXX9999`);
  }
}

function validatePlacaMercosul(placa: string): void {
  if (!/^[a-zA-Z]{3}[0-9]{1}[a-zA-Z]{1}[0-9]{2}$/.test(placa)) {
    throw new Error(`Placa Mercosul inválida: "${placa}". Formato esperado: XXX9X99`);
  }
}

function validateNome(nome: string, maxLen: number = 60): void {
  if (!nome || nome.trim().length === 0) throw new Error("Nome não pode ser vazio.");
  if (nome.length > maxLen) throw new Error(`Nome excede ${maxLen} caracteres: "${nome}"`);
}

function validatePis(pis: string): void {
  if (!/^(.{0}|[0-9]{11})$/.test(pis)) {
    throw new Error(`PIS inválido: "${pis}". Deve ter 11 dígitos ou ser vazio/zero.`);
  }
}

function validateCep(cep: string): void {
  if (!/^[0-9]{8}$/.test(cep)) {
    throw new Error(`CEP inválido: "${cep}". Deve ter 8 dígitos numéricos.`);
  }
}

function validateTelefone(tel: string): void {
  if (!/^[0-9]{10,11}$/.test(tel)) {
    throw new Error(`Telefone inválido: "${tel}". Deve ter 10-11 dígitos numéricos (DDD + número).`);
  }
}

function validateEstado(uf: string): void {
  if (!XSD_ESTADOS.includes(uf as XsdEstado)) {
    throw new Error(`UF inválida: "${uf}". Valores válidos: ${XSD_ESTADOS.join(", ")}`);
  }
}

function validateMarca(marca: string): void {
  if (!XSD_MARCAS.includes(marca as XsdMarca)) {
    throw new Error(`Marca inválida: "${marca}". Valores válidos: ${XSD_MARCAS.join(", ")}`);
  }
}

// ─── Pessoa XML Generation ─────────────────────────────────────

/**
 * Gera XML de Pessoa v1.0 para importação no GESP
 */
export function generatePessoaV1Xml(pessoas: PessoaV1Input[]): string {
  if (pessoas.length === 0) throw new Error("Lista de pessoas vazia.");

  for (const p of pessoas) {
    validateCpf(p.cpf);
    validateNome(p.nome);
    if (p.pis) validatePis(p.pis);
    if (p.cargo && p.cargo.length > 30) {
      throw new Error(`Cargo excede 30 caracteres: "${p.cargo}"`);
    }
  }

  const elements = pessoas.map((p) => {
    const parts = [
      `  <pessoa>`,
      xmlElement("vinculoEmpregaticio", p.vinculoEmpregaticio),
      xmlElement("cpf", p.cpf),
      xmlElement("nome", p.nome),
    ];
    if (p.pis !== undefined) parts.push(xmlElement("pis", p.pis));
    if (p.dataAdmissao) parts.push(xmlElement("dataAdmissao", toGespDate(p.dataAdmissao)));
    if (p.sexo) parts.push(xmlElement("sexo", p.sexo.toUpperCase()));
    if (p.cargo) parts.push(xmlElement("cargo", p.cargo));
    parts.push(`  </pessoa>`);
    return parts.filter(Boolean).join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<pessoa-array>`,
    ...elements,
    `</pessoa-array>`,
  ].join("\n");
}

/**
 * Gera XML de Pessoa v2.0 para importação no GESP
 * Diferença: campo `situacao` é obrigatório
 */
export function generatePessoaV2Xml(pessoas: PessoaV2Input[]): string {
  if (pessoas.length === 0) throw new Error("Lista de pessoas vazia.");

  for (const p of pessoas) {
    validateCpf(p.cpf);
    validateNome(p.nome);
    if (p.pis) validatePis(p.pis);
    if (p.cargo && p.cargo.length > 30) {
      throw new Error(`Cargo excede 30 caracteres: "${p.cargo}"`);
    }
    if (![5, 8].includes(p.situacao)) {
      throw new Error(`Situação pessoa inválida: ${p.situacao}. Deve ser 5 (Ativo) ou 8 (Afastado INSS).`);
    }
  }

  const elements = pessoas.map((p) => {
    const parts = [
      `  <pessoa>`,
      xmlElement("vinculoEmpregaticio", p.vinculoEmpregaticio),
      xmlElement("cpf", p.cpf),
      xmlElement("nome", p.nome),
    ];
    if (p.pis !== undefined) parts.push(xmlElement("pis", p.pis));
    if (p.dataAdmissao) parts.push(xmlElement("dataAdmissao", toGespDate(p.dataAdmissao)));
    if (p.sexo) parts.push(xmlElement("sexo", p.sexo.toUpperCase()));
    if (p.cargo) parts.push(xmlElement("cargo", p.cargo));
    parts.push(xmlElement("situacao", p.situacao));
    parts.push(`  </pessoa>`);
    return parts.filter(Boolean).join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<pessoa-array-v2>`,
    ...elements,
    `</pessoa-array-v2>`,
  ].join("\n");
}

// ─── Veículo XML Generation ────────────────────────────────────

/**
 * Gera XML de Veículo v1.0 para importação no GESP
 */
export function generateVeiculoV1Xml(veiculos: VeiculoV1Input[]): string {
  if (veiculos.length === 0) throw new Error("Lista de veículos vazia.");

  for (const v of veiculos) {
    validateChassi(v.chassi);
    validateRenavam(v.renavam);
    validatePlaca(v.numeroPlaca);
    validateEstado(v.ufPlaca);
    validateMarca(v.marca);
    if (v.anoFabricacao < 1900) throw new Error(`Ano fabricação inválido: ${v.anoFabricacao}`);
  }

  const elements = veiculos.map((v) => {
    const parts = [
      `  <veiculo>`,
      xmlElement("situacao", v.situacao),
    ];
    if (v.dataAquisicao) parts.push(xmlElement("dataAquisicao", toGespDate(v.dataAquisicao)));
    if (v.inicioVigenciaContrato) parts.push(xmlElement("inicioVigenciaContrato", toGespDate(v.inicioVigenciaContrato)));
    if (v.fimVigenciaContrato) parts.push(xmlElement("fimVigenciaContrato", toGespDate(v.fimVigenciaContrato)));
    parts.push(xmlElement("tipoVeiculo", v.tipoVeiculo));
    parts.push(xmlElement("chassi", v.chassi));
    parts.push(xmlElement("ufPlaca", v.ufPlaca));
    parts.push(xmlElement("cidadePlaca", v.cidadePlaca));
    parts.push(xmlElement("numeroPlaca", v.numeroPlaca));
    parts.push(xmlElement("renavam", v.renavam));
    parts.push(xmlElement("modelo", v.modelo));
    parts.push(xmlElement("marca", v.marca));
    parts.push(xmlElement("anoFabricacao", v.anoFabricacao));
    parts.push(`  </veiculo>`);
    return parts.filter(Boolean).join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<veiculo-array>`,
    ...elements,
    `</veiculo-array>`,
  ].join("\n");
}

/**
 * Gera XML de Veículo v2.0 para importação no GESP
 * Diferença: tipoPropriedade obrigatório, suporte placa Mercosul
 */
export function generateVeiculoV2Xml(veiculos: VeiculoV2Input[]): string {
  if (veiculos.length === 0) throw new Error("Lista de veículos vazia.");

  for (const v of veiculos) {
    validateChassi(v.chassi);
    validateRenavam(v.renavam);
    validateMarca(v.marca);
    if (v.anoFabricacao < 1900) throw new Error(`Ano fabricação inválido: ${v.anoFabricacao}`);
    if (v.numeroPlaca) validatePlaca(v.numeroPlaca);
    if (v.numeroPlacaMercosul) validatePlacaMercosul(v.numeroPlacaMercosul);
    if (v.ufPlaca) validateEstado(v.ufPlaca);
  }

  const elements = veiculos.map((v) => {
    const parts = [
      `  <veiculo>`,
      xmlElement("tipoVeiculo", v.tipoVeiculo),
      xmlElement("situacao", v.situacao),
      xmlElement("chassi", v.chassi),
    ];
    if (v.ufPlaca) parts.push(xmlElement("ufPlaca", v.ufPlaca));
    if (v.cidadePlaca) parts.push(xmlElement("cidadePlaca", v.cidadePlaca));
    if (v.numeroPlaca) parts.push(xmlElement("numeroPlaca", v.numeroPlaca));
    parts.push(xmlElement("renavam", v.renavam));
    parts.push(xmlElement("modelo", v.modelo));
    parts.push(xmlElement("marca", v.marca));
    parts.push(xmlElement("anoFabricacao", v.anoFabricacao));
    parts.push(xmlElement("tipoPropriedade", v.tipoPropriedade));
    if (v.dataAquisicao) parts.push(xmlElement("dataAquisicao", toGespDate(v.dataAquisicao)));
    if (v.inicioVigenciaContrato) parts.push(xmlElement("inicioVigenciaContrato", toGespDate(v.inicioVigenciaContrato)));
    if (v.fimVigenciaContrato) parts.push(xmlElement("fimVigenciaContrato", toGespDate(v.fimVigenciaContrato)));
    if (v.numeroPlacaMercosul) parts.push(xmlElement("numeroPlacaMercosul", v.numeroPlacaMercosul));
    parts.push(`  </veiculo>`);
    return parts.filter(Boolean).join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<veiculo-array-v2>`,
    ...elements,
    `</veiculo-array-v2>`,
  ].join("\n");
}

// ─── Aluno XML Generation ──────────────────────────────────────

/**
 * Gera XML de Aluno para importação no GESP (turmas)
 * Max 60 alunos por turma conforme manual GESP
 */
export function generateAlunoXml(alunos: AlunoInput[]): string {
  if (alunos.length === 0) throw new Error("Lista de alunos vazia.");
  if (alunos.length > 60) throw new Error(`Máximo 60 alunos por turma. Recebido: ${alunos.length}`);

  for (const a of alunos) {
    validateCpf(a.cpf);
    if (a.logradouroEndereco && a.logradouroEndereco.length > 150) {
      throw new Error(`Endereço excede 150 caracteres para CPF ${a.cpf}`);
    }
    if (a.bairroEndereco && a.bairroEndereco.length > 70) {
      throw new Error(`Bairro excede 70 caracteres para CPF ${a.cpf}`);
    }
    validateEstado(a.ufEndereco);
    validateCep(a.cepEndereco);
    validateTelefone(a.telefone1);
    if (a.telefone2) validateTelefone(a.telefone2);
    if (a.nomePai) validateNome(a.nomePai);
    if (a.nomeSocial) validateNome(a.nomeSocial);
  }

  const elements = alunos.map((a) => {
    const parts = [
      `  <aluno>`,
      xmlElement("cpf", a.cpf),
      xmlElement("logradouroEndereco", a.logradouroEndereco),
      xmlElement("bairroEndereco", a.bairroEndereco),
      xmlElement("ufEndereco", a.ufEndereco),
      xmlElement("municipioEndereco", a.municipioEndereco),
      xmlElement("cepEndereco", a.cepEndereco),
      xmlElement("telefone1", a.telefone1),
    ];
    if (a.nomePai) parts.push(xmlElement("nomePai", a.nomePai));
    if (a.nomeSocial) parts.push(xmlElement("nomeSocial", a.nomeSocial));
    if (a.telefone2) parts.push(xmlElement("telefone2", a.telefone2));
    parts.push(`  </aluno>`);
    return parts.filter(Boolean).join("\n");
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<aluno-array>`,
    ...elements,
    `</aluno-array>`,
  ].join("\n");
}
