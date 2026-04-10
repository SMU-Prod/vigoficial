import { createSupabaseAdmin } from "@/lib/supabase/server";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { FLEET_THRESHOLDS } from "@/lib/config/constants";

/**
 * Limiares de manutenção preventiva
 * PRD Seção 3.5 — Gestão de Frota
 */
const LIMIARES = {
  ...FLEET_THRESHOLDS,
  correia_dentada:{ km: 60000, alertaAntes: 5000 },
  revisao_geral:  { km: 20000, alertaAntes: 2000 },
};

/**
 * Processa dados GPS de um veículo
 * Calcula KM via odômetro ou Haversine
 */
export async function processarTelemetria(
  vehicleId: string,
  dados: {
    latitude: number;
    longitude: number;
    velocidade?: number;
    ignicao?: boolean;
    odometro?: number;
    provider: string;
  }
) {
  const supabase = createSupabaseAdmin();

  // Salva telemetria
  const { error: telemetryError } = await supabase.from("vehicle_telemetry").insert({
    vehicle_id: vehicleId,
    latitude: dados.latitude,
    longitude: dados.longitude,
    velocidade: dados.velocidade,
    ignicao: dados.ignicao,
    odometro: dados.odometro,
    provider: dados.provider,
    recorded_at: new Date().toISOString(),
  });
  if (telemetryError) {
    console.error(`[processarTelemetria] Erro ao salvar telemetria vehicle=${vehicleId}:`, telemetryError.message);
  }

  // Atualiza posição e KM no veículo
  const updateData: Record<string, unknown> = {
    gps_ultimo_lat: dados.latitude,
    gps_ultimo_lng: dados.longitude,
    gps_ultima_leitura: new Date().toISOString(),
  };

  if (dados.odometro) {
    updateData.km_atual = dados.odometro;
  } else {
    // Calcula KM via Haversine se não tem odômetro
    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("km_atual, gps_ultimo_lat, gps_ultimo_lng")
      .eq("id", vehicleId)
      .single();
    if (vehicleError) {
      console.error(`[processarTelemetria] Erro ao buscar vehicle=${vehicleId}:`, vehicleError.message);
    }

    if (vehicle?.gps_ultimo_lat && vehicle?.gps_ultimo_lng) {
      const distKm = haversine(
        vehicle.gps_ultimo_lat,
        vehicle.gps_ultimo_lng,
        dados.latitude,
        dados.longitude
      );
      updateData.km_atual = (vehicle.km_atual || 0) + distKm;
    }
  }

  await supabase.from("vehicles").update(updateData).eq("id", vehicleId);
}

/**
 * Verifica alertas de manutenção para todos os veículos de uma empresa
 */
export async function checkManutencao(companyId: string) {
  const supabase = createSupabaseAdmin();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("razao_social, email_responsavel")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    console.error(`[checkManutencao] Erro ao buscar company=${companyId}:`, companyError?.message);
    return { alerts: 0 };
  }

  const { data: vehicles, error: vehiclesError } = await supabase
    .from("vehicles")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "ativo");

  if (vehiclesError || !vehicles) {
    console.error(`[checkManutencao] Erro ao buscar vehicles company=${companyId}:`, vehiclesError?.message);
    return { alerts: 0 };
  }

  let alertCount = 0;

  for (const vehicle of vehicles) {
    const km = vehicle.km_atual || 0;

    for (const [tipo, limiar] of Object.entries(LIMIARES)) {
      const alertaAtivo = vehicle.alertas_ativos?.[tipo] !== false;
      if (!alertaAtivo) continue;

      const ultimaKm = getUltimaManutencaoKm(vehicle, tipo);
      const kmDesdeUltima = km - ultimaKm;
      const kmRestantes = limiar.km - kmDesdeUltima;

      if (kmRestantes <= limiar.alertaAntes && kmRestantes > 0) {
        // Envia Template G
        await addEmailSendJob({
          companyId,
          templateId: "G",
          mode: "CLIENTE_HTML",
          to: company.email_responsavel,
          subject: `[VIG PRO Frota] ${formatTipo(tipo)} — ${vehicle.placa} em ${kmRestantes} km`,
          payload: {
            razaoSocial: company.razao_social,
            placa: vehicle.placa,
            modelo: `${vehicle.marca || ""} ${vehicle.modelo}`.trim(),
            tipoManutencao: formatTipo(tipo),
            kmAtual: km,
            kmLimite: ultimaKm + limiar.km,
            kmRestantes,
          },
        });

        alertCount++;
      }
    }

    // Validades por data (licenciamento, seguro, vistoria PF)
    const dateChecks = [
      { campo: "licenciamento_validade", tipo: "Licenciamento DETRAN" },
      { campo: "seguro_validade", tipo: "Seguro" },
      { campo: "vistoria_pf_validade", tipo: "Vistoria PF" },
    ];

    for (const check of dateChecks) {
      const val = vehicle[check.campo as keyof typeof vehicle] as string;
      if (!val) continue;

      const dias = Math.ceil((new Date(val).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const alertDays = [60, 30, 15];

      if (alertDays.includes(dias)) {
        await addEmailSendJob({
          companyId,
          templateId: "G",
          mode: "CLIENTE_HTML",
          to: company.email_responsavel,
          subject: `[VIG PRO Frota] ${check.tipo} — ${vehicle.placa} vence em ${dias} dias`,
          payload: {
            razaoSocial: company.razao_social,
            placa: vehicle.placa,
            modelo: `${vehicle.marca || ""} ${vehicle.modelo}`.trim(),
            tipoManutencao: check.tipo,
            kmAtual: km,
            kmLimite: 0,
            kmRestantes: 0,
            dataLimite: new Date(val).toLocaleDateString("pt-BR"),
          },
        });
        alertCount++;
      }
    }
  }

  return { alerts: alertCount };
}

function getUltimaManutencaoKm(vehicle: Record<string, unknown>, tipo: string): number {
  const map: Record<string, string> = {
    troca_oleo: "ultima_troca_oleo_km",
    troca_pneu: "ultima_troca_pneu_km",
    pastilha_freio: "ultima_pastilha_km",
    correia_dentada: "ultima_correia_km",
    revisao_geral: "ultima_revisao_km",
  };
  return (vehicle[map[tipo]] as number) || 0;
}

function formatTipo(tipo: string): string {
  return tipo.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Fórmula de Haversine — calcula distância em KM entre dois pontos GPS
 */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
