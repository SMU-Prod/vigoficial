/**
 * Ofícios PF — Templates plain text
 * PRD Regra R11: SEMPRE plain text para PF/DELESP, remetente = email da empresa
 * PRD Regra R12: Ofício vai para DELESP do estado onde o POSTO está
 */

interface OficioData {
  razaoSocial: string;
  cnpj: string;
  alvaraNumero: string;
  responsavelNome: string;
  responsavelCargo: string;
  cidade: string;
  uf: string;
  data: string; // DD/MM/YYYY
}

// ─────────────────────────────────────────────────────────────────────
// OF-A — Novo Posto de Serviço (Art. 192 Portaria 18.045/23)
// ─────────────────────────────────────────────────────────────────────
export function gerarOficioA(
  base: OficioData,
  posto: { nome: string; endereco: string; cidade: string; uf: string; vigilantes: number }
): string {
  return `OFÍCIO DE COMUNICAÇÃO DE ABERTURA DE POSTO DE SERVIÇO

À Delegacia de Controle de Segurança Privada - DELESP/${posto.uf}

${base.cidade}, ${base.data}

Prezados Senhores,

A empresa ${base.razaoSocial}, inscrita no CNPJ ${base.cnpj}, portadora do Alvará de Funcionamento nº ${base.alvaraNumero}, vem, por meio deste, comunicar a abertura de novo posto de serviço, conforme Art. 192 da Portaria 18.045/23-DG/PF:

DADOS DO POSTO:
Nome/Identificação: ${posto.nome}
Endereço completo: ${posto.endereco}
Cidade/UF: ${posto.cidade}/${posto.uf}
Quantidade de vigilantes designados: ${posto.vigilantes}

O cadastro correspondente foi realizado no GESP - Gestão Eletrônica de Segurança Privada.

Colocamo-nos à disposição para quaisquer esclarecimentos.

Atenciosamente,

${base.responsavelNome}
${base.responsavelCargo}
${base.razaoSocial}
CNPJ: ${base.cnpj}`;
}

// ─────────────────────────────────────────────────────────────────────
// OF-B — Compra ou Venda de Arma
// ─────────────────────────────────────────────────────────────────────
export function gerarOficioB(
  base: OficioData,
  arma: {
    evento: "compra" | "venda";
    tipo: string;
    marca: string;
    calibre: string;
    serie: string;
    contraparte: string;
    nf: string;
  }
): string {
  const acao = arma.evento === "compra" ? "AQUISIÇÃO" : "ALIENAÇÃO";
  const contraparteLabel = arma.evento === "compra" ? "Vendedor" : "Comprador";

  return `OFÍCIO DE COMUNICAÇÃO DE ${acao} DE ARMAMENTO

À Delegacia de Controle de Segurança Privada - DELESP/${base.uf}

${base.cidade}, ${base.data}

Prezados Senhores,

A empresa ${base.razaoSocial}, inscrita no CNPJ ${base.cnpj}, portadora do Alvará de Funcionamento nº ${base.alvaraNumero}, vem comunicar a ${acao.toLowerCase()} de armamento, conforme legislação vigente:

DADOS DO ARMAMENTO:
Tipo: ${arma.tipo}
Marca: ${arma.marca}
Calibre: ${arma.calibre}
Número de série: ${arma.serie}
${contraparteLabel}: ${arma.contraparte}
Nota Fiscal: ${arma.nf}

A atualização correspondente foi registrada no GESP.

Atenciosamente,

${base.responsavelNome}
${base.responsavelCargo}
${base.razaoSocial}
CNPJ: ${base.cnpj}`;
}

// ─────────────────────────────────────────────────────────────────────
// OF-C — Transporte de Armas/Equipamentos
// ─────────────────────────────────────────────────────────────────────
export function gerarOficioC(
  base: OficioData,
  transporte: {
    itens: string;
    origem: string;
    destino: string;
    dataTransporte: string;
    responsavel: string;
    veiculo?: string;
  }
): string {
  return `OFÍCIO DE COMUNICAÇÃO DE TRANSPORTE DE ARMAMENTO/EQUIPAMENTO

À Delegacia de Controle de Segurança Privada - DELESP/${base.uf}

${base.cidade}, ${base.data}

Prezados Senhores,

A empresa ${base.razaoSocial}, inscrita no CNPJ ${base.cnpj}, portadora do Alvará de Funcionamento nº ${base.alvaraNumero}, vem comunicar o transporte de armamento/equipamento conforme Portaria 18.045/23-DG/PF:

DADOS DO TRANSPORTE:
Itens: ${transporte.itens}
Origem: ${transporte.origem}
Destino: ${transporte.destino}
Data do transporte: ${transporte.dataTransporte}
Responsável: ${transporte.responsavel}
${transporte.veiculo ? `Veículo: ${transporte.veiculo}` : ""}

Solicitamos a devida autorização para o transporte acima descrito.

Atenciosamente,

${base.responsavelNome}
${base.responsavelCargo}
${base.razaoSocial}
CNPJ: ${base.cnpj}`;
}

// ─────────────────────────────────────────────────────────────────────
// OF-D — Divergência Cadastral + prints (Regra R1)
// ─────────────────────────────────────────────────────────────────────
export function gerarOficioD(
  base: OficioData,
  divergencia: {
    nomeVigilante: string;
    cpf: string;
    campoDiv: string;
    valorSistema: string;
    valorGesp: string;
  }
): string {
  return `OFÍCIO DE COMUNICAÇÃO DE DIVERGÊNCIA CADASTRAL

À Delegacia de Controle de Segurança Privada - DELESP/${base.uf}

${base.cidade}, ${base.data}

Prezados Senhores,

A empresa ${base.razaoSocial}, inscrita no CNPJ ${base.cnpj}, vem comunicar divergência cadastral detectada no GESP - Gestão Eletrônica de Segurança Privada, conforme detalhamento abaixo:

DADOS DA DIVERGÊNCIA:
Vigilante: ${divergencia.nomeVigilante}
CPF: ${divergencia.cpf}
Campo divergente: ${divergencia.campoDiv}
Valor no documento original: ${divergencia.valorSistema}
Valor registrado no GESP: ${divergencia.valorGesp}

IMPORTANTE: Em anexo seguem as evidências:
1. Print do documento original do vigilante
2. Print da tela do GESP mostrando o campo divergente
3. Print da mensagem de erro (se aplicável)

Conforme orientação normativa, NÃO foi realizada qualquer alteração ou adaptação de dados no GESP. Solicitamos orientação para regularização do cadastro.

Atenciosamente,

${base.responsavelNome}
${base.responsavelCargo}
${base.razaoSocial}
CNPJ: ${base.cnpj}`;
}

// ─────────────────────────────────────────────────────────────────────
// OF-E — Encerramento de Posto (Art. 192 Portaria 18.045/23)
// ─────────────────────────────────────────────────────────────────────
export function gerarOficioE(
  base: OficioData,
  posto: { nome: string; endereco: string; cidade: string; uf: string; dataEncerramento: string; motivo: string }
): string {
  return `OFÍCIO DE COMUNICAÇÃO DE ENCERRAMENTO DE POSTO DE SERVIÇO

À Delegacia de Controle de Segurança Privada - DELESP/${posto.uf}

${base.cidade}, ${base.data}

Prezados Senhores,

A empresa ${base.razaoSocial}, inscrita no CNPJ ${base.cnpj}, portadora do Alvará de Funcionamento nº ${base.alvaraNumero}, vem comunicar o encerramento de posto de serviço, conforme Art. 192 da Portaria 18.045/23-DG/PF:

DADOS DO POSTO ENCERRADO:
Nome/Identificação: ${posto.nome}
Endereço: ${posto.endereco}
Cidade/UF: ${posto.cidade}/${posto.uf}
Data de encerramento: ${posto.dataEncerramento}
Motivo: ${posto.motivo}

O encerramento foi registrado no GESP - Gestão Eletrônica de Segurança Privada. Os vigilantes anteriormente designados para este posto foram realocados conforme comunicação em separado.

Atenciosamente,

${base.responsavelNome}
${base.responsavelCargo}
${base.razaoSocial}
CNPJ: ${base.cnpj}`;
}
