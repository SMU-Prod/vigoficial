/**
 * Standalone DOU Mock Server
 * Run with: npx tsx tests/mocks/dou-standalone.ts
 *
 * Launches the full DOU mock server with realistic endpoints on port 3334
 * for manual testing of the DOU parser and prospector.
 */

import { MockDOUServer } from './dou-server'

const PORT = parseInt(process.env.DOU_MOCK_PORT || '3334', 10)

async function main() {
  const server = new MockDOUServer({ port: PORT })
  await server.start()

  console.log(`\n========================================`)
  console.log(`  DOU Mock Server (in.gov.br Simulation)`)
  console.log(`  http://localhost:${PORT}`)
  console.log(`========================================`)
  console.log(`\nEndpoints disponíveis:`)
  console.log(`  GET  /health                                    - Health check`)
  console.log(`  GET  /inicio                                    - Homepage DOU`)
  console.log(`  GET  /consulta                                  - Página de busca`)
  console.log(`  GET  /servicos/diario-oficial/secao-1?data=...  - Seção 1`)
  console.log(`  GET  /servicos/diario-oficial/secao-2?data=...  - Seção 2`)
  console.log(`  GET  /servicos/diario-oficial/secao-3?data=...  - Seção 3`)
  console.log(`  GET  /leiturajornal?data=...&secao=do1          - Leitor`)
  console.log(`  GET  /api/search?q=...&s=...&exactDate=...      - API de busca`)
  console.log(`\nFixtures:`)
  console.log(`  - dou-secao1-sample.html  (17 artigos, 14 de segurança)`)
  console.log(`  - dou-secao1-empty.html   (6 artigos, nenhum de segurança)`)
  console.log(`\nPressione Ctrl+C para encerrar.\n`)

  const shutdown = async () => {
    console.log('\n[DOU Standalone] Encerrando servidor...')
    await server.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[DOU Standalone] Erro ao iniciar:', err)
  process.exit(1)
})
