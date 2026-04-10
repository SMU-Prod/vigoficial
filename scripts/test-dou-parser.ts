/**
 * Script de teste do parser DOU — Fluxo completo
 * Roda: npx tsx scripts/test-dou-parser.ts [data]
 * NÃO precisa de Supabase — testa scrape + parse end-to-end
 */

const DOU_BASE = "https://www.in.gov.br";

const buildLeituraUrl = (date: string) => {
  const [y, m, d] = date.split("-");
  return `${DOU_BASE}/leiturajornal?data=${d}-${m}-${y}&secao=DO1`;
};

const CNPJ_REGEX = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/;
const PROCESSO_REGEX = /Processo\s+n[ºo°]?\s*([\d\/.\-]+)/i;
const DELEGACIA_REGEX = /((?:DELESP|DPF|DREX|CV|SR)[\/A-Z]+\/PF\/[A-Z]{2})/;
const VALIDADE_REGEX = /[Vv]álido\s+por\s+(\d+)\s*\([^)]+\)\s*dias/;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

// ── Step 1: Extract publication links from embedded JSON ──────
function extractPublicationLinks(html: string) {
  const paramsMatch = html.match(/id="params"[^>]*>([\s\S]*?)<\/\w+>/);
  if (!paramsMatch) {
    console.error("❌ Elemento #params não encontrado!");
    return [];
  }

  const data = JSON.parse(paramsMatch[1].trim());
  const jsonArray = data.jsonArray || [];
  console.log(`📊 Total artigos no DOU do dia: ${jsonArray.length}`);

  const pfArticles = jsonArray.filter((item: any) =>
    item.hierarchyStr?.includes("Polícia Federal")
  );

  return pfArticles.map((item: any) => {
    const urlTitle = item.urlTitle || "";
    const idMatch = urlTitle.match(/-(\d{6,})$/);
    return {
      titulo: item.title,
      url: `${DOU_BASE}/web/dou/-/${urlTitle}`,
      dou_id: idMatch ? idMatch[1] : urlTitle,
      hierarchy: item.hierarchyStr,
      page: item.numberPage,
    };
  });
}

// ── Step 2: Parse publication page ──────
function parsePublicationPage(html: string) {
  const tituloMatch = html.match(/<p\s+class="identifica"[^>]*>([\s\S]*?)<\/p>/i);
  const titulo = tituloMatch ? stripHtml(tituloMatch[1]).trim() : null;

  const paragraphs: string[] = [];
  const pRegex = /<p\s+class="dou-paragraph"[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(html)) !== null) {
    const text = stripHtml(pMatch[1]).trim();
    if (text) paragraphs.push(text);
  }

  const assinaMatch = html.match(/<p\s+class="assina"[^>]*>([\s\S]*?)<\/p>/i);
  const assinante = assinaMatch ? stripHtml(assinaMatch[1]).trim() : null;

  return { titulo, paragraphs, assinante };
}

// ── Step 3: Group + Parse alvarás ──────
function groupAndParse(paragraphs: string[]) {
  const blocks: string[] = [];
  let currentBlock: string[] = [];

  for (const p of paragraphs) {
    if (p.startsWith("O(A) COORDENADOR") && currentBlock.length > 0) {
      blocks.push(currentBlock.join("\n"));
      currentBlock = [];
    }
    currentBlock.push(p);
  }
  if (currentBlock.length > 0) blocks.push(currentBlock.join("\n"));

  const alvaras: any[] = [];
  let falhas = 0;

  for (const block of blocks) {
    const cnpjMatch = block.match(CNPJ_REGEX);
    if (!cnpjMatch) { falhas++; continue; }

    let razao = "";
    const razaoMatch = block.match(/(?:empresa|à empresa|a empresa)\s+([^,]+?),?\s*CNPJ/i);
    if (razaoMatch) razao = razaoMatch[1].trim().replace(/\s+/g, " ");
    else {
      const fb = block.match(/resolve:\s*\w+\s+.*?(?:à|a)\s+(.+?),?\s*CNPJ/is);
      if (fb) razao = fb[1].trim().replace(/\s+/g, " ");
    }
    if (!razao || razao.length < 3) { falhas++; continue; }

    const ufM = block.match(/\/PF\/([A-Z]{2})/);
    const acaoM = block.match(/resolve:\s+(\w+)/i);
    const procM = block.match(PROCESSO_REGEX);
    const delM = block.match(DELEGACIA_REGEX);
    const valM = block.match(VALIDADE_REGEX);

    const itens: any[] = [];
    for (const line of block.split("\n")) {
      const m = line.match(/^(\d+)\s*\([^)]+\)\s+(.+)/);
      if (m) {
        const calibreM = m[2].match(/calibre\s+([\d.,]+)/i);
        itens.push({
          qty: parseInt(m[1]),
          desc: m[2].trim(),
          calibre: calibreM ? calibreM[1] : undefined,
        });
      }
    }

    alvaras.push({
      razao_social: razao,
      cnpj: cnpjMatch[0],
      uf: ufM ? ufM[1] : null,
      acao: acaoM ? acaoM[1].toUpperCase() : "?",
      processo: procM ? procM[1] : null,
      delegacia: delM ? delM[1] : null,
      validade: valM ? parseInt(valM[1]) : null,
      itens,
    });
  }

  return { alvaras, blocks: blocks.length, falhas };
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  const date = process.argv[2] || "2026-03-27";
  console.log(`\n🔍 TESTE COMPLETO DO PARSER DOU — Data: ${date}\n`);
  console.log("═".repeat(60));

  // Step 1: Fetch leiturajornal
  const leituraUrl = buildLeituraUrl(date);
  console.log(`\n📡 Step 1: Buscar leiturajornal`);
  console.log(`   URL: ${leituraUrl}`);

  const res1 = await fetch(leituraUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const html1 = await res1.text();
  console.log(`   Status: ${res1.status} | HTML: ${html1.length} chars`);

  // Step 2: Extract PF publications
  console.log(`\n📑 Step 2: Extrair publicações da Polícia Federal`);
  const pubs = extractPublicationLinks(html1);
  console.log(`   Publicações PF encontradas: ${pubs.length}`);
  pubs.forEach((p: any, i: number) => {
    console.log(`   ${i + 1}. ${p.titulo}`);
    console.log(`      ID: ${p.dou_id} | Pág: ${p.page}`);
    console.log(`      Hierarquia: ${p.hierarchy}`);
  });

  if (pubs.length === 0) {
    console.log("\n⚠️  Nenhuma publicação da PF encontrada. Fim do teste.");
    return;
  }

  // Step 3: Fetch individual publication pages
  for (const pub of pubs) {
    console.log(`\n📖 Step 3: Raspar publicação: ${pub.titulo}`);
    console.log(`   URL: ${pub.url}`);

    const res2 = await fetch(pub.url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    const html2 = await res2.text();
    console.log(`   Status: ${res2.status} | HTML: ${html2.length} chars`);

    // Step 4: Parse content
    const content = parsePublicationPage(html2);
    console.log(`\n📋 Step 4: Parse conteúdo`);
    console.log(`   Título: ${content.titulo}`);
    console.log(`   Parágrafos: ${content.paragraphs.length}`);
    console.log(`   Assinante: ${content.assinante}`);

    // Step 5: Group and parse alvarás
    const { alvaras, blocks, falhas } = groupAndParse(content.paragraphs);
    console.log(`\n📦 Step 5: Agrupar e parsear alvarás`);
    console.log(`   Blocos: ${blocks}`);
    console.log(`   ✅ Parseados: ${alvaras.length}`);
    console.log(`   ❌ Falhas: ${falhas}`);

    // Stats
    const ufs = new Map<string, number>();
    const acoes = new Map<string, number>();
    let totalItens = 0;
    for (const a of alvaras) {
      ufs.set(a.uf || "N/A", (ufs.get(a.uf || "N/A") || 0) + 1);
      acoes.set(a.acao, (acoes.get(a.acao) || 0) + 1);
      totalItens += a.itens.length;
    }

    console.log(`\n📊 ESTATÍSTICAS:`);
    console.log(`   Total itens liberados: ${totalItens}`);
    console.log(`   Com processo: ${alvaras.filter((a: any) => a.processo).length}/${alvaras.length}`);
    console.log(`   Com delegacia: ${alvaras.filter((a: any) => a.delegacia).length}/${alvaras.length}`);
    console.log(`   Com validade: ${alvaras.filter((a: any) => a.validade).length}/${alvaras.length}`);

    console.log(`\n   Por UF:`);
    [...ufs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([u, c]) =>
      console.log(`     ${u}: ${c}`)
    );

    console.log(`\n   Por Ação:`);
    [...acoes.entries()].sort((a, b) => b[1] - a[1]).forEach(([a, c]) =>
      console.log(`     ${a}: ${c}`)
    );

    // First 3 examples
    console.log(`\n📝 EXEMPLOS (3 primeiros):\n`);
    alvaras.slice(0, 3).forEach((a: any, i: number) => {
      console.log(`─── ${i + 1}. ${a.razao_social} ───`);
      console.log(`  CNPJ: ${a.cnpj} | UF: ${a.uf} | Ação: ${a.acao}`);
      console.log(`  Processo: ${a.processo || "N/A"} | Delegacia: ${a.delegacia || "N/A"}`);
      console.log(`  Validade: ${a.validade ? a.validade + " dias" : "N/A"}`);
      if (a.itens.length > 0) {
        console.log(`  Itens (${a.itens.length}):`);
        a.itens.slice(0, 5).forEach((it: any) =>
          console.log(`    - ${it.qty}x ${it.desc}${it.calibre ? ` [cal.${it.calibre}]` : ""}`)
        );
        if (a.itens.length > 5) console.log(`    ... +${a.itens.length - 5} itens`);
      }
      console.log();
    });
  }

  console.log("═".repeat(60));
  console.log(`🏁 Teste concluído com sucesso!\n`);
}

main().catch(console.error);
