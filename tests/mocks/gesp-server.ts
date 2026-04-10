/**
 * GESP Mock Server - Brazilian Federal Police GESP Portal Simulation
 * Realistically simulates PGDWeb (Portal Gestão Eletrônica de Segurança Privada)
 *
 * JSF-based application with realistic workflows for testing Playwright automation
 * Supports all 11 modules: Empresa, Processo Autorizativo, Processo Punitivo, Turma,
 * Guia de Transporte, Comunicação de Ocorrência, Comunicação de Evento,
 * Credenciamento de Instrutores, Notificação Autônoma, CNV, Importação
 */

import * as http from 'http';
import * as url from 'url';
import * as qs from 'querystring';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface SessionData {
  authenticated: boolean;
  profileSelected: boolean;
  termsAgreed: boolean;
  certificateType?: 'e-CNPJ' | 'e-CPF';
  cnpj?: string;
  cpf?: string;
  userName?: string;
  lastLoginAt?: string;
  createdAt: Date;
}

interface ProcessoAutorizativo {
  id: string;
  ano: number;
  numero: number;
  tipo: string;
  dataCriacao: string;
  dataEnvio?: string;
  situacao: 'Rascunho' | 'Em Análise' | 'Deferido' | 'Indeferido' | 'Enviado';
  dados: Record<string, any>;
}

interface ProcessoPunitivo {
  id: string;
  ano: number;
  numero: number;
  tipo: string;
  dataCriacao: string;
  dataEnvio: string;
  situacao: string;
}

interface Turma {
  id: string;
  tipoLocal: string;
  tipoCurso: string;
  dataInicio: string;
  dataTermino: string;
  horario: string;
  local: string;
  cargaHoraria: number;
  limiteAlunos: number;
  alunos: string[];
}

interface GuiaTransporte {
  id: string;
  numero: string;
  dataCriacao: string;
  tipoProduto: string;
  origem: string;
  destino: string;
  quantidade: number;
  tipoArma: string;
  calibre: string;
  situacao: string;
}

interface Procurador {
  cpf: string;
  nome: string;
  dataInicio: string;
  dataFim: string;
  situacao: 'Vigente' | 'Revogada';
}

interface MockData {
  companies: Map<string, any>;
  processosAutorizativos: Map<string, ProcessoAutorizativo>;
  processosPunitivos: Map<string, ProcessoPunitivo>;
  turmas: Map<string, Turma>;
  guiasTransporte: Map<string, GuiaTransporte>;
  procuradores: Map<string, Procurador[]>;
  protocolCounter: number;
  gruSaldos: Map<string, number>;
}

// =============================================================================
// MOCK DATA INITIALIZATION
// =============================================================================

function initializeMockData(): MockData {
  const data: MockData = {
    companies: new Map(),
    processosAutorizativos: new Map(),
    processosPunitivos: new Map(),
    turmas: new Map(),
    guiasTransporte: new Map(),
    procuradores: new Map(),
    protocolCounter: 1,
    gruSaldos: new Map(),
  };

  // Initialize companies
  const companies = [
    {
      cnpj: '12.345.678/0001-90',
      cnpjClean: '12345678000190',
      razaoSocial: 'Segurança Brasil Vigilância Ltda',
      nomeFantasia: 'Segurança Brasil',
      email: 'contato@segurancabrasil.com.br',
      telefone: '(61) 3234-5678',
      endereco: 'Rua das Flores, 123',
      numero: '123',
      bairro: 'Centro',
      uf: 'DF',
      municipio: 'Brasília',
      cep: '70000-000',
      tipoAutorizacao: 'Especializada',
      dataPublicacao: '2020-01-15',
      dataValidade: '2027-01-15',
      numPortaria: '2020/123',
      atividades: ['Vigilância Patrimonial', 'Transporte de Valores'],
      cnae: '8010-00',
      apoliceSeguros: 'POL-2024-001',
      seguradora: 'Seguradora Brasil S.A.',
      validadeSeguro: '2025-12-31',
    },
    {
      cnpj: '87.654.321/0001-09',
      cnpjClean: '87654321000109',
      razaoSocial: 'Escolta Armada Premium Ltda',
      nomeFantasia: 'Escolta Premium',
      email: 'admin@escoltapremium.com.br',
      telefone: '(61) 3345-6789',
      endereco: 'Avenida Central, 456',
      numero: '456',
      bairro: 'Setor Comercial',
      uf: 'DF',
      municipio: 'Brasília',
      cep: '70100-000',
      tipoAutorizacao: 'Especializada',
      dataPublicacao: '2019-05-20',
      dataValidade: '2026-05-20',
      numPortaria: '2019/456',
      atividades: ['Escolta Armada', 'Segurança Pessoal'],
      cnae: '8010-00',
      apoliceSeguros: 'POL-2024-002',
      seguradora: 'Bradesco Seguros',
      validadeSeguro: '2025-11-30',
    },
    {
      cnpj: '11.111.111/0001-11',
      cnpjClean: '11111111000111',
      razaoSocial: 'Policia Privada Nacional S.A.',
      nomeFantasia: 'PPN Segurança',
      email: 'suporte@ppn.com.br',
      telefone: '(61) 3456-7890',
      endereco: 'Quadra 5, Conjunto A',
      numero: '100',
      bairro: 'Setor Administrativo',
      uf: 'DF',
      municipio: 'Brasília',
      cep: '70200-000',
      tipoAutorizacao: 'Orgânica',
      dataPublicacao: '2018-08-10',
      dataValidade: '2025-08-10',
      numPortaria: '2018/789',
      atividades: ['Vigilância Patrimonial', 'Transporte de Valores', 'Escolta Armada'],
      cnae: '8010-00',
      apoliceSeguros: 'POL-2024-003',
      seguradora: 'Allianz Seguros',
      validadeSeguro: '2026-01-31',
    },
  ];

  companies.forEach((company) => {
    data.companies.set(company.cnpjClean, company);
    data.gruSaldos.set(company.cnpjClean, 15000.00);
  });

  // Initialize procuradores
  data.procuradores.set('12345678000190', [
    {
      cpf: '123.456.789-00',
      nome: 'João Silva Santos',
      dataInicio: '2024-01-01',
      dataFim: '2025-12-31',
      situacao: 'Vigente',
    },
    {
      cpf: '234.567.890-11',
      nome: 'Maria Oliveira Costa',
      dataInicio: '2024-03-15',
      dataFim: '2025-12-31',
      situacao: 'Vigente',
    },
  ]);

  return data;
}

// =============================================================================
// HTML TEMPLATES
// =============================================================================

function htmlTemplate(
  title: string,
  content: string,
  session?: SessionData
): string {
  const headerHtml = session?.authenticated
    ? `
    <div class="header">
      <div class="header-left">
        <div class="logo">GESP</div>
        <h1>GESP – Sistema de Gestão Eletrônica de Segurança Privada</h1>
      </div>
      <div class="header-right">
        <span class="user-info">Usuário: ${session?.userName || 'Sistema'}</span>
        <a href="/gesp/logout" class="logout-btn">Sair</a>
      </div>
    </div>
    <div class="menu-bar">
      <a href="#" onclick="toggleMenu('empresa')">Empresa ▼</a>
      <a href="#" onclick="toggleMenu('processo')">Processo Autorizativo ▼</a>
      <a href="#" onclick="toggleMenu('punitivo')">Processo Punitivo ▼</a>
      <a href="#" onclick="toggleMenu('turma')">Turma ▼</a>
      <a href="#" onclick="toggleMenu('guia')">Guia de Transporte ▼</a>
      <a href="#" onclick="toggleMenu('ocorrencia')">Comunicação de Ocorrência ▼</a>
      <a href="#" onclick="toggleMenu('evento')">Comunicação de Evento ▼</a>
      <a href="#" onclick="toggleMenu('credenciamento')">Credenciamento de Instrutores ▼</a>
      <a href="#" onclick="toggleMenu('notificacao')">Notificação Autônoma ▼</a>
      <a href="#" onclick="toggleMenu('cnv')">CNV ▼</a>
      <a href="#" onclick="toggleMenu('importacao')">Importação ▼</a>
      <a href="/gesp/ajuda">Ajuda</a>
    </div>
    <div id="empresa" class="submenu" style="display:none;">
      <a href="/gesp/empresa/atualizar">Atualizar Dados</a>
      <a href="/gesp/empresa/procuradores">Gerenciar Procuradores</a>
      <a href="/gesp/empresa/gru">Consultar GRU</a>
    </div>
    <div id="processo" class="submenu" style="display:none;">
      <a href="/gesp/processo/acompanhar">Acompanhar</a>
      <a href="/gesp/processo/solicitar/funcionamento">Solicitar Autorização de Funcionamento</a>
      <a href="/gesp/processo/solicitar/armas">Solicitar Aquisição de Armas e Munições</a>
      <a href="/gesp/processo/solicitar/atividade">Solicitar Autorização de Nova Atividade</a>
      <a href="/gesp/processo/solicitar/revisao">Solicitar Revisão</a>
      <a href="/gesp/processo/solicitar/coletes">Solicitar Aquisição de Coletes</a>
      <a href="/gesp/processo/editar-rascunhos">Editar Rascunhos</a>
      <a href="/gesp/processo/responder-notificacao">Responder Notificação</a>
      <a href="/gesp/processo/interpor-recurso">Interpor Recurso</a>
    </div>
    <div id="punitivo" class="submenu" style="display:none;">
      <a href="/gesp/punitivo/acompanhar">Acompanhar</a>
      <a href="/gesp/punitivo/responder-notificacao">Responder Notificação</a>
      <a href="/gesp/punitivo/interpor-recurso">Interpor Recurso</a>
    </div>
    <div id="turma" class="submenu" style="display:none;">
      <a href="/gesp/turma/criar">Criar Turma</a>
      <a href="/gesp/turma/gerenciar">Gerenciar Turma</a>
      <a href="/gesp/turma/adicionar-alunos">Adicionar Alunos</a>
    </div>
    <div id="guia" class="submenu" style="display:none;">
      <a href="/gesp/guia/solicitar">Solicitar</a>
      <a href="/gesp/guia/acompanhar">Acompanhar</a>
    </div>
    <div id="ocorrencia" class="submenu" style="display:none;">
      <a href="/gesp/ocorrencia/comunicar">Comunicar</a>
      <a href="/gesp/ocorrencia/acompanhar">Acompanhar</a>
    </div>
    <div id="evento" class="submenu" style="display:none;">
      <a href="/gesp/evento/comunicar">Comunicar</a>
      <a href="/gesp/evento/acompanhar">Acompanhar</a>
    </div>
    <div id="credenciamento" class="submenu" style="display:none;">
      <a href="/gesp/credenciamento/credenciar">Credenciar</a>
      <a href="/gesp/credenciamento/consultar">Consultar</a>
    </div>
    <div id="notificacao" class="submenu" style="display:none;">
      <a href="/gesp/notificacao/consultar">Consultar</a>
      <a href="/gesp/notificacao/responder">Responder</a>
      <a href="/gesp/notificacao/recurso">Interpor Recurso</a>
    </div>
    <div id="cnv" class="submenu" style="display:none;">
      <a href="/gesp/cnv/consultar">Consultar CNV</a>
    </div>
    <div id="importacao" class="submenu" style="display:none;">
      <a href="/gesp/importacao/importar">Importar</a>
      <a href="/gesp/importacao/acompanhar">Acompanhar Importação</a>
    </div>
  `
    : '';

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; }
        body {
            font-family: 'Segoe UI', Tahoma, sans-serif;
            background-color: #f5f5f5;
            color: #333;
        }
        .header {
            background: linear-gradient(135deg, #003366 0%, #004687 100%);
            color: white;
            padding: 20px 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header-left { display: flex; align-items: center; gap: 20px; }
        .logo { font-size: 24px; font-weight: bold; }
        .header h1 { font-size: 18px; margin: 0; }
        .header-right { display: flex; gap: 20px; align-items: center; }
        .user-info { font-size: 14px; }
        .logout-btn { color: white; text-decoration: none; padding: 8px 16px; background: #d32f2f; border-radius: 4px; }
        .menu-bar {
            background: #002244;
            display: flex;
            gap: 5px;
            padding: 10px 30px;
            flex-wrap: wrap;
            position: relative;
            z-index: 100;
        }
        .menu-bar a {
            color: white;
            text-decoration: none;
            padding: 10px 15px;
            font-size: 14px;
            border-radius: 4px;
            transition: background 0.2s;
        }
        .menu-bar a:hover { background: rgba(255,255,255,0.1); }
        .submenu {
            position: absolute;
            background: white;
            border: 1px solid #ddd;
            min-width: 250px;
            z-index: 101;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            padding: 10px 0;
        }
        .submenu a {
            display: block;
            color: #003366;
            text-decoration: none;
            padding: 12px 20px;
            font-size: 14px;
            border: none;
            transition: background 0.2s;
        }
        .submenu a:hover { background: #f5f5f5; }
        .container {
            max-width: 1366px;
            margin: 0 auto;
            padding: 30px;
            background: white;
            min-height: calc(100vh - 200px);
        }
        .page-title { font-size: 24px; margin-bottom: 20px; color: #003366; border-bottom: 2px solid #FFD700; padding-bottom: 10px; }
        .form-group {
            margin-bottom: 20px;
            display: flex;
            flex-direction: column;
        }
        label {
            font-weight: 600;
            margin-bottom: 8px;
            color: #333;
        }
        input[type="text"],
        input[type="email"],
        input[type="tel"],
        input[type="date"],
        input[type="number"],
        input[type="file"],
        select,
        textarea {
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            font-family: inherit;
        }
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #003366;
            box-shadow: 0 0 0 2px rgba(0,51,102,0.1);
        }
        textarea { resize: vertical; min-height: 100px; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .form-row.full { grid-column: 1 / -1; }
        button, input[type="button"], input[type="submit"] {
            padding: 12px 24px;
            background: #003366;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: background 0.2s;
        }
        button:hover, input[type="button"]:hover, input[type="submit"]:hover {
            background: #002244;
        }
        button.secondary { background: #6c757d; }
        button.secondary:hover { background: #5a6268; }
        button.danger { background: #d32f2f; }
        button.danger:hover { background: #b71c1c; }
        button.success { background: #388e3c; }
        button.success:hover { background: #2e7d32; }
        .button-bar {
            display: flex;
            gap: 10px;
            margin: 20px 0;
            padding: 15px;
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .button-bar button { margin-right: 5px; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            background: white;
        }
        th {
            background: #003366;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #ddd;
        }
        tbody tr:hover { background: #f9f9f9; }
        .success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .info {
            background: #d1ecf1;
            border: 1px solid #bee5eb;
            color: #0c5460;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .tabs {
            display: flex;
            gap: 5px;
            margin-bottom: 20px;
            border-bottom: 2px solid #ddd;
        }
        .tab {
            padding: 12px 20px;
            background: none;
            color: #666;
            border: none;
            cursor: pointer;
            border-bottom: 3px solid transparent;
            transition: all 0.2s;
        }
        .tab.active {
            color: #003366;
            border-bottom-color: #FFD700;
        }
        .tab:hover { background: #f5f5f5; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
        }
        .modal.show { display: flex; align-items: center; justify-content: center; }
        .modal-content {
            background: white;
            padding: 30px;
            border-radius: 8px;
            max-width: 500px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            text-align: center;
        }
        .modal-content h2 { margin-bottom: 20px; color: #003366; }
        .modal-content p { margin-bottom: 20px; }
        .modal-buttons { display: flex; gap: 10px; justify-content: center; }
        .footer {
            background: #f5f5f5;
            padding: 20px 30px;
            text-align: center;
            border-top: 1px solid #ddd;
            margin-top: 40px;
            font-size: 12px;
            color: #666;
        }
        .alert-badge { display: inline-block; background: #FFD700; color: #000; padding: 4px 8px; border-radius: 3px; font-weight: bold; margin-right: 5px; }
        .protocol {
            font-size: 18px;
            font-weight: bold;
            color: #155724;
            background: #d4edda;
            padding: 20px;
            border-radius: 4px;
            text-align: center;
            margin: 20px 0;
        }
        .action-icons {
            display: flex;
            gap: 8px;
        }
        .action-icons a, .action-icons button {
            padding: 6px 10px;
            font-size: 12px;
            text-decoration: none;
            color: white;
            background: #0066cc;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .action-icons a.delete, .action-icons button.delete {
            background: #d32f2f;
        }
        .login-container {
            max-width: 500px;
            margin: 60px auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .login-header { text-align: center; margin-bottom: 30px; }
        .login-header h1 { color: #003366; margin-bottom: 10px; }
        .certificate-option {
            display: block;
            padding: 20px;
            border: 2px solid #ddd;
            margin: 15px 0;
            border-radius: 4px;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s;
        }
        .certificate-option:hover {
            border-color: #003366;
            background: #f5f5f5;
            box-shadow: 0 2px 8px rgba(0,51,102,0.1);
        }
        .certificate-option strong { display: block; color: #003366; margin-bottom: 8px; }
        .certificate-option p { margin: 0; color: #666; font-size: 13px; }
        .profile-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        .profile-table th, .profile-table td {
            padding: 12px;
            border: 1px solid #ddd;
            text-align: left;
        }
        .profile-table th { background: #003366; color: white; }
        .profile-table tr:hover { background: #f9f9f9; }
        .select-btn {
            padding: 8px 16px;
            background: #388e3c;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .select-btn:hover { background: #2e7d32; }
    </style>
    <script>
        function toggleMenu(id) {
            const menu = document.getElementById(id);
            if (menu) {
                menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
                event.preventDefault();
            }
        }
        function showConfirm(message, callback) {
            const modal = document.getElementById('confirmModal');
            const msgEl = modal.querySelector('.modal-message');
            msgEl.textContent = message;
            modal.className = 'modal show';
            document.getElementById('confirmYes').onclick = function() {
                modal.className = 'modal';
                callback(true);
            };
            document.getElementById('confirmNo').onclick = function() {
                modal.className = 'modal';
                callback(false);
            };
        }
        function showAlert(message, type) {
            const div = document.createElement('div');
            div.className = type || 'info';
            div.textContent = message;
            div.style.margin = '10px 0';
            document.querySelector('.container').insertBefore(div, document.querySelector('.container').firstChild);
        }
    </script>
</head>
<body>
    ${headerHtml}
    <div class="container">
        ${content}
    </div>
    <div id="confirmModal" class="modal">
        <div class="modal-content">
            <h2>Confirmação</h2>
            <p class="modal-message"></p>
            <div class="modal-buttons">
                <button id="confirmYes" class="success">Sim</button>
                <button id="confirmNo" class="secondary">Não</button>
            </div>
        </div>
    </div>
    <div class="footer">
        <p>© 2024 Polícia Federal - Sistema GESP | Versão 21.0.0 | Portal de Segurança Privada</p>
    </div>
</body>
</html>
  `;
}

// =============================================================================
// GESP MOCK SERVER CLASS
// =============================================================================

export class MockGESPServer {
  private server: http.Server | null = null;
  private port: number;
  private data: MockData;
  private sessions: Map<string, SessionData>;

  constructor(options: { port?: number } | number = 3333) {
    const port = typeof options === 'object' ? (options.port || 3333) : options;
    this.port = port;
    this.data = initializeMockData();
    this.sessions = new Map();
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      const onError = (err: any) => {
        console.error(`[GESP Mock Server] Erro ao iniciar:`, err);
        reject(err);
      };

      const onListen = () => {
        console.log(
          `[GESP Mock Server] Iniciado em http://localhost:${this.port}`
        );
        // Remove error listener after successful startup
        this.server?.removeListener('error', onError);
        resolve();
      };

      this.server.once('error', onError);
      this.server.once('listening', onListen);

      this.server.listen(this.port, '127.0.0.1');
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      // Force close all connections after timeout
      const timeout = setTimeout(() => {
        console.warn('[GESP Mock Server] Forced close after timeout');
        resolve();
      }, 5000);

      this.server.close((err) => {
        clearTimeout(timeout);
        if (err) {
          console.error('[GESP Mock Server] Error during close:', err);
        } else {
          console.log('[GESP Mock Server] Encerrado');
        }
        resolve();
      });

      // Destroy all connections to ensure clean shutdown
      this.server.closeAllConnections?.();
    });
  }

  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';
    const query = parsedUrl.query as Record<string, string | string[]>;

    // Log request
    console.log(`[GESP] ${req.method} ${pathname}`);

    // Get session
    const sessionId = this.getSessionId(req);
    let session = this.sessions.get(sessionId) || {
      authenticated: false,
      profileSelected: false,
      termsAgreed: false,
      createdAt: new Date(),
    };

    // Test bypass: X-Test-Auth header skips authentication requirement
    if (req.headers['x-test-auth'] === 'true' && !session.authenticated) {
      session = {
        authenticated: true,
        profileSelected: true,
        termsAgreed: true,
        certificateType: 'e-CNPJ',
        cnpj: '12345678000190',
        userName: 'Test User',
        createdAt: new Date(),
      };
      this.sessions.set(sessionId, session);
    }

    // Collect body for POST requests
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        // Route handling
        if (pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', port: this.port, modules: 11 }));
          return;
        } else if (pathname === '/' || pathname === '/login') {
          this.handleLogin(res, session);
        } else if (pathname === '/gesp/' || pathname === '/gesp') {
          this.handleHome(res, session);
        } else if (pathname === '/gesp/login') {
          this.handleLogin(res, session);
        } else if (
          pathname === '/gesp/certificate-select' ||
          pathname === '/gesp/certificate-select-page' ||
          pathname === '/gesp/certificado'
        ) {
          this.handleCertificateSelect(res, session);
        } else if (pathname === '/gesp/profile-select' || pathname === '/gesp/perfil') {
          this.handleProfileSelect(res, session);
        } else if (pathname === '/gesp/select-profile' && req.method === 'POST') {
          this.handleSelectProfile(req, res, body, session, sessionId);
        } else if (pathname === '/gesp/terms' || pathname === '/gesp/termos') {
          this.handleTerms(res, session);
        } else if (pathname === '/gesp/agree-terms' && req.method === 'POST') {
          this.handleAgreeTerms(res, session, sessionId);
        } else if (pathname === '/gesp/dashboard' || pathname === '/gesp/dashboard/protected') {
          this.handleDashboard(res, session);
        } else if (pathname === '/gesp/logout') {
          this.handleLogout(res, sessionId);
        } else if (pathname === '/gesp/empresa' || pathname === '/gesp/empresa/') {
          res.writeHead(302, { Location: '/gesp/empresa/atualizar' });
          res.end();
        } else if (pathname === '/gesp/empresa/atualizar') {
          this.handleAtualizarDados(res, session);
        } else if (pathname === '/gesp/empresa/procuradores') {
          this.handleGerenciarProcuradores(res, session);
        } else if (pathname === '/gesp/empresa/procuradores/adicionar' && req.method === 'POST') {
          this.handleAdicionarProcurador(res, session);
        } else if (pathname === '/gesp/empresa/gru') {
          this.handleConsultarGRU(res, session);
        } else if (pathname === '/gesp/processo' || pathname === '/gesp/processo/') {
          res.writeHead(302, { Location: '/gesp/processo/acompanhar' });
          res.end();
        } else if (pathname === '/gesp/processo/acompanhar') {
          this.handleAcompanharProcesso(res, session);
        } else if (pathname === '/gesp/processo/solicitar') {
          this.handleSolicitarProcessoMenu(res, session);
        } else if (pathname === '/gesp/processo/solicitar/funcionamento') {
          this.handleSolicitarFuncionamento(res, session);
        } else if (pathname === '/gesp/processo/solicitar/armas') {
          this.handleSolicitarArmas(res, session);
        } else if (pathname === '/gesp/processo/solicitar/atividade') {
          this.handleSolicitarAtividade(res, session);
        } else if (pathname === '/gesp/processo/solicitar/revisao') {
          this.handleSolicitarRevisao(res, session);
        } else if (pathname === '/gesp/processo/solicitar/coletes') {
          this.handleSolicitarColetes(res, session);
        } else if (pathname === '/gesp/processo/editar-rascunhos') {
          this.handleEditarRascunhos(res, session);
        } else if (pathname === '/gesp/processo/responder-notificacao') {
          this.handleResponderNotificacaoProcesso(res, session);
        } else if (pathname === '/gesp/processo/interpor-recurso') {
          this.handleInterporRecurso(res, session);
        } else if (req.method === 'POST' && pathname.startsWith('/gesp/processo/')) {
          this.handleProcessoSubmission(req, res, body, session, sessionId, pathname);
        } else if (pathname === '/gesp/punitivo' || pathname === '/gesp/punitivo/') {
          res.writeHead(302, { Location: '/gesp/punitivo/acompanhar' });
          res.end();
        } else if (pathname === '/gesp/punitivo/acompanhar') {
          this.handleAcompanharPunitivo(res, session);
        } else if (pathname === '/gesp/punitivo/responder-notificacao') {
          this.handleResponderNotificacaoPunitivo(res, session);
        } else if (pathname === '/gesp/punitivo/interpor-recurso') {
          this.handleInterporRecursoPunitivo(res, session);
        } else if (pathname === '/gesp/turma' || pathname === '/gesp/turma/') {
          res.writeHead(302, { Location: '/gesp/turma/criar' });
          res.end();
        } else if (pathname === '/gesp/turma/criar') {
          this.handleCriarTurma(res, session);
        } else if (pathname === '/gesp/turma/criar/submit' && req.method === 'POST') {
          this.handleCriarTurmaSubmit(res, session);
        } else if (pathname === '/gesp/turma/gerenciar') {
          this.handleGerenciarTurma(res, session);
        } else if (pathname === '/gesp/turma/adicionar-alunos') {
          this.handleAdicionarAlunos(res, session);
        } else if (pathname === '/gesp/guia' || pathname === '/gesp/guia/') {
          res.writeHead(302, { Location: '/gesp/guia/solicitar' });
          res.end();
        } else if (pathname === '/gesp/guia/solicitar') {
          this.handleSolicitarGuia(res, session);
        } else if (pathname === '/gesp/guia/acompanhar') {
          this.handleAcompanharGuia(res, session);
        } else if (pathname === '/gesp/ocorrencia' || pathname === '/gesp/ocorrencia/') {
          res.writeHead(302, { Location: '/gesp/ocorrencia/comunicar' });
          res.end();
        } else if (pathname === '/gesp/ocorrencia/comunicar') {
          this.handleComunicarOcorrencia(res, session);
        } else if (pathname === '/gesp/ocorrencia/acompanhar') {
          this.handleAcompanharOcorrencia(res, session);
        } else if (pathname === '/gesp/evento' || pathname === '/gesp/evento/') {
          res.writeHead(302, { Location: '/gesp/evento/comunicar' });
          res.end();
        } else if (pathname === '/gesp/evento/comunicar') {
          this.handleComunicarEvento(res, session);
        } else if (pathname === '/gesp/evento/acompanhar') {
          this.handleAcompanharEvento(res, session);
        } else if (pathname === '/gesp/credenciamento' || pathname === '/gesp/credenciamento/') {
          res.writeHead(302, { Location: '/gesp/credenciamento/credenciar' });
          res.end();
        } else if (pathname === '/gesp/credenciamento/credenciar') {
          this.handleCredenciarInstrutores(res, session);
        } else if (pathname === '/gesp/credenciamento/consultar') {
          this.handleConsultarCredenciamento(res, session);
        } else if (pathname === '/gesp/notificacao' || pathname === '/gesp/notificacao/') {
          res.writeHead(302, { Location: '/gesp/notificacao/consultar' });
          res.end();
        } else if (pathname === '/gesp/notificacao/consultar') {
          this.handleConsultarNotificacao(res, session);
        } else if (pathname === '/gesp/notificacao/responder') {
          this.handleResponderNotificacao(res, session);
        } else if (pathname === '/gesp/notificacao/recurso') {
          this.handleNotificacaoRecurso(res, session);
        } else if (pathname === '/gesp/cnv' || pathname === '/gesp/cnv/') {
          res.writeHead(302, { Location: '/gesp/cnv/consultar' });
          res.end();
        } else if (pathname === '/gesp/cnv/consultar') {
          this.handleConsultarCNV(res, session);
        } else if (pathname === '/gesp/importacao' || pathname === '/gesp/importacao/') {
          res.writeHead(302, { Location: '/gesp/importacao/importar' });
          res.end();
        } else if (pathname === '/gesp/importacao/importar') {
          this.handleImportar(res, session);
        } else if (pathname === '/gesp/importacao/acompanhar') {
          this.handleAcompanharImportacao(res, session);
        } else if (pathname === '/gesp/ajuda') {
          this.handleAjuda(res, session);
        } else {
          this.sendResponse(res, 404, 'text/html', '<h1>404 - Página não encontrada</h1>');
        }
      } catch (err) {
        console.error('[GESP] Erro ao processar requisição:', err);
        this.sendResponse(
          res,
          500,
          'text/html',
          `<h1>Erro interno do servidor</h1><p>${String(err)}</p>`
        );
      }
    });
  }

  // =========================================================================
  // HANDLERS - Authentication
  // =========================================================================

  private handleHome(res: http.ServerResponse, session: SessionData): void {
    if (session.authenticated && session.profileSelected && session.termsAgreed) {
      this.handleDashboard(res, session);
    } else if (session.profileSelected && !session.termsAgreed) {
      this.handleTerms(res, session);
    } else {
      this.handleLogin(res, session);
    }
  }

  private handleLogin(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Login',
      `
      <div class="login-container">
        <div class="login-header">
          <h1>GESP</h1>
          <p>Sistema de Gestão Eletrônica de Segurança Privada</p>
        </div>
        <h2 style="color: #003366; margin-bottom: 20px; text-align: center;">Login Único GOV.BR</h2>
        <p style="text-align: center; margin-bottom: 30px; color: #666;">Selecione seu método de acesso</p>
        <a href="/gesp/certificate-select" class="certificate-option">
          <strong>Seu Certificado Digital</strong>
          <p>Acesse com seu certificado digital (e-CPF ou e-CNPJ)</p>
        </a>
      </div>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleCertificateSelect(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Seleção de Certificado',
      `
      <div class="login-container">
        <div class="login-header">
          <h1>Seleção de Certificado Digital</h1>
          <p>Escolha o certificado que deseja utilizar</p>
        </div>
        <a href="/gesp/profile-select?cert=ecpf" class="certificate-option">
          <strong>e-CPF (Pessoa Física)</strong>
          <p>Certificado digital de CPF para procuradores</p>
        </a>
        <a href="/gesp/profile-select?cert=ecnpj" class="certificate-option">
          <strong>e-CNPJ (Pessoa Jurídica)</strong>
          <p>Certificado digital de CNPJ para empresa</p>
        </a>
      </div>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleProfileSelect(res: http.ServerResponse, session: SessionData): void {
    session.certificateType = 'e-CNPJ';
    const companies = Array.from(this.data.companies.values());

    let tableHtml = `
      <table class="profile-table">
        <thead>
          <tr>
            <th>Tipo Empresa</th>
            <th>CNPJ</th>
            <th>Razão Social</th>
            <th>Perfil</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
    `;

    companies.forEach((company) => {
      tableHtml += `
        <tr>
          <td>${company.tipoAutorizacao}</td>
          <td>${company.cnpj}</td>
          <td>${company.razaoSocial}</td>
          <td>Gerenciador</td>
          <td>
            <form action="/gesp/select-profile" method="POST" style="display: inline;">
              <input type="hidden" name="cnpj" value="${company.cnpjClean}">
              <button type="submit" class="select-btn">Selecionar</button>
            </form>
          </td>
        </tr>
      `;
    });

    tableHtml += `
        </tbody>
      </table>
    `;

    const html = htmlTemplate(
      'GESP - Seleção de Perfil',
      `
      <div style="max-width: 900px; margin: 40px auto;">
        <h2 style="color: #003366; margin-bottom: 20px;">Seleção de Perfil</h2>
        <p style="margin-bottom: 20px; color: #666;">Selecione a empresa e o perfil que deseja acessar:</p>
        ${tableHtml}
      </div>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleSelectProfile(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
    session: SessionData,
    sessionId: string
  ): void {
    const data = qs.parse(body);
    const cnpj = String(data.cnpj || '');

    if (this.data.companies.has(cnpj)) {
      const company = this.data.companies.get(cnpj)!;
      session.cnpj = cnpj;
      session.profileSelected = true;
      session.userName = company.razaoSocial;
      this.sessions.set(sessionId, session);

      // Redirect to terms
      res.writeHead(302, { Location: '/gesp/terms' });
      res.end();
    } else {
      this.sendResponse(res, 400, 'text/html', '<h1>Erro: CNPJ não encontrado</h1>');
    }
  }

  private handleTerms(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Termo de Ciência',
      `
      <div style="max-width: 800px; margin: 40px auto;">
        <h2 style="color: #003366; margin-bottom: 20px;">Termo de Ciência e Responsabilidade</h2>
        <div class="info" style="max-height: 300px; overflow-y: auto;">
          <p><strong>TERMO DE CIÊNCIA E RESPONSABILIDADE</strong></p>
          <p>O usuário declara estar ciente e de acordo com os seguintes termos:</p>
          <ol style="text-align: justify; line-height: 1.6;">
            <li>As informações fornecidas neste sistema são confidenciais e protegidas por lei;</li>
            <li>O usuário é responsável pela guarda e sigilo de suas credenciais de acesso;</li>
            <li>Toda operação realizada será registrada e auditada pelo GESP;</li>
            <li>O usuário concorda em cumprir todas as normas da Polícia Federal;</li>
            <li>A transferência não autorizada de dados é crime conforme Lei 12.965/2014;</li>
            <li>O acesso indevido ao sistema resultará em notificação às autoridades competentes;</li>
            <li>Este termo vincula o usuário e sua empresa perante a Polícia Federal.</li>
          </ol>
        </div>
        <form action="/gesp/agree-terms" method="POST">
          <div class="form-group" style="margin-top: 20px;">
            <label>
              <input type="checkbox" name="agree" value="1" required>
              Concordo com o termo acima
            </label>
          </div>
          <button type="submit" style="width: 100%; padding: 15px;">Concordo e Aceitar</button>
        </form>
      </div>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleAgreeTerms(
    res: http.ServerResponse,
    session: SessionData,
    sessionId: string
  ): void {
    session.termsAgreed = true;
    session.authenticated = true;
    session.lastLoginAt = new Date().toISOString();
    this.sessions.set(sessionId, session);

    res.writeHead(302, { Location: '/gesp/dashboard' });
    res.end();
  }

  private handleLogout(res: http.ServerResponse, sessionId: string): void {
    this.sessions.delete(sessionId);
    res.writeHead(302, { Location: '/gesp/login' });
    res.end();
  }

  // =========================================================================
  // HANDLERS - Dashboard & Main Pages
  // =========================================================================

  private handleDashboard(res: http.ServerResponse, session: SessionData): void {
    if (!session.authenticated) {
      res.writeHead(302, { Location: '/gesp/login' });
      res.end();
      return;
    }

    const company = this.data.companies.get(session.cnpj || '');
    if (!company) {
      this.sendResponse(res, 400, 'text/html', '<h1>Empresa não encontrada</h1>');
      return;
    }

    const processosRecentes = Array.from(this.data.processosAutorizativos.values())
      .filter((p) => p.ano === new Date().getFullYear())
      .slice(0, 5);

    let processosHtml = '';
    if (processosRecentes.length > 0) {
      processosHtml = `
        <h3 style="margin-top: 20px; color: #003366;">Processos Recentes</h3>
        <table>
          <tr>
            <th>Nº Processo</th>
            <th>Tipo</th>
            <th>Situação</th>
            <th>Data Envio</th>
          </tr>
      `;
      processosRecentes.forEach((p) => {
        processosHtml += `
          <tr>
            <td>${p.ano}/${p.numero}</td>
            <td>${p.tipo}</td>
            <td>${p.situacao}</td>
            <td>${p.dataEnvio || '-'}</td>
          </tr>
        `;
      });
      processosHtml += '</table>';
    }

    const html = htmlTemplate(
      'GESP - Dashboard',
      `
      <h1 class="page-title">Bem-vindo ao GESP</h1>
      <div class="warning">
        <strong>Última atualização:</strong> ${new Date().toLocaleString('pt-BR')}
      </div>
      <h2 style="color: #003366; margin-top: 30px;">Informações da Empresa</h2>
      <table>
        <tr>
          <td><strong>CNPJ:</strong></td>
          <td>${company.cnpj}</td>
        </tr>
        <tr>
          <td><strong>Razão Social:</strong></td>
          <td>${company.razaoSocial}</td>
        </tr>
        <tr>
          <td><strong>Nome Fantasia:</strong></td>
          <td>${company.nomeFantasia}</td>
        </tr>
        <tr>
          <td><strong>Email:</strong></td>
          <td>${company.email}</td>
        </tr>
        <tr>
          <td><strong>Telefone:</strong></td>
          <td>${company.telefone}</td>
        </tr>
        <tr>
          <td><strong>Tipo de Autorização:</strong></td>
          <td>${company.tipoAutorizacao}</td>
        </tr>
        <tr>
          <td><strong>Válida até:</strong></td>
          <td>${company.dataValidade}</td>
        </tr>
      </table>
      ${processosHtml}
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Empresa Module
  // =========================================================================

  private handleAtualizarDados(res: http.ServerResponse, session: SessionData): void {
    if (!session.authenticated) {
      res.writeHead(302, { Location: '/gesp/login' });
      res.end();
      return;
    }

    const company = this.data.companies.get(session.cnpj || '');
    if (!company) {
      this.sendResponse(res, 400, 'text/html', '<h1>Empresa não encontrada</h1>');
      return;
    }

    const html = htmlTemplate(
      'GESP - Atualizar Dados',
      `
      <h1 class="page-title">Dados Cadastrais da Empresa</h1>
      <div class="tabs">
        <button class="tab active" onclick="showTab('identificacao')">Identificação</button>
        <button class="tab" onclick="showTab('endereco')">Endereço</button>
        <button class="tab" onclick="showTab('autorizacao')">Dados da Autorização</button>
      </div>
      <div id="identificacao" class="tab-content active">
        <form method="POST">
          <div class="form-row">
            <div class="form-group">
              <label>CNPJ (somente leitura)</label>
              <input type="text" value="${company.cnpj}" readonly>
            </div>
            <div class="form-group">
              <label>Razão Social (somente leitura)</label>
              <input type="text" value="${company.razaoSocial}" readonly>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Nome Fantasia</label>
              <input type="text" value="${company.nomeFantasia}">
            </div>
            <div class="form-group">
              <label>CNAE (somente leitura)</label>
              <input type="text" value="${company.cnae}" readonly>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Email *</label>
              <input type="email" value="${company.email}" required>
            </div>
            <div class="form-group">
              <label>Telefone *</label>
              <input type="tel" value="${company.telefone}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Celular</label>
              <input type="tel" value="">
            </div>
            <div class="form-group">
              <label>Fax</label>
              <input type="tel" value="">
            </div>
          </div>
          <button type="submit">Salvar</button>
        </form>
      </div>
      <div id="endereco" class="tab-content">
        <form method="POST">
          <div class="form-row">
            <div class="form-group">
              <label>Logradouro *</label>
              <input type="text" value="${company.endereco}" required>
            </div>
            <div class="form-group">
              <label>Número *</label>
              <input type="text" value="${company.numero}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Complemento</label>
              <input type="text" value="">
            </div>
            <div class="form-group">
              <label>Bairro *</label>
              <input type="text" value="${company.bairro}" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>UF *</label>
              <select required>
                <option value="${company.uf}" selected>${company.uf}</option>
                <option value="SP">SP</option>
                <option value="RJ">RJ</option>
                <option value="MG">MG</option>
              </select>
            </div>
            <div class="form-group">
              <label>Município *</label>
              <input type="text" value="${company.municipio}" required>
            </div>
          </div>
          <div class="form-group">
            <label>CEP *</label>
            <input type="text" value="${company.cep}" required>
          </div>
          <button type="submit">Salvar</button>
        </form>
      </div>
      <div id="autorizacao" class="tab-content">
        <form method="POST">
          <div class="form-row">
            <div class="form-group">
              <label>Nº da Portaria (somente leitura)</label>
              <input type="text" value="${company.numPortaria}" readonly>
            </div>
            <div class="form-group">
              <label>Tipo de Autorização *</label>
              <select required>
                <option value="${company.tipoAutorizacao}" selected>${company.tipoAutorizacao}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Data de Publicação (somente leitura)</label>
              <input type="date" value="${company.dataPublicacao}" readonly>
            </div>
            <div class="form-group">
              <label>Data de Validade (somente leitura)</label>
              <input type="date" value="${company.dataValidade}" readonly>
            </div>
          </div>
          <button type="submit">Salvar</button>
        </form>
      </div>
      <script>
        function showTab(tabName) {
          const contents = document.querySelectorAll('.tab-content');
          contents.forEach(c => c.classList.remove('active'));
          document.getElementById(tabName).classList.add('active');

          const tabs = document.querySelectorAll('.tab');
          tabs.forEach(t => t.classList.remove('active'));
          event.target.classList.add('active');
        }
      </script>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleGerenciarProcuradores(res: http.ServerResponse, session: SessionData): void {
    if (!session.authenticated) {
      res.writeHead(302, { Location: '/gesp/login' });
      res.end();
      return;
    }

    const procuradores = this.data.procuradores.get(session.cnpj || '') || [];

    let tableHtml = `
      <table>
        <tr>
          <th>CPF</th>
          <th>Nome do Procurador</th>
          <th>Data Início</th>
          <th>Data Fim</th>
          <th>Situação</th>
          <th>Ações</th>
        </tr>
    `;

    procuradores.forEach((proc) => {
      tableHtml += `
        <tr>
          <td>${proc.cpf}</td>
          <td>${proc.nome}</td>
          <td>${proc.dataInicio}</td>
          <td>${proc.dataFim}</td>
          <td>
            <span style="background: ${proc.situacao === 'Vigente' ? '#90EE90' : '#FFB6C6'}; padding: 4px 8px; border-radius: 3px;">
              ${proc.situacao}
            </span>
          </td>
          <td>
            <div class="action-icons">
              <button>Editar</button>
              <button class="delete">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    });

    tableHtml += '</table>';

    const html = htmlTemplate(
      'GESP - Gerenciar Procuradores',
      `
      <h1 class="page-title">Gerenciar Procuradores</h1>
      <div style="margin-bottom: 20px;">
        <label>Situação da Procuração:</label>
        <select style="width: 250px;">
          <option>Vigentes</option>
          <option>Revogadas</option>
          <option>Todas</option>
        </select>
      </div>
      <button style="margin-bottom: 20px;">+ Incluir Procurador</button>
      ${tableHtml}
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleAdicionarProcurador(res: http.ServerResponse, session: SessionData): void {
    // Simple POST handler that returns success
    const html = htmlTemplate(
      'GESP - Procurador Adicionado',
      `
      <h1 class="page-title">Procurador Adicionado com Sucesso</h1>
      <div class="success">
        O procurador foi adicionado à sua empresa com sucesso!
      </div>
      <a href="/gesp/empresa/procuradores"><button>Voltar para Gerenciar Procuradores</button></a>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleConsultarGRU(res: http.ServerResponse, session: SessionData): void {
    if (!session.authenticated) {
      res.writeHead(302, { Location: '/gesp/login' });
      res.end();
      return;
    }

    const saldo = this.data.gruSaldos.get(session.cnpj || '') || 0;

    const html = htmlTemplate(
      'GESP - Consultar GRU',
      `
      <h1 class="page-title">Consultar Saldo GRU</h1>
      <div class="warning">
        <strong>Observação:</strong> Esta consulta envolve todos os tipos de processos
      </div>
      <form method="POST" style="max-width: 600px;">
        <div class="form-group">
          <label>Linha Digitável (nº da 1ª linha da GRU)</label>
          <input type="text" name="linhaDigitavel" placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000" style="font-family: monospace;">
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="submit">CONSULTAR</button>
          <button type="reset" class="secondary">LIMPAR</button>
        </div>
      </form>
      <div style="margin-top: 30px;">
        <h3 style="color: #003366;">Saldo Disponível</h3>
        <div class="success" style="font-size: 18px; padding: 20px;">
          <strong>R$ ${saldo.toFixed(2).replace('.', ',')}</strong>
        </div>
      </div>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Processo Autorizativo Module
  // =========================================================================

  private handleAcompanharProcesso(res: http.ServerResponse, session: SessionData): void {
    if (!session.authenticated) {
      res.writeHead(302, { Location: '/gesp/login' });
      res.end();
      return;
    }

    const processosRecentes = Array.from(this.data.processosAutorizativos.values())
      .filter((p) => p.ano === new Date().getFullYear())
      .slice(0, 10);

    let tableHtml = `
      <table>
        <tr>
          <th>Nº Processo</th>
          <th>Tipo</th>
          <th>Data de Envio</th>
          <th>Situação</th>
          <th>Ações</th>
        </tr>
    `;

    processosRecentes.forEach((p) => {
      const situacaoCor =
        p.situacao === 'Deferido'
          ? '#90EE90'
          : p.situacao === 'Em Análise'
            ? '#FFE4B5'
            : '#FFB6C6';
      tableHtml += `
        <tr>
          <td>${p.ano}/${String(p.numero).padStart(4, '0')}</td>
          <td>${p.tipo}</td>
          <td>${p.dataEnvio || '-'}</td>
          <td><span style="background: ${situacaoCor}; padding: 4px 8px; border-radius: 3px;">${p.situacao}</span></td>
          <td>
            <div class="action-icons">
              <a href="#">Visualizar</a>
              <a href="#">Editar</a>
            </div>
          </td>
        </tr>
      `;
    });

    tableHtml += '</table>';

    const html = htmlTemplate(
      'GESP - Acompanhar Processos Autorizativos',
      `
      <h1 class="page-title">Acompanhamento de Processos Autorizativos</h1>
      <form method="GET" style="margin-bottom: 20px;">
        <div class="form-row">
          <div class="form-group">
            <label>Ano</label>
            <input type="number" name="ano" value="${new Date().getFullYear()}">
          </div>
          <div class="form-group">
            <label>Número Processo</label>
            <input type="number" name="numero">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo Processo</label>
            <select name="tipo">
              <option value="">Selecione...</option>
              <option>Autorização de Funcionamento</option>
              <option>Aquisição de Armas</option>
              <option>Nova Atividade</option>
            </select>
          </div>
          <div class="form-group">
            <label>Situação Processo</label>
            <select name="situacao">
              <option value="">Selecione...</option>
              <option>Rascunho</option>
              <option>Em Análise</option>
              <option>Deferido</option>
              <option>Indeferido</option>
            </select>
          </div>
        </div>
        <button type="submit">Pesquisar</button>
      </form>
      ${tableHtml}
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleSolicitarProcessoMenu(res: http.ServerResponse, session: SessionData): void {
    if (!session.authenticated) {
      res.writeHead(302, { Location: '/gesp/login' });
      res.end();
      return;
    }

    const html = htmlTemplate(
      'GESP - Solicitar Processo',
      `
      <h1 class="page-title">Solicitar Processo Autorizativo</h1>
      <p style="margin-bottom: 30px;">Escolha o tipo de autorização que deseja solicitar:</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
        <a href="/gesp/processo/solicitar/funcionamento" style="text-decoration: none;">
          <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
            <h3 style="color: #003366; margin-bottom: 10px;">Autorização de Funcionamento</h3>
            <p style="color: #666; font-size: 14px;">Solicitar renovação ou nova autorização de funcionamento da empresa.</p>
          </div>
        </a>
        <a href="/gesp/processo/solicitar/armas" style="text-decoration: none;">
          <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
            <h3 style="color: #003366; margin-bottom: 10px;">Aquisição de Armas e Munições</h3>
            <p style="color: #666; font-size: 14px;">Solicitar autorização para aquisição de armas e munições.</p>
          </div>
        </a>
        <a href="/gesp/processo/solicitar/atividade" style="text-decoration: none;">
          <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
            <h3 style="color: #003366; margin-bottom: 10px;">Autorização de Nova Atividade</h3>
            <p style="color: #666; font-size: 14px;">Solicitar autorização para exercer nova atividade de segurança.</p>
          </div>
        </a>
        <a href="/gesp/processo/solicitar/revisao" style="text-decoration: none;">
          <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;">
            <h3 style="color: #003366; margin-bottom: 10px;">Solicitar Revisão</h3>
            <p style="color: #666; font-size: 14px;">Solicitar revisão de decisão anterior.</p>
          </div>
        </a>
      </div>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleSolicitarFuncionamento(res: http.ServerResponse, session: SessionData): void {
    if (!session.authenticated) {
      res.writeHead(302, { Location: '/gesp/login' });
      res.end();
      return;
    }

    const company = this.data.companies.get(session.cnpj || '');

    const html = htmlTemplate(
      'GESP - Solicitar Autorização de Funcionamento',
      `
      <h1 class="page-title">Solicitar Autorização de Funcionamento</h1>
      <div class="button-bar">
        <button>← Voltar</button>
        <button class="danger">EXCLUIR</button>
        <button class="secondary">VERIFICAR</button>
        <button class="success">ENVIAR</button>
      </div>
      <div class="tabs">
        <button class="tab active" onclick="showTab('dados')">Dados Básicos</button>
        <button class="tab" onclick="showTab('gru')">Guias de Recolhimento</button>
        <button class="tab" onclick="showTab('atividades')">Atividades</button>
        <button class="tab" onclick="showTab('documentos')">Documentos</button>
      </div>
      <div id="dados" class="tab-content active">
        <h3>Informações Básicas</h3>
        <div class="form-row">
          <div class="form-group">
            <label>CNPJ (somente leitura)</label>
            <input type="text" value="${company?.cnpj || ''}" readonly>
          </div>
          <div class="form-group">
            <label>Razão Social (somente leitura)</label>
            <input type="text" value="${company?.razaoSocial || ''}" readonly>
          </div>
        </div>
        <h3 style="margin-top: 20px;">Guias de Recolhimento</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Fonte de Arrecadação</label>
            <input type="text" placeholder="140244">
          </div>
          <div class="form-group">
            <label>Linha Digitável</label>
            <input type="text" placeholder="Nº da 1ª linha da GRU">
          </div>
        </div>
        <button>Adicionar GRU</button>
        <button type="submit" style="margin-top: 20px;">Salvar</button>
      </div>
      <div id="gru" class="tab-content">
        <h3>Guias de Recolhimento Adicionadas</h3>
        <p style="color: #666;">Nenhuma guia adicionada ainda.</p>
      </div>
      <div id="atividades" class="tab-content">
        <h3>Atividades Autorizadas</h3>
        <div class="form-group">
          <label><input type="checkbox"> Vigilância Patrimonial</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox"> Transporte de Valores</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox"> Escolta Armada</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox"> Segurança Pessoal</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox"> Curso de Formação</label>
        </div>
      </div>
      <div id="documentos" class="tab-content">
        <h3>Documentos Obrigatórios</h3>
        <table>
          <tr>
            <th>Tipo de Documento</th>
            <th>Status</th>
            <th>Ação</th>
          </tr>
          <tr>
            <td>Contrato Social</td>
            <td><span style="background: #FFB6C6; padding: 4px 8px; border-radius: 3px;">Pendente</span></td>
            <td><button class="secondary">Anexar</button></td>
          </tr>
          <tr>
            <td>Comprovante de Endereço</td>
            <td><span style="background: #FFB6C6; padding: 4px 8px; border-radius: 3px;">Pendente</span></td>
            <td><button class="secondary">Anexar</button></td>
          </tr>
        </table>
      </div>
      <script>
        function showTab(tabName) {
          const contents = document.querySelectorAll('.tab-content');
          contents.forEach(c => c.classList.remove('active'));
          document.getElementById(tabName).classList.add('active');

          const tabs = document.querySelectorAll('.tab');
          tabs.forEach(t => t.classList.remove('active'));
          event.target.classList.add('active');
        }
      </script>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleSolicitarArmas(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Solicitar Aquisição de Armas',
      `
      <h1 class="page-title">Solicitar Aquisição de Armas e Munições</h1>
      <div class="button-bar">
        <button>← Voltar</button>
        <button class="danger">EXCLUIR</button>
        <button class="secondary">VERIFICAR</button>
        <button class="success">ENVIAR</button>
      </div>
      <div class="tabs">
        <button class="tab active" onclick="showTab('armas')">Armas</button>
        <button class="tab" onclick="showTab('municoes')">Munições</button>
      </div>
      <div id="armas" class="tab-content active">
        <h3>Armas a Adquirir</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de Arma</label>
            <select>
              <option>Selecione...</option>
              <option>Pistola</option>
              <option>Revólver</option>
              <option>Espingarda</option>
            </select>
          </div>
          <div class="form-group">
            <label>Calibre</label>
            <input type="text" placeholder=".38 / 9mm / .40 / 12">
          </div>
          <div class="form-group">
            <label>Quantidade</label>
            <input type="number" min="1">
          </div>
        </div>
        <button>Adicionar Arma</button>
      </div>
      <div id="municoes" class="tab-content">
        <h3>Munições a Adquirir</h3>
        <p style="color: #666;">Nenhuma munição adicionada ainda.</p>
      </div>
      <script>
        function showTab(tabName) {
          const contents = document.querySelectorAll('.tab-content');
          contents.forEach(c => c.classList.remove('active'));
          document.getElementById(tabName).classList.add('active');

          const tabs = document.querySelectorAll('.tab');
          tabs.forEach(t => t.classList.remove('active'));
          event.target.classList.add('active');
        }
      </script>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleSolicitarAtividade(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Solicitar Nova Atividade',
      `
      <h1 class="page-title">Solicitar Autorização de Nova Atividade</h1>
      <div class="button-bar">
        <button>← Voltar</button>
        <button class="danger">EXCLUIR</button>
        <button class="secondary">VERIFICAR</button>
        <button class="success">ENVIAR</button>
      </div>
      <form method="POST">
        <h3>Selecione a Atividade</h3>
        <div class="form-group">
          <label><input type="radio" name="atividade" value="vigilancia"> Vigilância Patrimonial</label>
        </div>
        <div class="form-group">
          <label><input type="radio" name="atividade" value="transporte"> Transporte de Valores</label>
        </div>
        <div class="form-group">
          <label><input type="radio" name="atividade" value="escolta"> Escolta Armada</label>
        </div>
        <div class="form-group">
          <label><input type="radio" name="atividade" value="seguranca"> Segurança Pessoal</label>
        </div>
        <button type="submit">Próximo</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleSolicitarRevisao(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Solicitar Revisão',
      `
      <h1 class="page-title">Solicitar Revisão de Autorização</h1>
      <div class="button-bar">
        <button>← Voltar</button>
        <button class="danger">EXCLUIR</button>
        <button class="secondary">VERIFICAR</button>
        <button class="success">ENVIAR</button>
      </div>
      <form method="POST">
        <div class="form-group">
          <label>Motivo da Revisão *</label>
          <textarea required placeholder="Descreva o motivo para solicitação de revisão"></textarea>
        </div>
        <button type="submit">Salvar</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleSolicitarColetes(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Solicitar Coletes',
      `
      <h1 class="page-title">Solicitar Aquisição de Coletes</h1>
      <div class="button-bar">
        <button>← Voltar</button>
        <button class="danger">EXCLUIR</button>
        <button class="secondary">VERIFICAR</button>
        <button class="success">ENVIAR</button>
      </div>
      <form method="POST">
        <h3>Coletes a Adquirir</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de Colete</label>
            <select>
              <option>Selecione...</option>
              <option>Nível II</option>
              <option>Nível III</option>
              <option>Nível IV</option>
            </select>
          </div>
          <div class="form-group">
            <label>Quantidade</label>
            <input type="number" min="1">
          </div>
        </div>
        <button>Adicionar Colete</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleEditarRascunhos(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Editar Rascunhos',
      `
      <h1 class="page-title">Editar Rascunhos</h1>
      <table>
        <tr>
          <th>Nº Rascunho</th>
          <th>Tipo de Processo</th>
          <th>Data Criação</th>
          <th>Ações</th>
        </tr>
        <tr>
          <td>1</td>
          <td>Autorização de Funcionamento</td>
          <td>2024-01-15</td>
          <td>
            <div class="action-icons">
              <a href="#">Editar</a>
              <a href="#" class="delete">Excluir</a>
            </div>
          </td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleResponderNotificacaoProcesso(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Responder Notificação',
      `
      <h1 class="page-title">Responder Notificação</h1>
      <table>
        <tr>
          <th>Nº Processo</th>
          <th>Tipo</th>
          <th>Data Notificação</th>
          <th>Prazo</th>
          <th>Ações</th>
        </tr>
        <tr>
          <td>2024/0001</td>
          <td>Autorização de Funcionamento</td>
          <td>2024-01-20</td>
          <td>30 dias</td>
          <td><a href="#"><button>Responder</button></a></td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleInterporRecurso(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Interpor Recurso',
      `
      <h1 class="page-title">Interpor Recurso</h1>
      <div class="button-bar">
        <button>← Voltar</button>
        <button class="danger">EXCLUIR</button>
        <button class="secondary">VERIFICAR</button>
        <button class="success">ENVIAR</button>
      </div>
      <form method="POST">
        <div class="form-row">
          <div class="form-group">
            <label>Nº do Processo *</label>
            <input type="text" required placeholder="AAAA/NNNN">
          </div>
        </div>
        <div class="form-group">
          <label>Motivo/Fundamento do Recurso *</label>
          <textarea required placeholder="Descreva os fundamentos do seu recurso"></textarea>
        </div>
        <div class="form-group">
          <label>Documentos de Suporte</label>
          <input type="file" multiple>
        </div>
        <button type="submit">Enviar</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleProcessoSubmission(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
    session: SessionData,
    sessionId: string,
    pathname: string
  ): void {
    // Check for ENVIAR action
    if (body.includes('ENVIAR') || body.includes('action=enviar')) {
      // Create new processo
      const ano = new Date().getFullYear();
      const numero = Math.floor(Math.random() * 10000) + 1;
      const protocolo = `${ano}/${String(numero).padStart(4, '0')}`;

      const processo: ProcessoAutorizativo = {
        id: `${ano}-${numero}`,
        ano,
        numero,
        tipo: 'Processo Enviado',
        dataCriacao: new Date().toISOString().split('T')[0],
        dataEnvio: new Date().toISOString().split('T')[0],
        situacao: 'Enviado',
        dados: {},
      };

      this.data.processosAutorizativos.set(processo.id, processo);

      // Return success page
      const html = htmlTemplate(
        'GESP - Processo Enviado',
        `
        <h1 class="page-title">Processo Enviado com Sucesso</h1>
        <div class="protocol">
          Nº Processo: ${protocolo}
        </div>
        <div class="success">
          Seu processo foi enviado com sucesso! Você pode acompanhar o status em "Acompanhar Processos".
        </div>
        <a href="/gesp/processo/acompanhar"><button>Voltar para Acompanhamento</button></a>
        `,
        session
      );
      this.sendResponse(res, 200, 'text/html', html);
    } else {
      // Just save draft
      res.writeHead(302, { Location: '/gesp/dashboard' });
      res.end();
    }
  }

  // =========================================================================
  // HANDLERS - Processo Punitivo Module
  // =========================================================================

  private handleAcompanharPunitivo(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Acompanhar Processos Punitivos',
      `
      <h1 class="page-title">Acompanhamento de Processos Punitivos</h1>
      <form method="GET" style="margin-bottom: 20px;">
        <div class="form-row">
          <div class="form-group">
            <label>Nº Processo</label>
            <input type="text" placeholder="AAAA/NNNN">
          </div>
          <div class="form-group">
            <label>Situação</label>
            <select>
              <option>Selecione...</option>
              <option>Deferido</option>
              <option>Indeferido</option>
              <option>Em Análise</option>
            </select>
          </div>
        </div>
        <button>Pesquisar</button>
      </form>
      <table>
        <tr>
          <th>Nº Processo</th>
          <th>Tipo</th>
          <th>Data Envio</th>
          <th>Situação</th>
          <th>Ações</th>
        </tr>
        <tr>
          <td>2024/0001</td>
          <td>Processo Punitivo</td>
          <td>2024-01-20</td>
          <td><span style="background: #FFE4B5; padding: 4px 8px; border-radius: 3px;">Em Análise</span></td>
          <td><a href="#"><button>Visualizar</button></a></td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleResponderNotificacaoPunitivo(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Responder Notificação Punitiva',
      `
      <h1 class="page-title">Responder Notificação</h1>
      <form method="POST">
        <div class="form-group">
          <label>Justificativa *</label>
          <textarea required placeholder="Descreva sua defesa"></textarea>
        </div>
        <div class="form-group">
          <label>Documentos de Defesa</label>
          <input type="file" multiple>
        </div>
        <button type="submit">Enviar Resposta</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleInterporRecursoPunitivo(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Interpor Recurso Punitivo',
      `
      <h1 class="page-title">Interpor Recurso</h1>
      <div class="warning">Prazo para interposição: 10 dias da notificação</div>
      <form method="POST">
        <div class="form-group">
          <label>Fundamento do Recurso *</label>
          <textarea required placeholder="Descreva os fundamentos do recurso"></textarea>
        </div>
        <button type="submit">Enviar Recurso</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Turma Module
  // =========================================================================

  private handleCriarTurma(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Criar Turma',
      `
      <h1 class="page-title">Criar Turma</h1>
      <form method="POST">
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de Curso *</label>
            <select required>
              <option value="">Selecione...</option>
              <option>Curso de Formação</option>
              <option>Curso de Reciclagem</option>
            </select>
          </div>
          <div class="form-group">
            <label>Local *</label>
            <input type="text" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Data Início *</label>
            <input type="date" required>
          </div>
          <div class="form-group">
            <label>Data Término *</label>
            <input type="date" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Horário *</label>
            <input type="time" required>
          </div>
          <div class="form-group">
            <label>Carga Horária (horas) *</label>
            <input type="number" min="1" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label><input type="checkbox" name="excedentes"> Turma com excedentes</label>
          </div>
          <div class="form-group">
            <label>Limite de Alunos (45 ou 60)</label>
            <select required>
              <option value="45">45</option>
              <option value="60">60</option>
            </select>
          </div>
        </div>
        <button type="submit">Criar Turma</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleCriarTurmaSubmit(res: http.ServerResponse, session: SessionData): void {
    // Generate new turma ID and return success
    const turmaId = `TRM-${Date.now()}`;
    const html = htmlTemplate(
      'GESP - Turma Criada',
      `
      <h1 class="page-title">Turma Criada com Sucesso</h1>
      <div class="success">
        Sua turma foi criada com sucesso!
      </div>
      <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;">
        <p><strong>Identificador da Turma:</strong> ${turmaId}</p>
        <p>Você pode agora adicionar alunos à turma ou gerenciar outras configurações.</p>
      </div>
      <a href="/gesp/turma/gerenciar"><button>Voltar para Gerenciar Turmas</button></a>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleGerenciarTurma(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Gerenciar Turmas',
      `
      <h1 class="page-title">Gerenciar Turmas</h1>
      <button style="margin-bottom: 20px;">+ Nova Turma</button>
      <table>
        <tr>
          <th>Tipo Curso</th>
          <th>Data Início</th>
          <th>Data Término</th>
          <th>Alunos</th>
          <th>Limite</th>
          <th>Ações</th>
        </tr>
        <tr>
          <td>Curso de Formação</td>
          <td>2024-02-01</td>
          <td>2024-03-15</td>
          <td>30</td>
          <td>45</td>
          <td>
            <div class="action-icons">
              <a href="#">Editar</a>
              <a href="#">Deletar</a>
            </div>
          </td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleAdicionarAlunos(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Adicionar Alunos',
      `
      <h1 class="page-title">Adicionar Alunos à Turma</h1>
      <form method="POST">
        <div class="form-row">
          <div class="form-group">
            <label>Turma *</label>
            <select required>
              <option value="">Selecione...</option>
              <option>Curso de Formação - Fev/2024</option>
            </select>
          </div>
          <div class="form-group">
            <label>CPF do Aluno *</label>
            <input type="text" placeholder="000.000.000-00" required>
          </div>
        </div>
        <button type="submit">Adicionar</button>
      </form>
      <h3 style="margin-top: 30px;">Alunos na Turma</h3>
      <table>
        <tr>
          <th>CPF</th>
          <th>Nome</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
        <tr>
          <td>000.000.000-00</td>
          <td>Aluno Exemplo</td>
          <td>Ativo</td>
          <td><button class="danger">Remover</button></td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Guia de Transporte Module
  // =========================================================================

  private handleSolicitarGuia(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Solicitar Guia de Transporte',
      `
      <h1 class="page-title">Solicitar Guia de Transporte</h1>
      <form method="POST">
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de Produto *</label>
            <select required>
              <option value="">Selecione...</option>
              <option>Armas</option>
              <option>Munições</option>
              <option>Coletes</option>
            </select>
          </div>
          <div class="form-group">
            <label>Tipo de Arma</label>
            <select>
              <option>Pistola</option>
              <option>Revólver</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Calibre</label>
            <input type="text" placeholder=".38 / 9mm / .40">
          </div>
          <div class="form-group">
            <label>Quantidade *</label>
            <input type="number" min="1" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Origem *</label>
            <input type="text" required placeholder="Cidade/UF">
          </div>
          <div class="form-group">
            <label>Destino *</label>
            <input type="text" required placeholder="Cidade/UF">
          </div>
        </div>
        <button type="submit">Solicitar</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleAcompanharGuia(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Acompanhar Guias de Transporte',
      `
      <h1 class="page-title">Acompanhar Guias de Transporte</h1>
      <form method="GET" style="margin-bottom: 20px;">
        <input type="text" placeholder="Número da Guia">
        <button type="submit">Pesquisar</button>
      </form>
      <table>
        <tr>
          <th>Nº Guia</th>
          <th>Tipo Produto</th>
          <th>Quantidade</th>
          <th>Origem</th>
          <th>Destino</th>
          <th>Situação</th>
        </tr>
        <tr>
          <td>2024/001</td>
          <td>Armas</td>
          <td>5</td>
          <td>Brasília/DF</td>
          <td>São Paulo/SP</td>
          <td><span style="background: #90EE90; padding: 4px 8px; border-radius: 3px;">Autorizada</span></td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Comunicação de Ocorrência Module
  // =========================================================================

  private handleComunicarOcorrencia(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Comunicar Ocorrência',
      `
      <h1 class="page-title">Comunicar Ocorrência</h1>
      <div class="warning"><strong>Prazo:</strong> Até 24 horas após o fato</div>
      <form method="POST">
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de Ocorrência *</label>
            <select required>
              <option value="">Selecione...</option>
              <option>Roubo</option>
              <option>Tentativa de Roubo</option>
              <option>Acidente</option>
              <option>Óbito</option>
              <option>Lesão Corporal</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data/Hora da Ocorrência *</label>
            <input type="datetime-local" required>
          </div>
        </div>
        <div class="form-group">
          <label>Local da Ocorrência *</label>
          <input type="text" required>
        </div>
        <div class="form-group">
          <label>Descrição Detalhada *</label>
          <textarea required placeholder="Descreva os fatos da ocorrência"></textarea>
        </div>
        <div class="form-group">
          <label>Envolvidos</label>
          <textarea placeholder="Nomes e dados dos envolvidos"></textarea>
        </div>
        <button type="submit">Comunicar</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleAcompanharOcorrencia(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Acompanhar Ocorrências',
      `
      <h1 class="page-title">Acompanhar Comunicações de Ocorrência</h1>
      <table>
        <tr>
          <th>Nº Comunicação</th>
          <th>Tipo</th>
          <th>Data</th>
          <th>Situação</th>
          <th>Ações</th>
        </tr>
        <tr>
          <td>2024/001</td>
          <td>Roubo</td>
          <td>2024-01-20</td>
          <td><span style="background: #90EE90; padding: 4px 8px; border-radius: 3px;">Recebida</span></td>
          <td><a href="#"><button>Visualizar</button></a></td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Comunicação de Evento Module
  // =========================================================================

  private handleComunicarEvento(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Comunicar Evento',
      `
      <h1 class="page-title">Comunicar Evento</h1>
      <form method="POST">
        <div class="form-row">
          <div class="form-group">
            <label>Tipo de Evento *</label>
            <select required>
              <option value="">Selecione...</option>
              <option>Contratação de Vigilante</option>
              <option>Demissão de Vigilante</option>
              <option>Compra de Armamento</option>
              <option>Alteração de Dados</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Data/Hora Início *</label>
            <input type="datetime-local" required>
          </div>
          <div class="form-group">
            <label>Data/Hora Término</label>
            <input type="datetime-local">
          </div>
        </div>
        <div class="form-group">
          <label>Local *</label>
          <input type="text" required>
        </div>
        <div class="form-group">
          <label>Descrição *</label>
          <textarea required></textarea>
        </div>
        <button type="submit">Comunicar</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleAcompanharEvento(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Acompanhar Eventos',
      `
      <h1 class="page-title">Acompanhar Comunicações de Evento</h1>
      <table>
        <tr>
          <th>Nº Comunicação</th>
          <th>Tipo</th>
          <th>Data</th>
          <th>Situação</th>
        </tr>
        <tr>
          <td>2024/001</td>
          <td>Contratação de Vigilante</td>
          <td>2024-01-20</td>
          <td><span style="background: #90EE90; padding: 4px 8px; border-radius: 3px;">Registrada</span></td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Credenciamento de Instrutores Module
  // =========================================================================

  private handleCredenciarInstrutores(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Credenciar Instrutor',
      `
      <h1 class="page-title">Credenciar Instrutor</h1>
      <form method="POST">
        <div class="form-group">
          <label>CPF do Instrutor *</label>
          <input type="text" placeholder="000.000.000-00" required>
        </div>
        <div class="form-group">
          <label>Nome (preenchido automaticamente)</label>
          <input type="text" readonly placeholder="Será preenchido após busca do CPF">
        </div>
        <h3>Disciplinas para Ministrar</h3>
        <div class="form-group">
          <label><input type="checkbox"> Técnicas de Vigilância</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox"> Técnicas de Defesa</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox"> Legislação</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox"> Armamento</label>
        </div>
        <div class="form-group">
          <label>Documentos de Qualificação</label>
          <input type="file" multiple>
        </div>
        <button type="submit">Credenciar</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleConsultarCredenciamento(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Consultar Credenciamento',
      `
      <h1 class="page-title">Consultar Instrutores Credenciados</h1>
      <input type="text" placeholder="Buscar por CPF ou Nome" style="width: 300px;">
      <button>Buscar</button>
      <table style="margin-top: 20px;">
        <tr>
          <th>CPF</th>
          <th>Nome</th>
          <th>Disciplinas</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
        <tr>
          <td>000.000.000-00</td>
          <td>Instrutor Exemplo</td>
          <td>Técnicas de Vigilância, Legislação</td>
          <td><span style="background: #90EE90; padding: 4px 8px; border-radius: 3px;">Ativo</span></td>
          <td><a href="#"><button>Visualizar</button></a></td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Notificação Autônoma Module
  // =========================================================================

  private handleConsultarNotificacao(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Consultar Notificações',
      `
      <h1 class="page-title">Consultar Notificações Autônomas</h1>
      <form method="GET" style="margin-bottom: 20px;">
        <input type="text" placeholder="Número da Notificação">
        <button type="submit">Pesquisar</button>
      </form>
      <table>
        <tr>
          <th>Nº Notificação</th>
          <th>Tipo</th>
          <th>Data</th>
          <th>Prazo Resposta</th>
          <th>Situação</th>
          <th>Ações</th>
        </tr>
        <tr>
          <td>2024/001</td>
          <td>Informação de Dados</td>
          <td>2024-01-20</td>
          <td>30 dias</td>
          <td><span style="background: #FFE4B5; padding: 4px 8px; border-radius: 3px;">Pendente</span></td>
          <td><a href="#"><button>Responder</button></a></td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleResponderNotificacao(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Responder Notificação',
      `
      <h1 class="page-title">Responder Notificação Autônoma</h1>
      <div class="warning"><strong>Prazo:</strong> 30 dias para resposta</div>
      <form method="POST">
        <div class="form-group">
          <label>Nº Notificação</label>
          <input type="text" readonly value="2024/001">
        </div>
        <div class="form-group">
          <label>Resposta/Justificativa *</label>
          <textarea required placeholder="Digite sua resposta"></textarea>
        </div>
        <div class="form-group">
          <label>Documentos de Comprovação</label>
          <input type="file" multiple>
        </div>
        <button type="submit">Enviar Resposta</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleNotificacaoRecurso(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Interpor Recurso',
      `
      <h1 class="page-title">Interpor Recurso de Notificação</h1>
      <div class="warning"><strong>Prazo:</strong> 10 dias após resposta</div>
      <form method="POST">
        <div class="form-group">
          <label>Nº Notificação</label>
          <input type="text" readonly value="2024/001">
        </div>
        <div class="form-group">
          <label>Fundamento do Recurso *</label>
          <textarea required></textarea>
        </div>
        <button type="submit">Interpor Recurso</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - CNV Module
  // =========================================================================

  private handleConsultarCNV(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Consultar CNV',
      `
      <h1 class="page-title">Consultar Carteira Nacional de Vigilante</h1>
      <form method="POST" style="margin-bottom: 20px;">
        <div class="form-row">
          <div class="form-group">
            <label>CPF do Vigilante *</label>
            <input type="text" placeholder="000.000.000-00" required>
          </div>
        </div>
        <button type="submit">Consultar</button>
      </form>
      <h3>Resultado da Consulta</h3>
      <table>
        <tr>
          <td><strong>Nome:</strong></td>
          <td>Vigilante Exemplo</td>
        </tr>
        <tr>
          <td><strong>CNV Número:</strong></td>
          <td>2025-000001</td>
        </tr>
        <tr>
          <td><strong>Data Emissão:</strong></td>
          <td>2024-01-15</td>
        </tr>
        <tr>
          <td><strong>Validade:</strong></td>
          <td>2027-01-15</td>
        </tr>
        <tr>
          <td><strong>UF:</strong></td>
          <td>DF</td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Importação Module
  // =========================================================================

  private handleImportar(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Importar XML',
      `
      <h1 class="page-title">Importar Arquivo XML</h1>
      <form method="POST" enctype="multipart/form-data">
        <div class="form-group">
          <label>Tipo de Arquivo *</label>
          <select required>
            <option value="">Selecione...</option>
            <option>Pessoa v1.0</option>
            <option>Pessoa v2.0</option>
            <option>Veículo v1.0</option>
            <option>Veículo v2.0</option>
            <option>Aluno</option>
          </select>
        </div>
        <div class="form-group">
          <label>Arquivo XML *</label>
          <input type="file" accept=".xml" required>
        </div>
        <button type="submit">Importar</button>
      </form>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  private handleAcompanharImportacao(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Acompanhar Importações',
      `
      <h1 class="page-title">Acompanhar Importações</h1>
      <table>
        <tr>
          <th>Data/Hora</th>
          <th>Tipo</th>
          <th>Registros Processados</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
        <tr>
          <td>2024-01-20 14:30</td>
          <td>Pessoa v2.0</td>
          <td>25</td>
          <td><span style="background: #90EE90; padding: 4px 8px; border-radius: 3px;">Concluída</span></td>
          <td><a href="#"><button>Detalhes</button></a></td>
        </tr>
      </table>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // HANDLERS - Help
  // =========================================================================

  private handleAjuda(res: http.ServerResponse, session: SessionData): void {
    const html = htmlTemplate(
      'GESP - Ajuda',
      `
      <h1 class="page-title">Ajuda e Suporte</h1>
      <div class="card">
        <h2>Contato da Polícia Federal</h2>
        <p><strong>Telefone de Suporte:</strong> 194 (ramal GESP)</p>
        <p><strong>Email:</strong> dicof.cgcsp.dpa@pf.gov.br</p>
        <p><strong>Horário de Atendimento:</strong> Segunda a Sexta, 08:00 às 18:00</p>
      </div>
      <div class="card">
        <h2>Documentação</h2>
        <ul>
          <li><a href="#">Manual do GESP v15.0</a></li>
          <li><a href="#">Instruções de Primeiro Acesso</a></li>
          <li><a href="#">Guia de Processos Autorizativos</a></li>
          <li><a href="#">FAQ - Perguntas Frequentes</a></li>
        </ul>
      </div>
      `,
      session
    );
    this.sendResponse(res, 200, 'text/html', html);
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  private getSessionId(req: http.IncomingMessage): string {
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/sessionId=([^;]+)/);
    if (match) return match[1];

    // Create new session ID
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return sessionId;
  }

  private sendResponse(
    res: http.ServerResponse,
    statusCode: number,
    contentType: string,
    body: string,
    sessionId?: string
  ): void {
    const headers: Record<string, string> = {
      'Content-Type': contentType + '; charset=utf-8',
    };
    if (sessionId) {
      headers['Set-Cookie'] = `sessionId=${sessionId}; Path=/; HttpOnly`;
    }
    res.writeHead(statusCode, headers);
    res.end(body);
  }
}

// Export for use in tests
export default MockGESPServer;
