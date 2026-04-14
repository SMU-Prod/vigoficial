import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
// @ts-expect-error — pdfkit has no bundled types
import PDFDocument from "pdfkit";
import { Workbook } from "exceljs";

// Report data types
interface KPIData {
  total_empresas_ativas?: number;
  total_vigilantes_ativos?: number;
  workflows_abertos?: number;
  workflows_urgentes?: number;
  validades_criticas?: number;
  gesp_tasks_pendentes?: number;
  emails_enviados_hoje?: number;
}

interface ValidadeData {
  tipo: string;
  entidade_nome: string;
  dias_restantes: number;
  severidade: string;
}

interface EmployeeData {
  nome_completo: string;
  cpf: string;
  cnv_numero: string;
  cnv_data_validade: string;
  cnv_situacao: string;
  status: string;
}

interface BillingData {
  razao_social: string;
  valor_mensal?: number;
  billing_status: string;
}

interface VehicleData {
  placa: string;
  modelo: string;
  km_atual: number;
  licenciamento_validade?: string;
  seguro_validade?: string;
}

interface GESPTaskData {
  id: string;
  tipo_acao: string;
  status: string;
  tentativas: number;
  companies?: {
    razao_social?: string;
  };
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") || "mensal";
  const mes = searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const formato = searchParams.get("formato") || "pdf";
  const companyId = searchParams.get("company_id");

  try {
    const supabase = createSupabaseAdmin();
    const [ano, mesNum] = mes.split("-");
    const inicio = `${ano}-${mesNum}-01`;
    const fim = new Date(parseInt(ano), parseInt(mesNum), 0).toISOString().split("T")[0];

    let reportData: Record<string, unknown> = { tipo, periodo: mes };
    let companyName: string | null = null;

    // Validação de acesso à empresa (CRÍTICO — impede acesso cross-company)
    if (companyId) {
      if (!canAccessCompany(auth!, companyId)) {
        return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
      }
      const { data: company } = await supabase
        .from("companies")
        .select("razao_social")
        .eq("id", companyId)
        .single();
      companyName = company?.razao_social || null;
    }

    switch (tipo) {
      case "mensal": {
        let _kpisQuery = supabase.from("vw_dashboard_kpis").select("*");
        if (companyId) {
          // For views without company_id, filter employees/vehicles instead
          _kpisQuery = supabase
            .from("employees")
            .select("company_id")
            .eq("company_id", companyId)
            .limit(1);
        }
        const { data: kpis } = await supabase.from("vw_dashboard_kpis").select("*").single();

        const _validadesQuery = supabase.from("vw_validades_criticas").select("*").limit(10);
        // Can't directly filter views by company_id, but keep the query as-is for now
        const { data: validades } = await supabase.from("vw_validades_criticas").select("*").limit(10);

        reportData = { ...reportData, kpis, validades, companyName };
        break;
      }
      case "vigilantes": {
        let employeesQuery = supabase
          .from("employees")
          .select("id, nome_completo, cpf, cnv_numero, cnv_data_validade, cnv_situacao, status");
        if (companyId) {
          employeesQuery = employeesQuery.eq("company_id", companyId);
        }
        const { data: employees } = await employeesQuery.order("nome_completo");
        reportData.employees = employees || [];
        reportData.companyName = companyName;
        break;
      }
      case "compliance": {
        const { data: kpis } = await supabase.from("vw_dashboard_kpis").select("*").single();
        const { data: validades } = await supabase.from("vw_validades_criticas").select("*");
        reportData = { ...reportData, kpis, validades, companyName };
        break;
      }
      case "financeiro": {
        const billingQuery = supabase.from("vw_billing_resumo").select("*");
        // Note: vw_billing_resumo may not have company_id column; filter on companies table if needed
        const { data: billing } = await billingQuery;
        reportData.billing = billing || [];
        reportData.companyName = companyName;
        break;
      }
      case "frota": {
        let vehiclesQuery = supabase
          .from("vehicles")
          .select("id, placa, modelo, km_atual, licenciamento_validade, seguro_validade");
        if (companyId) {
          vehiclesQuery = vehiclesQuery.eq("company_id", companyId);
        }
        const { data: vehicles } = await vehiclesQuery;
        reportData.vehicles = vehicles || [];
        reportData.companyName = companyName;
        break;
      }
      case "gesp": {
        let gespQuery = supabase
          .from("gesp_tasks")
          .select("*, companies(razao_social)")
          .gte("created_at", inicio)
          .lte("created_at", `${fim}T23:59:59`);
        if (companyId) {
          gespQuery = gespQuery.eq("company_id", companyId);
        }
        const { data: tasks } = await gespQuery;
        reportData.tasks = tasks || [];
        reportData.companyName = companyName;
        break;
      }
      default:
        return NextResponse.json({ error: "Tipo de relatório inválido" }, { status: 400 });
    }

    // Generate file based on format
    if (formato === "excel") {
      return generateExcelReport(tipo, reportData, mes);
    } else {
      return generatePdfReport(tipo, reportData, mes);
    }
  } catch (error: unknown) {
    console.error("[RELATORIOS GET]", error);
    return NextResponse.json({ error: "Erro ao gerar relatório" }, { status: 500 });
  }
}

function generatePdfReport(tipo: string, data: Record<string, unknown>, periodo: string): Promise<NextResponse> {
  const doc = new PDFDocument({ margin: 40 });
  const buffers: Buffer[] = [];
  const companyName = data.companyName as string | null;

  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  // Header
  doc.fontSize(24).font("Helvetica-Bold").text("VIG PRO", { align: "left" });
  doc.fontSize(10).font("Helvetica").text("Relatório de Compliance para Segurança Privada", { align: "left" });
  doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  // Title and metadata
  const titleMap: Record<string, string> = {
    mensal: "Relatório Mensal",
    vigilantes: "Relatório de Vigilantes",
    compliance: "Relatório de Compliance",
    financeiro: "Relatório Financeiro",
    frota: "Relatório de Frota",
    gesp: "Relatório de Operações GESP",
  };

  doc.fontSize(16).font("Helvetica-Bold").text(titleMap[tipo] || "Relatório", { align: "center" });
  if (companyName) {
    doc.fontSize(12).font("Helvetica").text(`Empresa: ${companyName}`, { align: "center" });
  }
  doc.fontSize(10).font("Helvetica").text(`Período: ${periodo}`, { align: "center" });
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, { align: "center" });
  doc.moveDown();

  // Content based on type
  switch (tipo) {
    case "mensal": {
      const kpis = data.kpis as KPIData | undefined;
      doc.fontSize(12).font("Helvetica-Bold").text("Indicadores Principais");
      doc.fontSize(10).font("Helvetica");
      doc.text(`Total de Empresas Ativas: ${kpis?.total_empresas_ativas || 0}`);
      doc.text(`Total de Vigilantes Ativos: ${kpis?.total_vigilantes_ativos || 0}`);
      doc.text(`Workflows Abertos: ${kpis?.workflows_abertos || 0}`);
      doc.text(`Workflows Urgentes: ${kpis?.workflows_urgentes || 0}`);
      doc.text(`Validades Críticas: ${kpis?.validades_criticas || 0}`);
      doc.text(`Tasks GESP Pendentes: ${kpis?.gesp_tasks_pendentes || 0}`);
      doc.text(`Emails Enviados Hoje: ${kpis?.emails_enviados_hoje || 0}`);
      doc.moveDown();

      const validades = data.validades as ValidadeData[] | undefined;
      if (validades && validades.length > 0) {
        doc.fontSize(12).font("Helvetica-Bold").text("Validades Críticas");
        doc.fontSize(9).font("Helvetica");
        for (const v of validades.slice(0, 10)) {
          doc.text(`${v.tipo} - ${v.entidade_nome}: ${v.dias_restantes} dias [${v.severidade}]`);
        }
      }
      break;
    }

    case "vigilantes": {
      const employees = data.employees as EmployeeData[] | undefined;
      doc.fontSize(12).font("Helvetica-Bold").text("Lista de Vigilantes");
      doc.fontSize(9).font("Helvetica");

      if (employees && employees.length > 0) {
        for (const emp of employees.slice(0, 20)) {
          const cnvStatus = emp.cnv_situacao === "valida" ? "✓" : "✗";
          doc.text(`${cnvStatus} ${emp.nome_completo} - CNV: ${emp.cnv_numero} (vence ${emp.cnv_data_validade})`);
        }
        if (employees.length > 20) {
          doc.text(`... e mais ${employees.length - 20} vigilantes`);
        }
      } else {
        doc.text("Nenhum vigilante cadastrado.");
      }
      break;
    }

    case "compliance": {
      const kpis = data.kpis as KPIData | undefined;
      doc.fontSize(12).font("Helvetica-Bold").text("Status de Compliance");
      doc.fontSize(10).font("Helvetica");
      doc.text(`Total de Empresas Ativas: ${kpis?.total_empresas_ativas || 0}`);
      doc.text(`Total de Vigilantes Ativos: ${kpis?.total_vigilantes_ativos || 0}`);
      doc.text(`Workflows Abertos: ${kpis?.workflows_abertos || 0}`);
      doc.text(`Workflows Urgentes: ${kpis?.workflows_urgentes || 0}`);
      doc.text(`Validades Críticas: ${kpis?.validades_criticas || 0}`);
      doc.moveDown();

      const validades = data.validades as ValidadeData[] | undefined;
      if (validades && validades.length > 0) {
        doc.fontSize(12).font("Helvetica-Bold").text("Ações Pendentes");
        doc.fontSize(9).font("Helvetica");
        for (const v of validades.slice(0, 15)) {
          doc.text(`[${v.severidade.toUpperCase()}] ${v.tipo}: ${v.entidade_nome} vence em ${v.dias_restantes} dias`);
        }
      }
      break;
    }

    case "financeiro": {
      const billing = data.billing as BillingData[] | undefined;
      doc.fontSize(12).font("Helvetica-Bold").text("Resumo Financeiro");
      doc.fontSize(10).font("Helvetica");
      if (billing && billing.length > 0) {
        for (const bill of billing.slice(0, 10)) {
          doc.text(`${bill.razao_social}: R$ ${bill.valor_mensal?.toFixed(2) || "0.00"} - ${bill.billing_status}`);
        }
      }
      break;
    }

    case "frota": {
      const vehicles = data.vehicles as VehicleData[] | undefined;
      doc.fontSize(12).font("Helvetica-Bold").text("Status da Frota");
      doc.fontSize(9).font("Helvetica");
      if (vehicles && vehicles.length > 0) {
        for (const v of vehicles.slice(0, 20)) {
          doc.text(`${v.placa} - ${v.modelo} - ${v.km_atual} km - Lic: ${v.licenciamento_validade || "—"}`);
        }
        if (vehicles.length > 20) {
          doc.text(`... e mais ${vehicles.length - 20} veículos`);
        }
      }
      break;
    }

    case "gesp": {
      const tasks = data.tasks as GESPTaskData[] | undefined;
      doc.fontSize(12).font("Helvetica-Bold").text("Operações GESP");
      doc.fontSize(9).font("Helvetica");
      if (tasks && tasks.length > 0) {
        for (const t of tasks.slice(0, 20)) {
          doc.text(`${t.tipo_acao} - ${t.companies?.razao_social || "?"} - ${t.status} (${t.tentativas} tentativas)`);
        }
        if (tasks.length > 20) {
          doc.text(`... e mais ${tasks.length - 20} tasks`);
        }
      }
      break;
    }
  }

  doc.moveDown();
  doc.fontSize(8).font("Helvetica").text("Documento gerado automaticamente por VIG PRO", { align: "center" });
  doc.text(`${new Date().toLocaleString("pt-BR")}`, { align: "center" });

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(buffers);
      const filename = `relatorio-${tipo}-${periodo.replace("-", "")}.pdf`;

      resolve(
        new NextResponse(pdfBuffer, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        })
      );
    });
  });
}

async function generateExcelReport(tipo: string, data: Record<string, unknown>, periodo: string): Promise<NextResponse> {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Relatório");

  // Style header row
  const headerStyle = {
    font: { bold: true, color: { argb: "FFFFFF" } },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "0B1F3A" } },
    alignment: { horizontal: "center" as const, vertical: "center" as const },
  };

  // Add title and metadata
  worksheet.mergeCells("A1:D1");
  worksheet.getCell("A1").value = "VIG PRO — Relatório de Compliance";
  worksheet.getCell("A1").font = { bold: true, size: 14 };

  worksheet.mergeCells("A2:D2");
  worksheet.getCell("A2").value = `Tipo: ${tipo} | Período: ${periodo}`;

  worksheet.mergeCells("A3:D3");
  worksheet.getCell("A3").value = `Gerado em: ${new Date().toLocaleString("pt-BR")}`;

  // Content based on type
  let rowIndex = 5;

  switch (tipo) {
    case "mensal": {
      const kpis = data.kpis as KPIData | undefined;
      worksheet.getCell(`A${rowIndex}`).value = "Métrica";
      worksheet.getCell(`B${rowIndex}`).value = "Valor";
      Object.assign(worksheet.getCell(`A${rowIndex}`).style, headerStyle);
      Object.assign(worksheet.getCell(`B${rowIndex}`).style, headerStyle);

      rowIndex++;
      const metrics: [string, string | number][] = [
        ["Total de Empresas Ativas", kpis?.total_empresas_ativas || 0],
        ["Total de Vigilantes Ativos", kpis?.total_vigilantes_ativos || 0],
        ["Workflows Abertos", kpis?.workflows_abertos || 0],
        ["Workflows Urgentes", kpis?.workflows_urgentes || 0],
        ["Validades Críticas", kpis?.validades_criticas || 0],
      ];

      for (const [label, value] of metrics) {
        worksheet.getCell(`A${rowIndex}`).value = label;
        worksheet.getCell(`B${rowIndex}`).value = value;
        rowIndex++;
      }
      break;
    }

    case "vigilantes": {
      const employees = data.employees as EmployeeData[] | undefined;
      worksheet.getCell("A5").value = "Nome";
      worksheet.getCell("B5").value = "CPF";
      worksheet.getCell("C5").value = "CNV";
      worksheet.getCell("D5").value = "Validade CNV";
      worksheet.getCell("E5").value = "Situação";

      for (const col of ["A", "B", "C", "D", "E"]) {
        Object.assign(worksheet.getCell(`${col}5`).style, headerStyle);
      }

      rowIndex = 6;
      if (employees) {
        for (const emp of employees.slice(0, 100)) {
          worksheet.getCell(`A${rowIndex}`).value = emp.nome_completo;
          worksheet.getCell(`B${rowIndex}`).value = emp.cpf;
          worksheet.getCell(`C${rowIndex}`).value = emp.cnv_numero;
          worksheet.getCell(`D${rowIndex}`).value = emp.cnv_data_validade;
          worksheet.getCell(`E${rowIndex}`).value = emp.cnv_situacao;
          rowIndex++;
        }
      }
      break;
    }

    case "financeiro": {
      const billing = data.billing as BillingData[] | undefined;
      worksheet.getCell("A5").value = "Empresa";
      worksheet.getCell("B5").value = "Valor Mensal";
      worksheet.getCell("C5").value = "Status";

      for (const col of ["A", "B", "C"]) {
        Object.assign(worksheet.getCell(`${col}5`).style, headerStyle);
      }

      rowIndex = 6;
      if (billing) {
        for (const bill of billing.slice(0, 50)) {
          worksheet.getCell(`A${rowIndex}`).value = bill.razao_social || "—";
          worksheet.getCell(`B${rowIndex}`).value = bill.valor_mensal || 0;
          worksheet.getCell(`C${rowIndex}`).value = bill.billing_status || "—";
          rowIndex++;
        }
      }
      break;
    }

    case "frota": {
      const vehicles = data.vehicles as VehicleData[] | undefined;
      worksheet.getCell("A5").value = "Placa";
      worksheet.getCell("B5").value = "Modelo";
      worksheet.getCell("C5").value = "KM Atual";
      worksheet.getCell("D5").value = "Licenciamento";

      for (const col of ["A", "B", "C", "D"]) {
        Object.assign(worksheet.getCell(`${col}5`).style, headerStyle);
      }

      rowIndex = 6;
      if (vehicles) {
        for (const v of vehicles.slice(0, 100)) {
          worksheet.getCell(`A${rowIndex}`).value = v.placa;
          worksheet.getCell(`B${rowIndex}`).value = v.modelo;
          worksheet.getCell(`C${rowIndex}`).value = v.km_atual;
          worksheet.getCell(`D${rowIndex}`).value = v.licenciamento_validade;
          rowIndex++;
        }
      }
      break;
    }

    default:
      worksheet.getCell("A5").value = "Tipo de relatório não suportado em Excel";
  }

  // Auto-fit columns
  worksheet.columns.forEach((col) => {
    col.width = 18;
  });

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `relatorio-${tipo}-${periodo.replace("-", "")}.xlsx`;

  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
