/**
 * Standalone GESP Mock Server
 * Run with: npx tsx tests/mocks/gesp-standalone.ts
 *
 * Launches the full GESP mock server (all 11 modules) on port 3333
 * for manual testing with Playwright or browser access.
 */

import { MockGESPServer } from './gesp-server'

const PORT = parseInt(process.env.GESP_MOCK_PORT || '3333', 10)

async function main() {
  const server = new MockGESPServer({ port: PORT })
  await server.start()

  console.log(`\n========================================`)
  console.log(`  GESP Mock Server (PGDWeb Simulation)`)
  console.log(`  http://localhost:${PORT}`)
  console.log(`========================================`)
  console.log(`\nEndpoints disponíveis:`)
  console.log(`  GET  /health                          - Health check`)
  console.log(`  GET  /login                           - GOV.BR Login`)
  console.log(`  GET  /gesp/certificate-select         - Seleção de certificado`)
  console.log(`  GET  /gesp/profile-select             - Seleção de perfil`)
  console.log(`  GET  /gesp/dashboard                  - Dashboard principal`)
  console.log(`  GET  /gesp/empresa/*                  - Módulo Empresa`)
  console.log(`  GET  /gesp/processo-autorizativo/*    - Processos Autorizativos`)
  console.log(`  GET  /gesp/processo-punitivo/*        - Processos Punitivos`)
  console.log(`  GET  /gesp/turma/*                    - Turmas`)
  console.log(`  GET  /gesp/guia-transporte/*          - Guias de Transporte`)
  console.log(`  GET  /gesp/comunicacao-ocorrencia/*   - Comunicação de Ocorrência`)
  console.log(`  GET  /gesp/comunicacao-evento/*       - Comunicação de Evento`)
  console.log(`  GET  /gesp/credenciamento/*           - Credenciamento de Instrutores`)
  console.log(`  GET  /gesp/notificacao-autonoma/*     - Notificação Autônoma`)
  console.log(`  GET  /gesp/cnv/*                      - CNV`)
  console.log(`  GET  /gesp/importacao/*               - Importação XML`)
  console.log(`\nPressione Ctrl+C para encerrar.\n`)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[GESP Standalone] Encerrando servidor...')
    await server.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[GESP Standalone] Erro ao iniciar:', err)
  process.exit(1)
})
