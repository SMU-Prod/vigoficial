import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * GET /api/prospects/dou-painel
 *
 * Painel completo de inteligência DOU — retorna prospects com:
 * - Dados cadastrais completos (endereço, CNAE, capital, contatos)
 * - Alvarás com itens liberados detalhados
 * - Publicações originais do DOU
 * - Alertas gerados
 * - Atividades de prospecção
 * - Emails enviados (outreach)
 * - Estatísticas globais de armas/munições/equipamentos
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const uf = searchParams.get("uf") || undefined;
    const tipoAlvara = searchParams.get("tipo_alvara") || undefined;
    const source = searchParams.get("source") || undefined;
    const status = searchParams.get("status") || undefined;
    const temperatura = searchParams.get("temperatura") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const supabase = createSupabaseAdmin();

    // =========================================================================
    // 1. Buscar prospects que têm alvarás vinculados OU source = "dou"
    // =========================================================================
    let alvaraProspectIds: string[] = [];
    {
      const { data } = await supabase
        .from("dou_alvaras")
        .select("prospect_id")
        .not("prospect_id", "is", null);

      if (data) {
        alvaraProspectIds = [...new Set(data.map((a) => a.prospect_id!))];
      }
    }

    let query = supabase
      .from("prospects")
      .select("*", { count: "exact" });

    if (source === "dou") {
      query = query.eq("source", "dou");
    } else if (alvaraProspectIds.length > 0) {
      query = query.or(`source.eq.dou,id.in.(${alvaraProspectIds.join(",")})`);
    } else {
      query = query.eq("source", "dou");
    }

    if (search) {
      query = query.or(`razao_social.ilike.%${search}%,cnpj.ilike.%${search}%,nome_fantasia.ilike.%${search}%`);
    }
    if (uf) query = query.eq("uf", uf);
    if (status) query = query.eq("status", status);
    if (temperatura) query = query.eq("temperatura", temperatura);

    query = query
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: prospects, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!prospects || prospects.length === 0) {
      return NextResponse.json({
        prospects: [],
        total: 0,
        resumo: {
          total: 0, novos: 0, contatados: 0, qualificados: 0,
          comAlvara: 0, semEmail: 0, totalAlvaras: 0, totalAlertas: 0,
          emailsEnviados: 0, ufs: [],
          armasTotal: 0, municoesTotal: 0, coleteTotal: 0,
          porTipoAlvara: {}, porUf: {}, porTemperatura: {},
        },
      });
    }

    // =========================================================================
    // 2. Buscar dados relacionados em paralelo
    // =========================================================================
    const prospectIds = prospects.map((p) => p.id);
    const cnpjs = prospects.map((p) => p.cnpj).filter(Boolean);

    const [
      { data: alvaras },
      { data: alertas },
      { data: atividades },
      { data: emailsEnviados },
    ] = await Promise.all([
      // Alvarás vinculados
      supabase
        .from("dou_alvaras")
        .select(`
          id, razao_social, cnpj, cnpj_limpo, uf, municipio,
          tipo_alvara, subtipo, numero_processo, delegacia,
          itens_liberados, validade_dias, data_validade, texto_original,
          company_id, prospect_id, notificado, created_at, publicacao_id
        `)
        .or(`prospect_id.in.(${prospectIds.join(",")}),cnpj_limpo.in.(${cnpjs.join(",")})`)
        .order("created_at", { ascending: false }),

      // Alertas
      supabase
        .from("dou_alertas")
        .select("id, prospect_id, cnpj, tipo_alerta, titulo, mensagem, prioridade, status, created_at")
        .or(`prospect_id.in.(${prospectIds.join(",")}),cnpj.in.(${cnpjs.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(500),

      // Atividades
      supabase
        .from("prospect_activities")
        .select("id, prospect_id, tipo, descricao, resultado, created_at, realizado_por")
        .in("prospect_id", prospectIds)
        .order("created_at", { ascending: false })
        .limit(1000),

      // Emails enviados (outreach)
      supabase
        .from("email_outbound")
        .select("id, to_email, template_id, subject, status, erro_detalhe, created_at, sent_at")
        .in("to_email", prospects.map((p) => p.email || p.contato_email).filter(Boolean))
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    // Buscar publicações dos alvarás
    const pubIds = [...new Set((alvaras || []).map((a) => a.publicacao_id).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let publicacoes: Record<string, any> = {};
    if (pubIds.length > 0) {
      const { data: pubs } = await supabase
        .from("dou_publicacoes")
        .select("id, titulo, tipo_ato, numero_ato, data_publicacao, secao, pagina, url_publicacao, orgao_principal, orgao_subordinado, resumo, assinante, cargo_assinante")
        .in("id", pubIds);

      if (pubs) {
        publicacoes = Object.fromEntries(pubs.map((p) => [p.id, p]));
      }
    }

    // =========================================================================
    // 3. Montar resposta enriquecida por empresa
    // =========================================================================
    let armasGlobal = 0, municoesGlobal = 0, coleteGlobal = 0, equipGlobal = 0;
    const porTipoAlvara: Record<string, number> = {};
    const porUf: Record<string, number> = {};
    const porTemperatura: Record<string, number> = {};

    const enriched = prospects.map((prospect) => {
      const cnpjLimpo = prospect.cnpj?.replace(/\D/g, "") || "";
      const prospectEmail = prospect.email || prospect.contato_email;

      // Alvarás desta empresa
      const prospectAlvaras = (alvaras || []).filter(
        (a) => a.prospect_id === prospect.id || a.cnpj_limpo === cnpjLimpo
      );

      // Alertas
      const prospectAlertas = (alertas || []).filter(
        (a) => a.prospect_id === prospect.id || a.cnpj === cnpjLimpo
      );

      // Atividades
      const prospectAtividades = (atividades || []).filter(
        (a) => a.prospect_id === prospect.id
      );

      // Emails enviados para este prospect
      const prospectEmails = prospectEmail
        ? (emailsEnviados || []).filter((e) => e.to_email === prospectEmail)
        : [];

      // Enriquecer alvarás com publicação
      const alvarasEnriquecidos = prospectAlvaras.map((alvara) => ({
        ...alvara,
        publicacao: alvara.publicacao_id ? publicacoes[alvara.publicacao_id] || null : null,
      }));

      // Contagem detalhada de itens
      const todosItens = prospectAlvaras.flatMap((a) => a.itens_liberados || []);
      const resumoItens: Record<string, number> = {};
      const itensDetalhados: Array<{ tipo: string; descricao: string; quantidade: number; calibre?: string; modelo?: string }> = [];
      let armasEmpresa = 0, municoesEmpresa = 0, coleteEmpresa = 0;

      for (const item of todosItens) {
        const tipo = (item.tipo || "outro").toLowerCase();
        const qtd = item.quantidade || 1;
        resumoItens[tipo] = (resumoItens[tipo] || 0) + qtd;
        itensDetalhados.push({
          tipo,
          descricao: item.descricao,
          quantidade: qtd,
          calibre: item.calibre,
          modelo: item.modelo,
        });

        if (tipo === "arma" || tipo === "arma_de_fogo") { armasEmpresa += qtd; armasGlobal += qtd; }
        else if (tipo === "municao" || tipo === "munição") { municoesEmpresa += qtd; municoesGlobal += qtd; }
        else if (tipo === "colete" || tipo === "colete_balistico") { coleteEmpresa += qtd; coleteGlobal += qtd; }
        else { equipGlobal += qtd; }
      }

      // Estatísticas globais
      for (const a of prospectAlvaras) {
        porTipoAlvara[a.tipo_alvara] = (porTipoAlvara[a.tipo_alvara] || 0) + 1;
      }
      if (prospect.uf) porUf[prospect.uf] = (porUf[prospect.uf] || 0) + 1;
      porTemperatura[prospect.temperatura] = (porTemperatura[prospect.temperatura] || 0) + 1;

      // Datas calculadas
      const primeiroAlvara = prospectAlvaras.length > 0
        ? prospectAlvaras[prospectAlvaras.length - 1].created_at
        : null;
      const ultimoAlvara = prospectAlvaras[0]?.created_at || null;

      // Próximo vencimento
      const vencimentos = prospectAlvaras
        .map((a) => a.data_validade)
        .filter(Boolean)
        .sort();
      const proximoVencimento = vencimentos.find((v) => new Date(v!) > new Date()) || null;

      return {
        // Dados cadastrais completos
        id: prospect.id,
        cnpj: prospect.cnpj,
        razao_social: prospect.razao_social,
        nome_fantasia: prospect.nome_fantasia,
        cnae_principal: prospect.cnae_principal,
        cnae_descricao: prospect.cnae_descricao,
        data_abertura: prospect.data_abertura,
        capital_social: prospect.capital_social,
        porte: prospect.porte,
        // Endereço
        logradouro: prospect.logradouro,
        numero: prospect.numero,
        complemento: prospect.complemento,
        bairro: prospect.bairro,
        cep: prospect.cep,
        municipio: prospect.municipio,
        uf: prospect.uf,
        // Contatos
        telefone1: prospect.telefone1,
        telefone2: prospect.telefone2,
        email: prospect.email,
        contato_nome: prospect.contato_nome,
        contato_cargo: prospect.contato_cargo,
        contato_telefone: prospect.contato_telefone,
        contato_email: prospect.contato_email,
        // CRM
        status: prospect.status,
        source: prospect.source,
        segmento: prospect.segmento,
        temperatura: prospect.temperatura,
        score: prospect.score,
        plano_interesse: prospect.plano_interesse,
        valor_estimado: prospect.valor_estimado,
        ultimo_contato: prospect.ultimo_contato,
        proximo_followup: prospect.proximo_followup,
        notas: prospect.notas,
        tags: prospect.tags,
        created_at: prospect.created_at,
        updated_at: prospect.updated_at,
        // Dados DOU
        alvaras: alvarasEnriquecidos,
        alertas: prospectAlertas,
        atividades: prospectAtividades,
        emails: prospectEmails,
        // Resumos calculados
        resumo: {
          total_alvaras: prospectAlvaras.length,
          total_alertas: prospectAlertas.length,
          total_atividades: prospectAtividades.length,
          total_emails: prospectEmails.length,
          emails_enviados: prospectEmails.filter((e) => e.status === "enviado").length,
          itens_liberados: resumoItens,
          itens_detalhados: itensDetalhados,
          armas: armasEmpresa,
          municoes: municoesEmpresa,
          coletes: coleteEmpresa,
          ultimo_alvara: ultimoAlvara,
          primeiro_alvara: primeiroAlvara,
          proximo_vencimento: proximoVencimento,
          tipos_alvara: [...new Set(prospectAlvaras.map((a) => a.tipo_alvara))],
          delegacias: [...new Set(prospectAlvaras.map((a) => a.delegacia).filter(Boolean))],
        },
      };
    });

    // Filtrar por tipo_alvara se solicitado
    let filtered = enriched;
    if (tipoAlvara) {
      filtered = enriched.filter((e) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e.alvaras.some((a: any) => a.tipo_alvara === tipoAlvara)
      );
    }

    // =========================================================================
    // 4. Resumo geral com estatísticas completas
    // =========================================================================
    const resumo = {
      total: count || filtered.length,
      novos: prospects.filter((p) => p.status === "novo").length,
      contatados: prospects.filter((p) => p.status === "contatado").length,
      qualificados: prospects.filter((p) => p.status === "qualificado").length,
      comAlvara: enriched.filter((e) => e.alvaras.length > 0).length,
      semEmail: prospects.filter((p) => !p.email && !p.contato_email).length,
      totalAlvaras: (alvaras || []).length,
      totalAlertas: (alertas || []).length,
      emailsEnviados: (emailsEnviados || []).filter((e) => e.status === "enviado").length,
      armasTotal: armasGlobal,
      municoesTotal: municoesGlobal,
      coleteTotal: coleteGlobal,
      equipamentosTotal: equipGlobal,
      porTipoAlvara,
      porUf,
      porTemperatura,
      ufs: [...new Set(prospects.map((p) => p.uf).filter(Boolean))].sort(),
    };

    return NextResponse.json({
      prospects: filtered,
      total: count || 0,
      resumo,
    });
  } catch (err) {
    console.error("Erro ao buscar painel DOU:", err);
    return NextResponse.json(
      { error: "Erro interno ao montar painel DOU" },
      { status: 500 }
    );
  }
}
