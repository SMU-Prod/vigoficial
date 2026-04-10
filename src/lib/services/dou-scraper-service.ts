import { createSupabaseAdmin } from "@/lib/supabase/server";
import type {
  DouPublicacao,
  DouAlvara,
  DouAlerta,
  ItemLiberado,
  TipoAlvara,
  SubtipoAlvara,
} from "@/types/database";

// =============================================================================
// VIGI — DOU Scraper Service
// Raspa Seção 1 do Diário Oficial da União filtrando por Polícia Federal
// Extrai cada alvará individualmente com CNPJ, empresa, itens, validade
// =============================================================================

const DOU_BASE = "https://www.in.gov.br";

// Seções do DOU a raspar. Seção 1 tem a maioria dos alvarás PF,
// mas Seções 2 e 3 podem conter despachos, decisões e retificações.
const DOU_SECTIONS = ["DO1", "DO2", "DO3"];

// Palavras-chave de segurança privada para filtro complementar ao hierarchyStr
// Útil quando a publicação não está sob "Polícia Federal" na hierarquia
// ATENÇÃO: NÃO usar termos genéricos como "vigilância" sozinho — casa com
// Vigilância Sanitária, ANVISA, etc. Sempre qualificar.
const SECURITY_KEYWORDS = [
  "segurança privada",
  "vigilância patrimonial",
  "vigilância armada",
  "vigilância orgânica",
  "empresa de vigilância",
  "serviços de vigilância",
  "vigilante",
  "alvará de funcionamento",
  "atividades de segurança",
  "empresa de segurança",
  "transporte de valores",
  "escolta armada",
  "segurança pessoal",
  "curso de formação de vigilante",
  "arma de fogo",
  "munição",
  "revólver",
  "pistola",
  "espingarda",
  "colete balístico",
  "certificado de vistoria",
  "plano de segurança",
  "coordenação-geral de controle de serviços e produtos",
  "cgcsp",
  "delesp",
  "sinarm",
  "cnv",
  "carteira nacional de vigilante",
];

// Termos que EXCLUEM a publicação mesmo se uma keyword for encontrada.
// Evita capturar Vigilância Sanitária, ANVISA, saúde, meio ambiente, etc.
const EXCLUSION_TERMS = [
  "vigilância sanitária",
  "vigilância epidemiológica",
  "vigilância em saúde",
  "vigilância ambiental",
  "anvisa",
  "agência nacional de vigilância",
  "ministério da saúde",
  "vigilância alimentar",
  "vigilância nutricional",
  "vigilância socioassistencial",
  "vigilância agropecuária",
];

const buildLeituraUrl = (date: string, section: string = "DO1") => {
  const [y, m, d] = date.split("-");
  const dataParam = `${d}-${m}-${y}`;
  return `${DOU_BASE}/leiturajornal?data=${dataParam}&secao=${section}`;
};

// Regex patterns
const CNPJ_REGEX = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/;
const PROCESSO_REGEX = /Processo\s+n[ºo°]?\s*([\d\/.\-]+)/i;
// Captura os dois formatos de delegacia:
// Formato 1: DELESP/DREX/SR/PF/SP (com /PF/ antes da UF)
// Formato 2: DPF/MOC/MG (DPF + sigla da cidade + UF)
const DELEGACIA_REGEX = /((?:DELESP|DREX|CV|SR)[\/A-Z]*\/PF\/[A-Z]{2}|DPF\/[A-Z]{2,4}\/[A-Z]{2})/;
const VALIDADE_REGEX = /[Vv]álido\s+por\s+(\d+)\s*\([^)]+\)\s*dias/;

interface ParsedAlvara {
  razao_social: string;
  cnpj: string;
  cnpj_limpo: string;
  uf: string | null;
  municipio: string | null;
  tipo_alvara: TipoAlvara;
  subtipo: SubtipoAlvara | null;
  numero_processo: string | null;
  delegacia: string | null;
  itens_liberados: ItemLiberado[];
  validade_dias: number | null;
  texto_original: string;
}

export class DouScraperService {
  private static supabase = createSupabaseAdmin();

  // =========================================================================
  // PRINCIPAL: Executa raspagem completa de uma data
  // =========================================================================
  static async scrapeDate(date: string): Promise<{
    publicacoes: number;
    alvaras: number;
    alertas: number;
    vinculados: number;
    erros: string[];
  }> {
    const startTime = Date.now();
    const runId = await this.createRun(date);
    const erros: string[] = [];

    try {
      // 1. Buscar TODAS as seções do DOU (DO1, DO2, DO3)
      const allPubLinks: Array<{ titulo: string; url: string; dou_id: string; slug: string; secao: string }> = [];

      for (const section of DOU_SECTIONS) {
        try {
          const leituraUrl = buildLeituraUrl(date, section);
          const leituraHtml = await this.fetchPage(leituraUrl);
          const sectionPubs = this.extractPublicationLinks(leituraHtml);

          // Adicionar seção de origem a cada publicação
          for (const pub of sectionPubs) {
            allPubLinks.push({ ...pub, secao: section });
          }
        } catch (sectionErr) {
          erros.push(`Erro ao raspar seção ${section}: ${(sectionErr as Error).message}`);
        }
      }

      // Deduplicar por dou_id (mesma publicação pode aparecer em múltiplas seções)
      const uniquePubs = new Map<string, typeof allPubLinks[0]>();
      for (const pub of allPubLinks) {
        if (!uniquePubs.has(pub.dou_id)) uniquePubs.set(pub.dou_id, pub);
      }
      const pubLinks = Array.from(uniquePubs.values());

      if (pubLinks.length === 0) {
        await this.finishRun(runId, "success", {
          publicacoes: 0, alvaras: 0, alertas: 0, vinculados: 0,
          duracao_ms: Date.now() - startTime,
        });
        return { publicacoes: 0, alvaras: 0, alertas: 0, vinculados: 0, erros: ["Nenhuma publicação de segurança privada encontrada nesta data"] };
      }

      let totalAlvaras = 0;
      let totalAlertas = 0;
      let totalVinculados = 0;

      for (const pub of pubLinks) {
        // Verificar deduplicação
        const exists = await this.publicationExists(pub.dou_id);
        if (exists) {
          erros.push(`Publicação ${pub.dou_id} já processada, pulando`);
          continue;
        }

        // 3. Raspar conteúdo completo da publicação
        const pubHtml = await this.fetchPage(pub.url);
        const content = this.parsePublicationPage(pubHtml);

        if (!content.paragraphs.length) {
          erros.push(`Publicação ${pub.titulo}: sem parágrafos encontrados`);
          continue;
        }

        // 4. Salvar publicação
        const pubRecord = await this.savePublication(pub, content, date);
        if (!pubRecord) {
          erros.push(`Erro ao salvar publicação ${pub.titulo}`);
          continue;
        }

        // 5. Agrupar parágrafos em blocos de alvará individual
        const blocks = this.groupIntoAlvaraBlocks(content.paragraphs);

        // 6. Parsear cada bloco
        for (const block of blocks) {
          try {
            const parsed = this.parseAlvaraBlock(block);
            if (!parsed) continue;

            // 7. Salvar alvará
            const saved = await this.saveAlvara(parsed, pubRecord);
            if (!saved) continue;
            totalAlvaras++;

            // 8. Vincular com empresa/prospect
            const vinculado = await this.vincularEmpresa(saved);
            if (vinculado) totalVinculados++;

            // 9. Gerar alerta
            const alerta = await this.gerarAlerta(saved, pubRecord);
            if (alerta) totalAlertas++;
          } catch (err) {
            erros.push(`Erro ao parsear bloco: ${(err as Error).message}`);
          }
        }

        // Marcar publicação como processada
        await this.supabase
          .from("dou_publicacoes")
          .update({ processado: true })
          .eq("id", pubRecord.id);
      }

      await this.finishRun(runId, "success", {
        publicacoes: pubLinks.length,
        alvaras: totalAlvaras,
        alertas: totalAlertas,
        vinculados: totalVinculados,
        duracao_ms: Date.now() - startTime,
      });

      return { publicacoes: pubLinks.length, alvaras: totalAlvaras, alertas: totalAlertas, vinculados: totalVinculados, erros };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      erros.push(msg);
      await this.finishRun(runId, "error", {
        erro: msg,
        duracao_ms: Date.now() - startTime,
      });
      return { publicacoes: 0, alvaras: 0, alertas: 0, vinculados: 0, erros };
    }
  }

  // =========================================================================
  // EXTRACT: Publicações da PF a partir do JSON embutido na página
  // A página leiturajornal contém <div id="params"> com JSON incluindo jsonArray
  // Cada item tem: title, urlTitle, hierarchyStr, content, pubDate, etc.
  // Filtramos por hierarchyStr contendo "Polícia Federal"
  // =========================================================================
  private static extractPublicationLinks(html: string): Array<{
    titulo: string;
    url: string;
    dou_id: string;
    slug: string;
  }> {
    const results: Array<{ titulo: string; url: string; dou_id: string; slug: string }> = [];

    // Extrair JSON do elemento <div id="params">...</div>
    const paramsMatch = html.match(/id="params"[^>]*>([\s\S]*?)<\/\w+>/);
    if (!paramsMatch) {
      console.error("DOU Scraper: elemento #params não encontrado na página");
      return results;
    }

    try {
      const paramsData = JSON.parse(paramsMatch[1].trim());
      const jsonArray = paramsData.jsonArray || [];

      // Filtrar por:
      // 1) hierarchyStr contendo "Polícia Federal" OU órgãos relacionados
      // 2) OU título/conteúdo contendo palavras-chave de segurança privada
      // Isso garante capturar publicações que não estão diretamente sob "Polícia Federal"
      // mas tratam de segurança privada (ex: CGCSP, DELESP, despachos de alvarás)
      const pfArticles = jsonArray.filter(
        (item: { hierarchyStr?: string; title?: string; content?: string }) => {
          const hierarchy = (item.hierarchyStr || "").toLowerCase();
          const title = (item.title || "").toLowerCase();
          const preview = (item.content || "").toLowerCase();
          const fullText = `${hierarchy} ${title} ${preview}`;

          // Match 1: hierarquia contém PF ou órgãos subordinados
          const hierarchyMatch =
            hierarchy.includes("polícia federal") ||
            hierarchy.includes("policia federal") ||
            hierarchy.includes("departamento de polícia federal") ||
            hierarchy.includes("cgcsp") ||
            hierarchy.includes("coordenação-geral de controle de serviços");

          // Match 2: título ou conteúdo contém palavras-chave de segurança
          const keywordMatch = SECURITY_KEYWORDS.some((kw) =>
            fullText.includes(kw)
          );

          // Exclusão: se contém termos de outros setores (sanitária, saúde, etc.), pula
          const isExcluded = EXCLUSION_TERMS.some((term) =>
            fullText.includes(term)
          );

          // Hierarquia PF nunca é excluída (é sempre relevante)
          // Keywords só passam se NÃO estiver na lista de exclusão
          return hierarchyMatch || (keywordMatch && !isExcluded);
        }
      );

      for (const item of pfArticles) {
        const urlTitle = item.urlTitle || "";
        // Extrair dou_id do urlTitle (último segmento numérico)
        const idMatch = urlTitle.match(/-(\d{6,})$/);
        const dou_id = idMatch ? idMatch[1] : urlTitle;

        results.push({
          titulo: item.title || urlTitle,
          url: `${DOU_BASE}/web/dou/-/${urlTitle}`,
          dou_id,
          slug: urlTitle,
        });
      }
    } catch (err) {
      console.error("DOU Scraper: erro ao parsear JSON de params:", err);

      // Fallback: regex nos links href (caso a estrutura mude)
      const linkRegex = /href="(?:https?:\/\/www\.in\.gov\.br)?(\/web\/dou\/-\/([^"]+)-(\d{6,}))"/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const path = match[1];
        const slug = match[2];
        const dou_id = match[3];
        const afterLink = html.substring(match.index, match.index + 500);
        const titleMatch = afterLink.match(/>([^<]+)</);
        results.push({
          titulo: titleMatch ? titleMatch[1].trim() : slug,
          url: `${DOU_BASE}${path}`,
          dou_id,
          slug,
        });
      }
    }

    // Deduplicar por dou_id
    const unique = new Map<string, typeof results[0]>();
    for (const r of results) {
      if (!unique.has(r.dou_id)) unique.set(r.dou_id, r);
    }

    return Array.from(unique.values());
  }

  // =========================================================================
  // PARSE: Conteúdo completo da página de uma publicação
  // =========================================================================
  private static parsePublicationPage(html: string): {
    titulo: string | null;
    paragraphs: string[];
    assinante: string | null;
    cargo: string | null;
    metaInfo: string | null;
  } {
    // Título: <p class="identifica">
    const tituloMatch = html.match(/<p\s+class="identifica"[^>]*>([\s\S]*?)<\/p>/i);
    const titulo = tituloMatch ? this.stripHtml(tituloMatch[1]).trim() : null;

    // Parágrafos: <p class="dou-paragraph">
    const paragraphs: string[] = [];
    const pRegex = /<p\s+class="dou-paragraph"[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(html)) !== null) {
      const text = this.stripHtml(pMatch[1]).trim();
      if (text) paragraphs.push(text);
    }

    // Assinante: <p class="assina">
    const assinaMatch = html.match(/<p\s+class="assina"[^>]*>([\s\S]*?)<\/p>/i);
    const assinante = assinaMatch ? this.stripHtml(assinaMatch[1]).trim() : null;

    // Cargo
    const cargoMatch = html.match(/<p\s+class="cargo"[^>]*>([\s\S]*?)<\/p>/i);
    const cargo = cargoMatch ? this.stripHtml(cargoMatch[1]).trim() : null;

    // Meta info (órgão, edição, página)
    const metaMatch = html.match(/Publicado\s+em:\s*([\s\S]*?)(?:<\/span|<br)/i);
    const metaInfo = metaMatch ? this.stripHtml(metaMatch[1]).trim() : null;

    return { titulo, paragraphs, assinante, cargo, metaInfo };
  }

  // =========================================================================
  // GROUP: Agrupar parágrafos em blocos de alvará individual
  // Cada alvará começa com "O(A) COORDENADOR(A)-GERAL"
  // =========================================================================
  private static groupIntoAlvaraBlocks(paragraphs: string[]): string[] {
    const blocks: string[] = [];
    let currentBlock: string[] = [];

    for (const p of paragraphs) {
      if (p.startsWith("O(A) COORDENADOR") && currentBlock.length > 0) {
        blocks.push(currentBlock.join("\n"));
        currentBlock = [];
      }
      currentBlock.push(p);
    }

    // Último bloco
    if (currentBlock.length > 0) {
      blocks.push(currentBlock.join("\n"));
    }

    return blocks;
  }

  // =========================================================================
  // PARSE: Bloco individual de alvará → dados estruturados
  // =========================================================================
  private static parseAlvaraBlock(bloco: string): ParsedAlvara | null {
    // CNPJ obrigatório
    const cnpjMatch = bloco.match(CNPJ_REGEX);
    if (!cnpjMatch) return null;

    const cnpj = cnpjMatch[0];
    const cnpj_limpo = cnpj.replace(/\D/g, "");

    // Razão Social: entre "empresa" e "CNPJ"
    let razao_social = "";
    const razaoMatch = bloco.match(
      /(?:empresa|à empresa|a empresa)\s+([^,]+?),?\s*CNPJ/i
    );
    if (razaoMatch) {
      razao_social = razaoMatch[1].trim().replace(/\s+/g, " ");
    } else {
      // Fallback: pegar texto entre "resolve:" e "CNPJ"
      const fallback = bloco.replace(/\n/g, " ").match(/resolve:\s*\w+\s+.*?(?:à|a)\s+(.+?),?\s*CNPJ/i);
      if (fallback) razao_social = fallback[1].trim().replace(/\s+/g, " ");
    }

    if (!razao_social || razao_social.length < 3) return null;

    // Município: extrair do "sediada em <Cidade>" ou "para atuar em <Estado>"
    let municipio: string | null = null;
    const localMatch = bloco.match(
      /sediada?\s+(?:em|no|na)\s+([^,]+?)(?:,|\s+para\s)/i
    );
    if (localMatch) {
      const localRaw = localMatch[1].trim();
      // Se o local é um nome de estado (ex: "Minas Gerais"), não é município
      const siglaLocal = this.estadoParaSigla(localRaw);
      if (!siglaLocal) {
        municipio = localRaw; // É cidade
      }
      // Se for estado, municipio fica null (cidade não mencionada no texto)
    }

    // UF da delegacia:
    //   Formato 1: .../PF/SP → captura SP
    //   Formato 2: DPF/MOC/MG → captura MG (última barra + 2 letras)
    //   Fallback: texto "sediada em <Estado>" → mapeia nome do estado para sigla
    let uf: string | null = null;
    const ufPF = bloco.match(/\/PF\/([A-Z]{2})/);
    if (ufPF) {
      uf = ufPF[1];
    } else {
      const ufDPF = bloco.match(/DPF\/[A-Z]{2,4}\/([A-Z]{2})/);
      if (ufDPF) {
        uf = ufDPF[1];
      } else {
        // Fallback: extrair do texto "sediada em <Estado/Cidade>"
        const sediadaMatch = bloco.match(/sediada?\s+(?:em|no|na)\s+([^,]+?)(?:,|\s+para\s)/i);
        if (sediadaMatch) {
          const local = sediadaMatch[1].trim();
          uf = this.estadoParaSigla(local);
        }
      }
    }

    // Tipo de ação
    const acaoMatch = bloco.match(/resolve:\s+(\w+)/i);
    const acao = acaoMatch ? acaoMatch[1].toUpperCase() : "CONCEDER";

    const tipo_alvara: TipoAlvara =
      acao === "CANCELAR" ? "cancelamento" :
      acao === "DECLARAR" ? "revisao" :
      acao === "RENOVAR" ? "renovacao" :
      "autorizacao";

    // Subtipo baseado no conteúdo
    const subtipo = this.detectSubtipo(bloco);

    // Processo
    const processoMatch = bloco.match(PROCESSO_REGEX);
    const numero_processo = processoMatch ? processoMatch[1] : null;

    // Delegacia
    const delegaciaMatch = bloco.match(DELEGACIA_REGEX);
    const delegacia = delegaciaMatch ? delegaciaMatch[1] : null;

    // Itens liberados
    const itens_liberados = this.extractItens(bloco);

    // Validade
    const validadeMatch = bloco.match(VALIDADE_REGEX);
    const validade_dias = validadeMatch ? parseInt(validadeMatch[1]) : null;

    return {
      razao_social,
      cnpj,
      cnpj_limpo,
      uf,
      municipio,
      tipo_alvara,
      subtipo,
      numero_processo,
      delegacia,
      itens_liberados,
      validade_dias,
      texto_original: bloco,
    };
  }

  // =========================================================================
  // EXTRACT: Itens liberados (armas, munições, etc.)
  // Padrão do DOU: "50 (cinquenta) Munições calibre 38"
  // =========================================================================
  private static extractItens(bloco: string): ItemLiberado[] {
    const itens: ItemLiberado[] = [];
    const lines = bloco.split("\n");

    for (const line of lines) {
      // Padrão: número (extenso) Descrição
      const match = line.match(/^(\d+)\s*\([^)]+\)\s+(.+)/);
      if (match) {
        const quantidade = parseInt(match[1]);
        const descricao = match[2].trim();

        // Classificar tipo
        const descLower = descricao.toLowerCase();
        let tipo = "equipamento";
        let calibre: string | undefined;

        if (descLower.includes("muni")) {
          tipo = "municao";
        } else if (descLower.includes("revólver") || descLower.includes("revolver")) {
          tipo = "arma_revolver";
        } else if (descLower.includes("pistola")) {
          tipo = "arma_pistola";
        } else if (descLower.includes("espingarda")) {
          tipo = "arma_espingarda";
        } else if (descLower.includes("carabina")) {
          tipo = "arma_carabina";
        } else if (descLower.includes("colete")) {
          tipo = "colete_balistico";
        } else if (descLower.includes("arma")) {
          tipo = "arma";
        }

        // Extrair calibre
        const calibreMatch = descricao.match(/calibre\s+([\d.,]+)/i);
        if (calibreMatch) calibre = calibreMatch[1];

        itens.push({ quantidade, descricao, tipo, calibre });
      }
    }

    return itens;
  }

  private static detectSubtipo(bloco: string): SubtipoAlvara | null {
    const lower = bloco.toLowerCase();
    if (lower.includes("adquirir") && lower.includes("muni")) return "aquisicao_municao";
    if (lower.includes("adquirir") && (lower.includes("revólver") || lower.includes("pistola") || lower.includes("espingarda") || lower.includes("carabina"))) return "aquisicao_arma";
    if (lower.includes("adquirir")) return "autorizacao_compra";
    if (lower.includes("transporte") || lower.includes("transportar")) return "transporte_arma";
    if (lower.includes("funcionamento")) return "funcionamento";
    if (lower.includes("porte")) return "porte_arma";
    return "outro";
  }

  // =========================================================================
  // SAVE: Publicação no banco
  // =========================================================================
  private static async savePublication(
    pub: { titulo: string; url: string; dou_id: string; slug: string; secao?: string },
    content: { titulo: string | null; paragraphs: string[]; assinante: string | null; cargo: string | null },
    date: string
  ): Promise<DouPublicacao | null> {
    const textoCompleto = content.paragraphs.join("\n");

    const { data, error } = await this.supabase
      .from("dou_publicacoes")
      .insert({
        titulo: content.titulo || pub.titulo,
        tipo_ato: "alvara",
        numero_ato: this.extractNumeroAto(pub.titulo),
        data_ato: this.extractDataAto(pub.titulo),
        data_publicacao: date,
        secao: pub.secao === "DO2" ? 2 : pub.secao === "DO3" ? 3 : 1,
        orgao_principal: "Ministério da Justiça e Segurança Pública",
        orgao_subordinado: "Polícia Federal",
        unidade: "Coordenação-Geral de Controle de Serviços e Produtos",
        texto_completo: textoCompleto,
        resumo: textoCompleto.substring(0, 500),
        url_publicacao: pub.url,
        slug: pub.slug,
        dou_id: pub.dou_id,
        assinante: content.assinante,
        cargo_assinante: content.cargo,
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao salvar publicação:", error.message);
      return null;
    }
    return data as DouPublicacao;
  }

  // =========================================================================
  // SAVE: Alvará individual
  // =========================================================================
  static async saveAlvara(parsed: ParsedAlvara, publicacao: DouPublicacao): Promise<DouAlvara | null> {
    const dataValidade = parsed.validade_dias
      ? this.addDays(publicacao.data_publicacao, parsed.validade_dias)
      : null;

    const { data, error } = await this.supabase
      .from("dou_alvaras")
      .insert({
        publicacao_id: publicacao.id,
        razao_social: parsed.razao_social,
        cnpj: parsed.cnpj,
        cnpj_limpo: parsed.cnpj_limpo,
        uf: parsed.uf,
        municipio: parsed.municipio,
        tipo_alvara: parsed.tipo_alvara,
        subtipo: parsed.subtipo,
        numero_processo: parsed.numero_processo,
        delegacia: parsed.delegacia,
        itens_liberados: parsed.itens_liberados,
        validade_dias: parsed.validade_dias,
        data_validade: dataValidade,
        texto_original: parsed.texto_original,
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao salvar alvará:", error.message);
      return null;
    }
    return data as DouAlvara;
  }

  // =========================================================================
  // VINCULAR: Conectar alvará com empresa/prospect do VIGI
  // =========================================================================
  static async vincularEmpresa(alvara: DouAlvara): Promise<boolean> {
    // Buscar por CNPJ nas companies
    const { data: company } = await this.supabase
      .from("companies")
      .select("id")
      .eq("cnpj", alvara.cnpj_limpo)
      .single();

    if (company) {
      await this.supabase
        .from("dou_alvaras")
        .update({ company_id: company.id })
        .eq("id", alvara.id);
      return true;
    }

    // Buscar nos prospects
    const { data: prospect } = await this.supabase
      .from("prospects")
      .select("id")
      .eq("cnpj", alvara.cnpj_limpo)
      .single();

    if (prospect) {
      await this.supabase
        .from("dou_alvaras")
        .update({ prospect_id: prospect.id })
        .eq("id", alvara.id);
      return true;
    }

    // =======================================================================
    // AUTO-CADASTRO: Empresa encontrada no DOU mas não existe em nenhuma base.
    // Cria prospect automaticamente com source="dou" para não perder leads.
    // =======================================================================
    if (alvara.cnpj_limpo) {
      const tipoScore: Record<string, number> = {
        autorizacao: 60, renovacao: 55, revisao: 50,
        transferencia: 45, cancelamento: 20, suspensao: 15,
      };
      const score = tipoScore[alvara.tipo_alvara] || 40;
      const temp = score >= 50 ? "morno" : "frio";

      const { data: newProspect, error: insertErr } = await this.supabase
        .from("prospects")
        .insert({
          cnpj: alvara.cnpj_limpo,
          razao_social: alvara.razao_social,
          uf: alvara.uf || null,
          municipio: alvara.municipio || null,
          status: "novo",
          source: "dou",
          temperatura: temp,
          segmento: null,
          score,
          tags: [`dou_auto`, alvara.tipo_alvara],
          notas: `Auto-cadastrado via DOU. Alvará: ${alvara.tipo_alvara}${alvara.subtipo ? ` (${alvara.subtipo})` : ""}. Processo: ${alvara.numero_processo || "N/I"}.`,
        })
        .select("id")
        .single();

      if (newProspect && !insertErr) {
        await this.supabase
          .from("dou_alvaras")
          .update({ prospect_id: newProspect.id })
          .eq("id", alvara.id);

        // Registrar atividade inicial
        await this.supabase.from("prospect_activities").insert({
          prospect_id: newProspect.id,
          tipo: "nota",
          descricao: `[Auto-DOU] Empresa detectada via alvará no DOU. Tipo: ${alvara.tipo_alvara}. CNPJ: ${alvara.cnpj}. Delegacia: ${alvara.delegacia || "N/I"}.`,
          realizado_por: "sistema_dou",
        });

        return true;
      }
    }

    return false;
  }

  // =========================================================================
  // ALERTA: Gerar alerta para a empresa/prospect
  // =========================================================================
  static async gerarAlerta(alvara: DouAlvara, publicacao: DouPublicacao): Promise<DouAlerta | null> {
    const tipoMap: Record<string, string> = {
      cancelamento: "cancelamento",
      renovacao: "renovacao",
      autorizacao: "novo_alvara",
      revisao: "novo_alvara",
      transferencia: "novo_alvara",
    };

    const tipoAlerta = tipoMap[alvara.tipo_alvara] || "novo_alvara";
    const prioridade = alvara.tipo_alvara === "cancelamento" ? "urgente" : "normal";

    const itensDesc = alvara.itens_liberados.length > 0
      ? alvara.itens_liberados.map((i: ItemLiberado) => `${i.quantidade}x ${i.descricao}`).join(", ")
      : "Ver detalhes completos";

    const titulo = `${alvara.tipo_alvara === "autorizacao" ? "Novo Alvará" : alvara.tipo_alvara.charAt(0).toUpperCase() + alvara.tipo_alvara.slice(1)} — ${alvara.razao_social}`;

    const mensagem = [
      `Empresa: ${alvara.razao_social}`,
      `CNPJ: ${alvara.cnpj}`,
      `UF: ${alvara.uf || "N/A"} | Município: ${alvara.municipio || "N/A"}`,
      `Tipo: ${alvara.tipo_alvara}${alvara.subtipo ? ` → ${alvara.subtipo.replace(/_/g, " ")}` : ""}`,
      `Processo: ${alvara.numero_processo || "N/A"}`,
      `Delegacia: ${alvara.delegacia || "N/A"}`,
      ``,
      `Itens liberados: ${itensDesc}`,
      alvara.validade_dias ? `Validade: ${alvara.validade_dias} dias (até ${alvara.data_validade})` : "",
      ``,
      `Publicado em: ${publicacao.data_publicacao} | DOU Seção 1`,
      `Link: ${publicacao.url_publicacao}`,
    ].filter(Boolean).join("\n");

    const { data, error } = await this.supabase
      .from("dou_alertas")
      .insert({
        alvara_id: alvara.id,
        publicacao_id: publicacao.id,
        company_id: alvara.company_id,
        prospect_id: alvara.prospect_id,
        cnpj: alvara.cnpj,
        razao_social: alvara.razao_social,
        tipo_alerta: tipoAlerta,
        titulo,
        mensagem,
        prioridade,
        status: "pendente",
        canal: "dashboard",
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao gerar alerta:", error.message);
      return null;
    }
    return data as DouAlerta;
  }

  // =========================================================================
  // CONSULTAS
  // =========================================================================

  static async getAlvarasByCnpj(cnpj: string): Promise<DouAlvara[]> {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const { data } = await this.supabase
      .from("dou_alvaras")
      .select("*, publicacao:dou_publicacoes(titulo, data_publicacao, url_publicacao, secao, edicao, pagina, assinante, cargo_assinante)")
      .eq("cnpj_limpo", cnpjLimpo)
      .order("created_at", { ascending: false });
    return (data || []) as DouAlvara[];
  }

  static async getAlvarasRecentes(limit: number = 50, filters?: {
    uf?: string; tipo?: string; search?: string; dataInicio?: string; dataFim?: string;
    offset?: number;
  }): Promise<{ data: DouAlvara[]; count: number }> {
    // Count query with same filters
    let countQuery = this.supabase
      .from("dou_alvaras")
      .select("id", { count: "exact", head: true });

    if (filters?.uf) countQuery = countQuery.eq("uf", filters.uf);
    if (filters?.tipo) countQuery = countQuery.eq("tipo_alvara", filters.tipo);
    if (filters?.search) countQuery = countQuery.or(`razao_social.ilike.%${filters.search}%,cnpj.ilike.%${filters.search}%`);
    if (filters?.dataInicio) countQuery = countQuery.gte("created_at", filters.dataInicio);
    if (filters?.dataFim) countQuery = countQuery.lte("created_at", filters.dataFim);

    const { count: totalCount } = await countQuery;

    // Data query with pagination
    let query = this.supabase
      .from("dou_alvaras")
      .select("*, publicacao:dou_publicacoes(titulo, data_publicacao, url_publicacao, secao, edicao, pagina, assinante, cargo_assinante)")
      .order("created_at", { ascending: false });

    if (filters?.uf) query = query.eq("uf", filters.uf);
    if (filters?.tipo) query = query.eq("tipo_alvara", filters.tipo);
    if (filters?.search) query = query.or(`razao_social.ilike.%${filters.search}%,cnpj.ilike.%${filters.search}%`);
    if (filters?.dataInicio) query = query.gte("created_at", filters.dataInicio);
    if (filters?.dataFim) query = query.lte("created_at", filters.dataFim);

    const offset = filters?.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data } = await query;
    return { data: (data || []) as DouAlvara[], count: totalCount || 0 };
  }

  static async getAlertasPendentes(limit: number = 50, offset: number = 0): Promise<{ data: DouAlerta[]; count: number }> {
    const { count: totalCount } = await this.supabase
      .from("dou_alertas")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente");

    const { data } = await this.supabase
      .from("dou_alertas")
      .select("*")
      .eq("status", "pendente")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    return { data: (data || []) as DouAlerta[], count: totalCount || 0 };
  }

  static async marcarAlertaEnviado(alertaId: string, canal: string): Promise<void> {
    await this.supabase
      .from("dou_alertas")
      .update({ status: "enviado", enviado_em: new Date().toISOString(), canal })
      .eq("id", alertaId);
  }

  static async getStats(): Promise<{
    totalPublicacoes: number;
    totalAlvaras: number;
    alvarasHoje: number;
    alertasPendentes: number;
    empresasVinculadas: number;
    prospectsVinculados: number;
    ultimaExecucao: string | null;
    ultimoStatus: string | null;
  }> {
    const hoje = new Date().toISOString().split("T")[0];

    const [pubCount, alvCount, alvHoje, alertPend, compVinc, prospVinc, lastRun] =
      await Promise.all([
        this.supabase.from("dou_publicacoes").select("id", { count: "exact", head: true }),
        this.supabase.from("dou_alvaras").select("id", { count: "exact", head: true }),
        this.supabase.from("dou_alvaras").select("id", { count: "exact", head: true }).gte("created_at", hoje),
        this.supabase.from("dou_alertas").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        this.supabase.from("dou_alvaras").select("id", { count: "exact", head: true }).not("company_id", "is", null),
        this.supabase.from("dou_alvaras").select("id", { count: "exact", head: true }).not("prospect_id", "is", null),
        this.supabase.from("dou_scraper_runs").select("finalizado_em, status").order("iniciado_em", { ascending: false }).limit(1).single(),
      ]);

    return {
      totalPublicacoes: pubCount.count || 0,
      totalAlvaras: alvCount.count || 0,
      alvarasHoje: alvHoje.count || 0,
      alertasPendentes: alertPend.count || 0,
      empresasVinculadas: compVinc.count || 0,
      prospectsVinculados: prospVinc.count || 0,
      ultimaExecucao: lastRun.data?.finalizado_em || null,
      ultimoStatus: lastRun.data?.status || null,
    };
  }

  static async getRuns(limit: number = 20) {
    const { data } = await this.supabase
      .from("dou_scraper_runs")
      .select("*")
      .order("iniciado_em", { ascending: false })
      .limit(limit);
    return data || [];
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private static async fetchPage(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "VIG-PRO-ComplianceMonitor/1.0",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ao acessar ${url}`);
    return res.text();
  }

  private static stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, " ").trim();
  }

  private static addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }

  /**
   * Converte nome de estado/cidade para sigla UF
   * Suporta: "São Paulo", "Minas Gerais", "Santa Catarina", "Distrito Federal", etc.
   */
  private static estadoParaSigla(local: string): string | null {
    const mapa: Record<string, string> = {
      "acre": "AC", "alagoas": "AL", "amapá": "AP", "amapa": "AP", "amazonas": "AM",
      "bahia": "BA", "ceará": "CE", "ceara": "CE", "distrito federal": "DF",
      "espírito santo": "ES", "espirito santo": "ES", "goiás": "GO", "goias": "GO",
      "maranhão": "MA", "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
      "minas gerais": "MG", "pará": "PA", "para": "PA", "paraíba": "PB", "paraiba": "PB",
      "paraná": "PR", "parana": "PR", "pernambuco": "PE", "piauí": "PI", "piaui": "PI",
      "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
      "rondônia": "RO", "rondonia": "RO", "roraima": "RR", "santa catarina": "SC",
      "são paulo": "SP", "sao paulo": "SP", "sergipe": "SE", "tocantins": "TO",
    };
    const lower = local.toLowerCase().trim();
    // Tenta match exato (nome do estado)
    if (mapa[lower]) return mapa[lower];
    // Tenta match parcial (cidade pode conter nome do estado)
    for (const [estado, sigla] of Object.entries(mapa)) {
      if (lower.includes(estado)) return sigla;
    }
    return null;
  }

  private static extractNumeroAto(titulo: string): string | null {
    const m = titulo.match(/N[ºo°]\s*([\d.,]+)/i);
    return m ? m[1] : null;
  }

  private static extractDataAto(titulo: string): string | null {
    const m = titulo.match(/de\s+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
    if (!m) return null;
    const meses: Record<string, string> = {
      janeiro: "01", fevereiro: "02", março: "03", marco: "03",
      abril: "04", maio: "05", junho: "06", julho: "07",
      agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
    };
    const mes = meses[m[2].toLowerCase()];
    return mes ? `${m[3]}-${mes}-${m[1].padStart(2, "0")}` : null;
  }

  private static async publicationExists(douId: string): Promise<boolean> {
    const { count } = await this.supabase
      .from("dou_publicacoes")
      .select("id", { count: "exact", head: true })
      .eq("dou_id", douId);
    return (count || 0) > 0;
  }

  private static async createRun(date: string): Promise<string> {
    const { data } = await this.supabase
      .from("dou_scraper_runs")
      .insert({ data_alvo: date, secao: 1, status: "running" })
      .select("id")
      .single();
    return data!.id;
  }

  private static async finishRun(runId: string, status: string, result: Record<string, unknown>): Promise<void> {
    await this.supabase.from("dou_scraper_runs").update({
      status,
      publicacoes_encontradas: (result.publicacoes as number) || 0,
      alvaras_extraidos: (result.alvaras as number) || 0,
      alertas_gerados: (result.alertas as number) || 0,
      empresas_vinculadas: (result.vinculados as number) || 0,
      erro: (result.erro as string) || null,
      finalizado_em: new Date().toISOString(),
      duracao_ms: (result.duracao_ms as number) || 0,
    }).eq("id", runId);
  }
}
