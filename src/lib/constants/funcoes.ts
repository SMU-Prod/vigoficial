/**
 * Constantes de Funções PF (Pessoa Física) para Vigilantes
 */

export const FUNCOES_PF = [
  { value: "Vigilante Patrimonial", label: "Vigilante Patrimonial" },
  { value: "Vigilante Armado", label: "Vigilante Armado" },
  { value: "Vigilante Desarmado", label: "Vigilante Desarmado" },
  { value: "Vigilante de Transporte de Valores", label: "Transporte de Valores" },
  { value: "Vigilante de Escolta Armada", label: "Escolta Armada" },
  { value: "Vigilante de Segurança Pessoal Privada", label: "Segurança Pessoal" },
  { value: "Vigilante de Grandes Eventos", label: "Grandes Eventos" },
];

export type FuncaoPF = (typeof FUNCOES_PF)[number];
