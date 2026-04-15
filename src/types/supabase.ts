export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_decisions: {
        Row: {
          agent_name: string
          confidence: number | null
          created_at: string
          decision_type: string
          escalated_to_human: boolean | null
          human_override: string | null
          id: string
          input_summary: string | null
          latency_ms: number | null
          model_used: string | null
          output_summary: string | null
          run_id: string
          step_name: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          agent_name: string
          confidence?: number | null
          created_at?: string
          decision_type: string
          escalated_to_human?: boolean | null
          human_override?: string | null
          id?: string
          input_summary?: string | null
          latency_ms?: number | null
          model_used?: string | null
          output_summary?: string | null
          run_id: string
          step_name: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          agent_name?: string
          confidence?: number | null
          created_at?: string
          decision_type?: string
          escalated_to_human?: boolean | null
          human_override?: string | null
          id?: string
          input_summary?: string | null
          latency_ms?: number | null
          model_used?: string | null
          output_summary?: string | null
          run_id?: string
          step_name?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_decisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_metrics: {
        Row: {
          agent_name: string
          avg_confidence: number | null
          avg_duration_ms: number | null
          cache_hit_rate: number | null
          created_at: string
          escalation_rate: number | null
          failed_runs: number | null
          id: string
          p95_duration_ms: number | null
          period_end: string
          period_start: string
          successful_runs: number | null
          top_decision_types: Json | null
          total_cost_usd: number | null
          total_runs: number | null
          total_tokens: number | null
        }
        Insert: {
          agent_name: string
          avg_confidence?: number | null
          avg_duration_ms?: number | null
          cache_hit_rate?: number | null
          created_at?: string
          escalation_rate?: number | null
          failed_runs?: number | null
          id?: string
          p95_duration_ms?: number | null
          period_end: string
          period_start: string
          successful_runs?: number | null
          top_decision_types?: Json | null
          total_cost_usd?: number | null
          total_runs?: number | null
          total_tokens?: number | null
        }
        Update: {
          agent_name?: string
          avg_confidence?: number | null
          avg_duration_ms?: number | null
          cache_hit_rate?: number | null
          created_at?: string
          escalation_rate?: number | null
          failed_runs?: number | null
          id?: string
          p95_duration_ms?: number | null
          period_end?: string
          period_start?: string
          successful_runs?: number | null
          top_decision_types?: Json | null
          total_cost_usd?: number | null
          total_runs?: number | null
          total_tokens?: number | null
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          agent_name: string
          cache_read_tokens: number | null
          cache_write_tokens: number | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_data: Json | null
          output_data: Json | null
          started_at: string
          status: string
          steps_executed: number | null
          total_cost_usd: number | null
          total_tokens_used: number | null
          trigger_source: string | null
          trigger_type: string
        }
        Insert: {
          agent_name: string
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          started_at?: string
          status?: string
          steps_executed?: number | null
          total_cost_usd?: number | null
          total_tokens_used?: number | null
          trigger_source?: string | null
          trigger_type: string
        }
        Update: {
          agent_name?: string
          cache_read_tokens?: number | null
          cache_write_tokens?: number | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          started_at?: string
          status?: string
          steps_executed?: number | null
          total_cost_usd?: number | null
          total_tokens_used?: number | null
          trigger_source?: string | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string | null
          action: string | null
          created_at: string
          details: Json | null
          detalhes: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip: string | null
          user_id: string | null
        }
        Insert: {
          acao?: string | null
          action?: string | null
          created_at?: string
          details?: Json | null
          detalhes?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string | null
          action?: string | null
          created_at?: string
          details?: Json | null
          detalhes?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_history: {
        Row: {
          asaas_payment_id: string | null
          company_id: string
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          id: string
          metodo_pagamento: string | null
          status: string
          valor: number
        }
        Insert: {
          asaas_payment_id?: string | null
          company_id: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
          id?: string
          metodo_pagamento?: string | null
          status?: string
          valor: number
        }
        Update: {
          asaas_payment_id?: string | null
          company_id?: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          id?: string
          metodo_pagamento?: string | null
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      companies: {
        Row: {
          alertas_ativos: Json
          alvara_numero: string | null
          alvara_validade: string | null
          asaas_customer_id: string | null
          bairro: string | null
          billing_status: string
          capital_social: number | null
          cep: string | null
          cnae_descricao: string | null
          cnae_principal: string | null
          cnpj: string
          complemento: string | null
          contrato_auto_renovacao: boolean
          contrato_inicio: string | null
          contrato_vencimento: string | null
          created_at: string
          data_abertura: string | null
          data_proxima_cobranca: string | null
          ecpf_r2_path: string | null
          ecpf_senha_encrypted: string | null
          ecpf_validade: string | null
          email_contato: string | null
          email_operacional: string
          email_responsavel: string
          enriched_at: string | null
          enviar_alerta_vigilante: boolean
          habilitada: boolean
          id: string
          last_payment_date: string | null
          logradouro: string | null
          matriz_id: string | null
          monthly_cost: number | null
          municipio: string | null
          natureza_juridica: string | null
          next_billing_date: string | null
          nome_fantasia: string | null
          numero: string | null
          plano: string
          porte: string | null
          procuracao_status: string | null
          razao_social: string
          situacao_cadastral: string | null
          telefone: string | null
          tipo_unidade: string
          uf_sede: string
          updated_at: string
          valor_mensal: number
        }
        Insert: {
          alertas_ativos?: Json
          alvara_numero?: string | null
          alvara_validade?: string | null
          asaas_customer_id?: string | null
          bairro?: string | null
          billing_status?: string
          capital_social?: number | null
          cep?: string | null
          cnae_descricao?: string | null
          cnae_principal?: string | null
          cnpj: string
          complemento?: string | null
          contrato_auto_renovacao?: boolean
          contrato_inicio?: string | null
          contrato_vencimento?: string | null
          created_at?: string
          data_abertura?: string | null
          data_proxima_cobranca?: string | null
          ecpf_r2_path?: string | null
          ecpf_senha_encrypted?: string | null
          ecpf_validade?: string | null
          email_contato?: string | null
          email_operacional: string
          email_responsavel: string
          enriched_at?: string | null
          enviar_alerta_vigilante?: boolean
          habilitada?: boolean
          id?: string
          last_payment_date?: string | null
          logradouro?: string | null
          matriz_id?: string | null
          monthly_cost?: number | null
          municipio?: string | null
          natureza_juridica?: string | null
          next_billing_date?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          plano?: string
          porte?: string | null
          procuracao_status?: string | null
          razao_social: string
          situacao_cadastral?: string | null
          telefone?: string | null
          tipo_unidade?: string
          uf_sede: string
          updated_at?: string
          valor_mensal?: number
        }
        Update: {
          alertas_ativos?: Json
          alvara_numero?: string | null
          alvara_validade?: string | null
          asaas_customer_id?: string | null
          bairro?: string | null
          billing_status?: string
          capital_social?: number | null
          cep?: string | null
          cnae_descricao?: string | null
          cnae_principal?: string | null
          cnpj?: string
          complemento?: string | null
          contrato_auto_renovacao?: boolean
          contrato_inicio?: string | null
          contrato_vencimento?: string | null
          created_at?: string
          data_abertura?: string | null
          data_proxima_cobranca?: string | null
          ecpf_r2_path?: string | null
          ecpf_senha_encrypted?: string | null
          ecpf_validade?: string | null
          email_contato?: string | null
          email_operacional?: string
          email_responsavel?: string
          enriched_at?: string | null
          enviar_alerta_vigilante?: boolean
          habilitada?: boolean
          id?: string
          last_payment_date?: string | null
          logradouro?: string | null
          matriz_id?: string | null
          monthly_cost?: number | null
          municipio?: string | null
          natureza_juridica?: string | null
          next_billing_date?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          plano?: string
          porte?: string | null
          procuracao_status?: string | null
          razao_social?: string
          situacao_cadastral?: string | null
          telefone?: string | null
          tipo_unidade?: string
          uf_sede?: string
          updated_at?: string
          valor_mensal?: number
        }
        Relationships: [
          {
            foreignKeyName: "companies_matriz_id_fkey"
            columns: ["matriz_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_matriz_id_fkey"
            columns: ["matriz_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      company_instructions: {
        Row: {
          ativo: boolean
          categoria: string
          company_id: string
          conteudo: string
          created_at: string
          created_by: string | null
          id: string
          titulo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          company_id: string
          conteudo: string
          created_at?: string
          created_by?: string | null
          id?: string
          titulo: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          company_id?: string
          conteudo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          titulo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_instructions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_instructions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_instructions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_instructions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      delesp_contacts: {
        Row: {
          ativo: boolean
          email: string
          estado: string
          id: string
          observacoes: string | null
          telefone: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          email: string
          estado: string
          id?: string
          observacoes?: string | null
          telefone?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          email?: string
          estado?: string
          id?: string
          observacoes?: string | null
          telefone?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: []
      }
      discrepancies: {
        Row: {
          campo_divergente: string
          company_id: string
          created_at: string
          delesp_uf: string | null
          employee_id: string | null
          gesp_task_id: string | null
          id: string
          oficio_id: string | null
          prazo_resposta_pf: string | null
          print_documento_r2: string
          print_erro_r2: string | null
          print_gesp_r2: string
          resolucao_detalhe: string | null
          resolved_at: string | null
          status: string
          tipo_incompatibilidade: string
          valor_gesp: string | null
          valor_sistema: string | null
        }
        Insert: {
          campo_divergente: string
          company_id: string
          created_at?: string
          delesp_uf?: string | null
          employee_id?: string | null
          gesp_task_id?: string | null
          id?: string
          oficio_id?: string | null
          prazo_resposta_pf?: string | null
          print_documento_r2: string
          print_erro_r2?: string | null
          print_gesp_r2: string
          resolucao_detalhe?: string | null
          resolved_at?: string | null
          status?: string
          tipo_incompatibilidade: string
          valor_gesp?: string | null
          valor_sistema?: string | null
        }
        Update: {
          campo_divergente?: string
          company_id?: string
          created_at?: string
          delesp_uf?: string | null
          employee_id?: string | null
          gesp_task_id?: string | null
          id?: string
          oficio_id?: string | null
          prazo_resposta_pf?: string | null
          print_documento_r2?: string
          print_erro_r2?: string | null
          print_gesp_r2?: string
          resolucao_detalhe?: string | null
          resolved_at?: string | null
          status?: string
          tipo_incompatibilidade?: string
          valor_gesp?: string | null
          valor_sistema?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discrepancies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "discrepancies_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancies_gesp_task_id_fkey"
            columns: ["gesp_task_id"]
            isOneToOne: false
            referencedRelation: "gesp_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discrepancies_oficio_id_fkey"
            columns: ["oficio_id"]
            isOneToOne: false
            referencedRelation: "email_outbound"
            referencedColumns: ["id"]
          },
        ]
      }
      dou_alertas: {
        Row: {
          alvara_id: string | null
          canal: string | null
          cnpj: string
          company_id: string | null
          created_at: string | null
          enviado_em: string | null
          id: string
          lido_em: string | null
          mensagem: string
          prioridade: string | null
          prospect_id: string | null
          publicacao_id: string | null
          razao_social: string | null
          status: string | null
          tipo_alerta: string
          titulo: string
        }
        Insert: {
          alvara_id?: string | null
          canal?: string | null
          cnpj: string
          company_id?: string | null
          created_at?: string | null
          enviado_em?: string | null
          id?: string
          lido_em?: string | null
          mensagem: string
          prioridade?: string | null
          prospect_id?: string | null
          publicacao_id?: string | null
          razao_social?: string | null
          status?: string | null
          tipo_alerta?: string
          titulo: string
        }
        Update: {
          alvara_id?: string | null
          canal?: string | null
          cnpj?: string
          company_id?: string | null
          created_at?: string | null
          enviado_em?: string | null
          id?: string
          lido_em?: string | null
          mensagem?: string
          prioridade?: string | null
          prospect_id?: string | null
          publicacao_id?: string | null
          razao_social?: string | null
          status?: string | null
          tipo_alerta?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "dou_alertas_alvara_id_fkey"
            columns: ["alvara_id"]
            isOneToOne: false
            referencedRelation: "dou_alvaras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dou_alertas_publicacao_id_fkey"
            columns: ["publicacao_id"]
            isOneToOne: false
            referencedRelation: "dou_publicacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      dou_alvaras: {
        Row: {
          canal_notificacao: string | null
          cnpj: string
          cnpj_limpo: string
          company_id: string | null
          created_at: string | null
          data_notificacao: string | null
          data_validade: string | null
          delegacia: string | null
          id: string
          itens_liberados: Json | null
          municipio: string | null
          notificado: boolean | null
          numero_processo: string | null
          prospect_id: string | null
          publicacao_id: string | null
          razao_social: string
          subtipo: string | null
          texto_original: string
          tipo_alvara: string
          uf: string | null
          updated_at: string | null
          validade_dias: number | null
        }
        Insert: {
          canal_notificacao?: string | null
          cnpj: string
          cnpj_limpo: string
          company_id?: string | null
          created_at?: string | null
          data_notificacao?: string | null
          data_validade?: string | null
          delegacia?: string | null
          id?: string
          itens_liberados?: Json | null
          municipio?: string | null
          notificado?: boolean | null
          numero_processo?: string | null
          prospect_id?: string | null
          publicacao_id?: string | null
          razao_social: string
          subtipo?: string | null
          texto_original: string
          tipo_alvara?: string
          uf?: string | null
          updated_at?: string | null
          validade_dias?: number | null
        }
        Update: {
          canal_notificacao?: string | null
          cnpj?: string
          cnpj_limpo?: string
          company_id?: string | null
          created_at?: string | null
          data_notificacao?: string | null
          data_validade?: string | null
          delegacia?: string | null
          id?: string
          itens_liberados?: Json | null
          municipio?: string | null
          notificado?: boolean | null
          numero_processo?: string | null
          prospect_id?: string | null
          publicacao_id?: string | null
          razao_social?: string
          subtipo?: string | null
          texto_original?: string
          tipo_alvara?: string
          uf?: string | null
          updated_at?: string | null
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dou_alvaras_publicacao_id_fkey"
            columns: ["publicacao_id"]
            isOneToOne: false
            referencedRelation: "dou_publicacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      dou_publicacoes: {
        Row: {
          assinante: string | null
          cargo_assinante: string | null
          created_at: string | null
          data_ato: string | null
          data_publicacao: string
          dou_id: string | null
          edicao: string | null
          id: string
          numero_ato: string | null
          orgao_principal: string | null
          orgao_subordinado: string | null
          pagina: string | null
          processado: boolean | null
          resumo: string | null
          secao: number
          slug: string | null
          texto_completo: string
          tipo_ato: string
          titulo: string
          unidade: string | null
          updated_at: string | null
          url_pdf: string | null
          url_publicacao: string | null
        }
        Insert: {
          assinante?: string | null
          cargo_assinante?: string | null
          created_at?: string | null
          data_ato?: string | null
          data_publicacao: string
          dou_id?: string | null
          edicao?: string | null
          id?: string
          numero_ato?: string | null
          orgao_principal?: string | null
          orgao_subordinado?: string | null
          pagina?: string | null
          processado?: boolean | null
          resumo?: string | null
          secao?: number
          slug?: string | null
          texto_completo: string
          tipo_ato?: string
          titulo: string
          unidade?: string | null
          updated_at?: string | null
          url_pdf?: string | null
          url_publicacao?: string | null
        }
        Update: {
          assinante?: string | null
          cargo_assinante?: string | null
          created_at?: string | null
          data_ato?: string | null
          data_publicacao?: string
          dou_id?: string | null
          edicao?: string | null
          id?: string
          numero_ato?: string | null
          orgao_principal?: string | null
          orgao_subordinado?: string | null
          pagina?: string | null
          processado?: boolean | null
          resumo?: string | null
          secao?: number
          slug?: string | null
          texto_completo?: string
          tipo_ato?: string
          titulo?: string
          unidade?: string | null
          updated_at?: string | null
          url_pdf?: string | null
          url_publicacao?: string | null
        }
        Relationships: []
      }
      dou_scraper_runs: {
        Row: {
          alertas_gerados: number | null
          alvaras_extraidos: number | null
          data_alvo: string
          detalhes: Json | null
          duracao_ms: number | null
          empresas_vinculadas: number | null
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string | null
          publicacoes_encontradas: number | null
          secao: number
          status: string | null
        }
        Insert: {
          alertas_gerados?: number | null
          alvaras_extraidos?: number | null
          data_alvo: string
          detalhes?: Json | null
          duracao_ms?: number | null
          empresas_vinculadas?: number | null
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          publicacoes_encontradas?: number | null
          secao?: number
          status?: string | null
        }
        Update: {
          alertas_gerados?: number | null
          alvaras_extraidos?: number | null
          data_alvo?: string
          detalhes?: Json | null
          duracao_ms?: number | null
          empresas_vinculadas?: number | null
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          publicacoes_encontradas?: number | null
          secao?: number
          status?: string | null
        }
        Relationships: []
      }
      email_inbound: {
        Row: {
          attachments: Json | null
          body_html: string | null
          body_text: string
          company_id: string | null
          confidence_score: number | null
          created_at: string
          from_email: string
          gmail_message_id: string
          id: string
          parser_resultado: Json | null
          received_at: string
          status: string
          subject: string
          thread_id: string | null
          tipo_demanda: string | null
          to_email: string | null
          workflow_id: string | null
        }
        Insert: {
          attachments?: Json | null
          body_html?: string | null
          body_text: string
          company_id?: string | null
          confidence_score?: number | null
          created_at?: string
          from_email: string
          gmail_message_id: string
          id?: string
          parser_resultado?: Json | null
          received_at: string
          status?: string
          subject: string
          thread_id?: string | null
          tipo_demanda?: string | null
          to_email?: string | null
          workflow_id?: string | null
        }
        Update: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string
          company_id?: string | null
          confidence_score?: number | null
          created_at?: string
          from_email?: string
          gmail_message_id?: string
          id?: string
          parser_resultado?: Json | null
          received_at?: string
          status?: string
          subject?: string
          thread_id?: string | null
          tipo_demanda?: string | null
          to_email?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_inbound_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_inbound_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "email_inbound_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbound: {
        Row: {
          attachments: Json | null
          body_html: string | null
          body_text: string | null
          cc_email: string | null
          cc_emails: string[] | null
          clicked_at: string | null
          company_id: string
          created_at: string
          erro_detalhe: string | null
          from_email: string
          gesp_task_id: string | null
          id: string
          mode: string
          opened_at: string | null
          resend_id: string | null
          sent_at: string | null
          status: string
          subject: string
          template_id: string
          thread_id: string | null
          to_email: string
          workflow_id: string | null
        }
        Insert: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_email?: string | null
          cc_emails?: string[] | null
          clicked_at?: string | null
          company_id: string
          created_at?: string
          erro_detalhe?: string | null
          from_email: string
          gesp_task_id?: string | null
          id?: string
          mode: string
          opened_at?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_id: string
          thread_id?: string | null
          to_email: string
          workflow_id?: string | null
        }
        Update: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_email?: string | null
          cc_emails?: string[] | null
          clicked_at?: string | null
          company_id?: string
          created_at?: string
          erro_detalhe?: string | null
          from_email?: string
          gesp_task_id?: string | null
          id?: string
          mode?: string
          opened_at?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string
          thread_id?: string | null
          to_email?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_outbound_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbound_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "email_outbound_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          cnpj_detectado: string | null
          company_id: string | null
          created_at: string
          finalizado_at: string | null
          finalizado_por: string | null
          id: string
          last_message_id: string | null
          message_ids: string[] | null
          status: string
          subject: string
          tipo_demanda: string | null
          updated_at: string
        }
        Insert: {
          cnpj_detectado?: string | null
          company_id?: string | null
          created_at?: string
          finalizado_at?: string | null
          finalizado_por?: string | null
          id?: string
          last_message_id?: string | null
          message_ids?: string[] | null
          status?: string
          subject: string
          tipo_demanda?: string | null
          updated_at?: string
        }
        Update: {
          cnpj_detectado?: string | null
          company_id?: string | null
          created_at?: string
          finalizado_at?: string | null
          finalizado_por?: string | null
          id?: string
          last_message_id?: string | null
          message_ids?: string[] | null
          status?: string
          subject?: string
          tipo_demanda?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "email_threads_finalizado_por_fkey"
            columns: ["finalizado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_workflows: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          company_id: string
          created_at: string
          dados_extraidos: Json
          email_inbound_id: string | null
          email_outbound_ids: string[] | null
          erro_detalhe: string | null
          gesp_task_ids: string[] | null
          id: string
          prioridade: string
          status: string
          tipo_demanda: string
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          company_id: string
          created_at?: string
          dados_extraidos?: Json
          email_inbound_id?: string | null
          email_outbound_ids?: string[] | null
          erro_detalhe?: string | null
          gesp_task_ids?: string[] | null
          id?: string
          prioridade?: string
          status?: string
          tipo_demanda: string
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          company_id?: string
          created_at?: string
          dados_extraidos?: Json
          email_inbound_id?: string | null
          email_outbound_ids?: string[] | null
          erro_detalhe?: string | null
          gesp_task_ids?: string[] | null
          id?: string
          prioridade?: string
          status?: string
          tipo_demanda?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_workflows_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "email_workflows_email_inbound_id_fkey"
            columns: ["email_inbound_id"]
            isOneToOne: false
            referencedRelation: "email_inbound"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          alertas_ativos: Json
          antecedentes_criminais: boolean | null
          aptidao_porte_arma: boolean | null
          arma_numero_serie: string | null
          bairro: string | null
          cargo_gesp: string | null
          cep: string | null
          cidade: string | null
          cnv_data_emissao: string
          cnv_data_validade: string
          cnv_numero: string
          cnv_situacao: string
          cnv_uf_emissora: string
          colete_data_validade: string | null
          colete_numero_serie: string | null
          company_id: string
          complemento: string | null
          cpf: string
          created_at: string
          crv: string | null
          data_admissao: string
          data_desligamento: string | null
          data_nascimento: string
          email: string
          estado_civil: string | null
          formacao_data: string | null
          formacao_escola: string | null
          formacao_municipio: string | null
          formacao_uf: string | null
          funcao_principal: string
          id: string
          laudo_medico: boolean | null
          logradouro: string | null
          municipio_trabalho: string | null
          nacionalidade: string | null
          naturalidade: string | null
          nome_completo: string
          nome_mae: string
          nome_pai: string | null
          numero: string | null
          pis: string | null
          porte_arma_validade: string | null
          posto_designado: string | null
          receber_alertas: boolean
          reciclagem_data_ultimo_curso: string | null
          reciclagem_data_validade: string | null
          reciclagem_escola: string | null
          reciclagem_municipio: string | null
          rg: string
          rg_data_emissao: string | null
          rg_orgao_emissor: string
          rg_uf: string
          sexo: string
          situacao_pessoa: string | null
          status: string
          telefone1: string
          telefone2: string | null
          tipo_arma_habilitada: string | null
          tipo_vinculo: string
          uf: string | null
          uf_trabalho: string | null
          updated_at: string
          vinculo_empregaticio: string | null
        }
        Insert: {
          alertas_ativos?: Json
          antecedentes_criminais?: boolean | null
          aptidao_porte_arma?: boolean | null
          arma_numero_serie?: string | null
          bairro?: string | null
          cargo_gesp?: string | null
          cep?: string | null
          cidade?: string | null
          cnv_data_emissao: string
          cnv_data_validade: string
          cnv_numero: string
          cnv_situacao?: string
          cnv_uf_emissora: string
          colete_data_validade?: string | null
          colete_numero_serie?: string | null
          company_id: string
          complemento?: string | null
          cpf: string
          created_at?: string
          crv?: string | null
          data_admissao: string
          data_desligamento?: string | null
          data_nascimento: string
          email: string
          estado_civil?: string | null
          formacao_data?: string | null
          formacao_escola?: string | null
          formacao_municipio?: string | null
          formacao_uf?: string | null
          funcao_principal: string
          id?: string
          laudo_medico?: boolean | null
          logradouro?: string | null
          municipio_trabalho?: string | null
          nacionalidade?: string | null
          naturalidade?: string | null
          nome_completo: string
          nome_mae: string
          nome_pai?: string | null
          numero?: string | null
          pis?: string | null
          porte_arma_validade?: string | null
          posto_designado?: string | null
          receber_alertas?: boolean
          reciclagem_data_ultimo_curso?: string | null
          reciclagem_data_validade?: string | null
          reciclagem_escola?: string | null
          reciclagem_municipio?: string | null
          rg: string
          rg_data_emissao?: string | null
          rg_orgao_emissor: string
          rg_uf: string
          sexo: string
          situacao_pessoa?: string | null
          status?: string
          telefone1: string
          telefone2?: string | null
          tipo_arma_habilitada?: string | null
          tipo_vinculo?: string
          uf?: string | null
          uf_trabalho?: string | null
          updated_at?: string
          vinculo_empregaticio?: string | null
        }
        Update: {
          alertas_ativos?: Json
          antecedentes_criminais?: boolean | null
          aptidao_porte_arma?: boolean | null
          arma_numero_serie?: string | null
          bairro?: string | null
          cargo_gesp?: string | null
          cep?: string | null
          cidade?: string | null
          cnv_data_emissao?: string
          cnv_data_validade?: string
          cnv_numero?: string
          cnv_situacao?: string
          cnv_uf_emissora?: string
          colete_data_validade?: string | null
          colete_numero_serie?: string | null
          company_id?: string
          complemento?: string | null
          cpf?: string
          created_at?: string
          crv?: string | null
          data_admissao?: string
          data_desligamento?: string | null
          data_nascimento?: string
          email?: string
          estado_civil?: string | null
          formacao_data?: string | null
          formacao_escola?: string | null
          formacao_municipio?: string | null
          formacao_uf?: string | null
          funcao_principal?: string
          id?: string
          laudo_medico?: boolean | null
          logradouro?: string | null
          municipio_trabalho?: string | null
          nacionalidade?: string | null
          naturalidade?: string | null
          nome_completo?: string
          nome_mae?: string
          nome_pai?: string | null
          numero?: string | null
          pis?: string | null
          porte_arma_validade?: string | null
          posto_designado?: string | null
          receber_alertas?: boolean
          reciclagem_data_ultimo_curso?: string | null
          reciclagem_data_validade?: string | null
          reciclagem_escola?: string | null
          reciclagem_municipio?: string | null
          rg?: string
          rg_data_emissao?: string | null
          rg_orgao_emissor?: string
          rg_uf?: string
          sexo?: string
          situacao_pessoa?: string | null
          status?: string
          telefone1?: string
          telefone2?: string | null
          tipo_arma_habilitada?: string | null
          tipo_vinculo?: string
          uf?: string | null
          uf_trabalho?: string | null
          updated_at?: string
          vinculo_empregaticio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "employees_posto_designado_fkey"
            columns: ["posto_designado"]
            isOneToOne: false
            referencedRelation: "job_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      gesp_approvals: {
        Row: {
          admin_notes: string | null
          agent_name: string
          agent_run_id: string
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          id: string
          payload: Json
          process_code: string
          process_name: string
          requested_at: string
          status: Database["public"]["Enums"]["gesp_approval_status"]
          updated_at: string
          urgency: Database["public"]["Enums"]["gesp_approval_urgency"]
        }
        Insert: {
          admin_notes?: string | null
          agent_name: string
          agent_run_id: string
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          payload?: Json
          process_code: string
          process_name: string
          requested_at?: string
          status?: Database["public"]["Enums"]["gesp_approval_status"]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["gesp_approval_urgency"]
        }
        Update: {
          admin_notes?: string | null
          agent_name?: string
          agent_run_id?: string
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          id?: string
          payload?: Json
          process_code?: string
          process_name?: string
          requested_at?: string
          status?: Database["public"]["Enums"]["gesp_approval_status"]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["gesp_approval_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "gesp_approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gesp_approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gesp_approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gesp_holidays: {
        Row: {
          data: string
          descricao: string
          id: string
          tipo: string | null
        }
        Insert: {
          data: string
          descricao: string
          id?: string
          tipo?: string | null
        }
        Update: {
          data?: string
          descricao?: string
          id?: string
          tipo?: string | null
        }
        Relationships: []
      }
      gesp_sessions: {
        Row: {
          acoes_executadas: number | null
          browser_pid: number | null
          company_id: string
          erro_detalhe: string | null
          finished_at: string | null
          id: string
          prints_capturados: number | null
          started_at: string
          status: string
          tempo_total_ms: number | null
        }
        Insert: {
          acoes_executadas?: number | null
          browser_pid?: number | null
          company_id: string
          erro_detalhe?: string | null
          finished_at?: string | null
          id?: string
          prints_capturados?: number | null
          started_at?: string
          status?: string
          tempo_total_ms?: number | null
        }
        Update: {
          acoes_executadas?: number | null
          browser_pid?: number | null
          company_id?: string
          erro_detalhe?: string | null
          finished_at?: string | null
          id?: string
          prints_capturados?: number | null
          started_at?: string
          status?: string
          tempo_total_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gesp_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gesp_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      gesp_snapshots: {
        Row: {
          armas_count: number | null
          company_id: string
          created_at: string
          id: string
          postos_count: number | null
          session_id: string | null
          snapshot_data: Json
          vigilantes_count: number | null
        }
        Insert: {
          armas_count?: number | null
          company_id: string
          created_at?: string
          id?: string
          postos_count?: number | null
          session_id?: string | null
          snapshot_data: Json
          vigilantes_count?: number | null
        }
        Update: {
          armas_count?: number | null
          company_id?: string
          created_at?: string
          id?: string
          postos_count?: number | null
          session_id?: string | null
          snapshot_data?: Json
          vigilantes_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gesp_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gesp_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gesp_snapshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "gesp_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      gesp_tasks: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          erro_detalhe: string | null
          executed_at: string | null
          id: string
          max_tentativas: number
          payload: Json
          print_antes_r2: string | null
          print_depois_r2: string | null
          print_erro_r2: string | null
          protocolo_gesp: string | null
          session_id: string | null
          status: string
          tentativas: number
          tipo_acao: string
          workflow_id: string | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          erro_detalhe?: string | null
          executed_at?: string | null
          id?: string
          max_tentativas?: number
          payload?: Json
          print_antes_r2?: string | null
          print_depois_r2?: string | null
          print_erro_r2?: string | null
          protocolo_gesp?: string | null
          session_id?: string | null
          status?: string
          tentativas?: number
          tipo_acao: string
          workflow_id?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          erro_detalhe?: string | null
          executed_at?: string | null
          id?: string
          max_tentativas?: number
          payload?: Json
          print_antes_r2?: string | null
          print_depois_r2?: string | null
          print_erro_r2?: string | null
          protocolo_gesp?: string | null
          session_id?: string | null
          status?: string
          tentativas?: number
          tipo_acao?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gesp_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gesp_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "gesp_tasks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "gesp_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gesp_tasks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "email_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gesp_tasks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "vw_processos_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      iml_event_edges: {
        Row: {
          confidence: number
          created_at: string
          id: string
          metadata: Json | null
          relation_type: string
          source_event_id: string
          target_event_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          relation_type: string
          source_event_id: string
          target_event_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          relation_type?: string
          source_event_id?: string
          target_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iml_event_edges_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "iml_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iml_event_edges_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "vw_iml_event_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iml_event_edges_target_event_id_fkey"
            columns: ["target_event_id"]
            isOneToOne: false
            referencedRelation: "iml_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iml_event_edges_target_event_id_fkey"
            columns: ["target_event_id"]
            isOneToOne: false
            referencedRelation: "vw_iml_event_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      iml_events: {
        Row: {
          agent_name: string | null
          agent_run_id: string | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          search_text: string | null
          severity: string
        }
        Insert: {
          agent_name?: string | null
          agent_run_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          search_text?: string | null
          severity?: string
        }
        Update: {
          agent_name?: string | null
          agent_run_id?: string | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          search_text?: string | null
          severity?: string
        }
        Relationships: []
      }
      iml_insights: {
        Row: {
          admin_approved: boolean
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_notes: string | null
          confidence: number
          created_at: string
          description: string
          evidence_count: number
          evidence_event_ids: string[] | null
          expires_at: string | null
          first_detected_at: string
          id: string
          impact_level: string | null
          insight_type: string
          last_evidence_at: string
          parent_insight_id: string | null
          related_agent: string | null
          related_company_id: string | null
          status: string
          suggested_action: string | null
          suggested_params: Json | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          admin_approved?: boolean
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          admin_notes?: string | null
          confidence?: number
          created_at?: string
          description: string
          evidence_count?: number
          evidence_event_ids?: string[] | null
          expires_at?: string | null
          first_detected_at?: string
          id?: string
          impact_level?: string | null
          insight_type: string
          last_evidence_at?: string
          parent_insight_id?: string | null
          related_agent?: string | null
          related_company_id?: string | null
          status?: string
          suggested_action?: string | null
          suggested_params?: Json | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          admin_approved?: boolean
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          admin_notes?: string | null
          confidence?: number
          created_at?: string
          description?: string
          evidence_count?: number
          evidence_event_ids?: string[] | null
          expires_at?: string | null
          first_detected_at?: string
          id?: string
          impact_level?: string | null
          insight_type?: string
          last_evidence_at?: string
          parent_insight_id?: string | null
          related_agent?: string | null
          related_company_id?: string | null
          status?: string
          suggested_action?: string | null
          suggested_params?: Json | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "iml_insights_parent_insight_id_fkey"
            columns: ["parent_insight_id"]
            isOneToOne: false
            referencedRelation: "iml_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iml_insights_parent_insight_id_fkey"
            columns: ["parent_insight_id"]
            isOneToOne: false
            referencedRelation: "vw_iml_insights_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      iml_playbook_log: {
        Row: {
          agent_run_id: string | null
          applied_at: string
          applied_value: Json
          apply_context: Json
          id: string
          original_value: Json
          outcome: string | null
          outcome_details: Json | null
          param_name: string
          playbook_rule_id: string
          rule_code: string
        }
        Insert: {
          agent_run_id?: string | null
          applied_at?: string
          applied_value: Json
          apply_context?: Json
          id?: string
          original_value: Json
          outcome?: string | null
          outcome_details?: Json | null
          param_name: string
          playbook_rule_id: string
          rule_code: string
        }
        Update: {
          agent_run_id?: string | null
          applied_at?: string
          applied_value?: Json
          apply_context?: Json
          id?: string
          original_value?: Json
          outcome?: string | null
          outcome_details?: Json | null
          param_name?: string
          playbook_rule_id?: string
          rule_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "iml_playbook_log_playbook_rule_id_fkey"
            columns: ["playbook_rule_id"]
            isOneToOne: false
            referencedRelation: "iml_playbook_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iml_playbook_log_playbook_rule_id_fkey"
            columns: ["playbook_rule_id"]
            isOneToOne: false
            referencedRelation: "vw_iml_playbook_active"
            referencedColumns: ["id"]
          },
        ]
      }
      iml_playbook_rules: {
        Row: {
          active: boolean
          adjusted_value: Json
          apply_context: Json
          approved_at: string | null
          approved_by: string | null
          created_at: string
          default_value: Json
          description: string | null
          effectiveness_score: number | null
          id: string
          last_applied_at: string | null
          param_name: string
          rule_code: string
          source_insight_id: string | null
          times_applied: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          adjusted_value: Json
          apply_context?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          default_value: Json
          description?: string | null
          effectiveness_score?: number | null
          id?: string
          last_applied_at?: string | null
          param_name: string
          rule_code: string
          source_insight_id?: string | null
          times_applied?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          adjusted_value?: Json
          apply_context?: Json
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          default_value?: Json
          description?: string | null
          effectiveness_score?: number | null
          id?: string
          last_applied_at?: string | null
          param_name?: string
          rule_code?: string
          source_insight_id?: string | null
          times_applied?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iml_playbook_rules_source_insight_id_fkey"
            columns: ["source_insight_id"]
            isOneToOne: false
            referencedRelation: "iml_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iml_playbook_rules_source_insight_id_fkey"
            columns: ["source_insight_id"]
            isOneToOne: false
            referencedRelation: "vw_iml_insights_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      job_posts: {
        Row: {
          cep: string | null
          cidade: string
          company_id: string
          created_at: string
          data_abertura: string | null
          data_encerramento: string | null
          endereco: string
          gesp_protocolo: string | null
          id: string
          nome: string
          status: string
          uf: string
          updated_at: string
        }
        Insert: {
          cep?: string | null
          cidade: string
          company_id: string
          created_at?: string
          data_abertura?: string | null
          data_encerramento?: string | null
          endereco: string
          gesp_protocolo?: string | null
          id?: string
          nome: string
          status?: string
          uf: string
          updated_at?: string
        }
        Update: {
          cep?: string | null
          cidade?: string
          company_id?: string
          created_at?: string
          data_abertura?: string | null
          data_encerramento?: string | null
          endereco?: string
          gesp_protocolo?: string | null
          id?: string
          nome?: string
          status?: string
          uf?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          aprovado_por_email: boolean | null
          confianca_ia: number | null
          created_at: string
          descricao_caso: string
          email_original_id: string | null
          id: string
          kb_ref: string | null
          resolvido_por_id: string | null
          solucao_adotada: string | null
          status: string
          tags: string[] | null
          tempo_resolucao_min: number | null
        }
        Insert: {
          aprovado_por_email?: boolean | null
          confianca_ia?: number | null
          created_at?: string
          descricao_caso: string
          email_original_id?: string | null
          id?: string
          kb_ref?: string | null
          resolvido_por_id?: string | null
          solucao_adotada?: string | null
          status?: string
          tags?: string[] | null
          tempo_resolucao_min?: number | null
        }
        Update: {
          aprovado_por_email?: boolean | null
          confianca_ia?: number | null
          created_at?: string
          descricao_caso?: string
          email_original_id?: string | null
          id?: string
          kb_ref?: string | null
          resolvido_por_id?: string | null
          solucao_adotada?: string | null
          status?: string
          tags?: string[] | null
          tempo_resolucao_min?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_email_original_id_fkey"
            columns: ["email_original_id"]
            isOneToOne: false
            referencedRelation: "email_inbound"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_resolvido_por_id_fkey"
            columns: ["resolvido_por_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          read_at: string | null
          related_id: string | null
          related_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      parser_keywords: {
        Row: {
          acao_automatica: string
          ativo: boolean
          created_at: string
          id: string
          keywords: string[]
          tipo_demanda: string
        }
        Insert: {
          acao_automatica: string
          ativo?: boolean
          created_at?: string
          id?: string
          keywords: string[]
          tipo_demanda: string
        }
        Update: {
          acao_automatica?: string
          ativo?: boolean
          created_at?: string
          id?: string
          keywords?: string[]
          tipo_demanda?: string
        }
        Relationships: []
      }
      pf_requests: {
        Row: {
          assunto: string
          attachments_r2: string[] | null
          company_id: string
          corpo_texto: string
          created_at: string
          delesp_email: string
          delesp_uf: string
          email_outbound_id: string | null
          id: string
          protocolo: string | null
          respondido_em: string | null
          resposta_pf: string | null
          sent_at: string | null
          status: string
          tipo_oficio: string
          workflow_id: string | null
        }
        Insert: {
          assunto: string
          attachments_r2?: string[] | null
          company_id: string
          corpo_texto: string
          created_at?: string
          delesp_email: string
          delesp_uf: string
          email_outbound_id?: string | null
          id?: string
          protocolo?: string | null
          respondido_em?: string | null
          resposta_pf?: string | null
          sent_at?: string | null
          status?: string
          tipo_oficio: string
          workflow_id?: string | null
        }
        Update: {
          assunto?: string
          attachments_r2?: string[] | null
          company_id?: string
          corpo_texto?: string
          created_at?: string
          delesp_email?: string
          delesp_uf?: string
          email_outbound_id?: string | null
          id?: string
          protocolo?: string | null
          respondido_em?: string | null
          resposta_pf?: string | null
          sent_at?: string | null
          status?: string
          tipo_oficio?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pf_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pf_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "pf_requests_email_outbound_id_fkey"
            columns: ["email_outbound_id"]
            isOneToOne: false
            referencedRelation: "email_outbound"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pf_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "email_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pf_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "vw_processos_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      procuracoes: {
        Row: {
          cliente_confirmou_at: string | null
          company_id: string
          comprovante_r2_path: string | null
          cpf_procurador: string
          created_at: string | null
          id: string
          instrucoes_enviadas_at: string | null
          lembrete_enviado: boolean | null
          motivo_rejeicao: string | null
          nome_procurador: string
          observacoes: string | null
          poderes: string
          poderes_descricao: string | null
          prazo_limite: string | null
          rejeitada_at: string | null
          revogada_at: string | null
          status: string
          updated_at: string | null
          validada_at: string | null
          validada_por: string | null
        }
        Insert: {
          cliente_confirmou_at?: string | null
          company_id: string
          comprovante_r2_path?: string | null
          cpf_procurador: string
          created_at?: string | null
          id?: string
          instrucoes_enviadas_at?: string | null
          lembrete_enviado?: boolean | null
          motivo_rejeicao?: string | null
          nome_procurador: string
          observacoes?: string | null
          poderes?: string
          poderes_descricao?: string | null
          prazo_limite?: string | null
          rejeitada_at?: string | null
          revogada_at?: string | null
          status?: string
          updated_at?: string | null
          validada_at?: string | null
          validada_por?: string | null
        }
        Update: {
          cliente_confirmou_at?: string | null
          company_id?: string
          comprovante_r2_path?: string | null
          cpf_procurador?: string
          created_at?: string | null
          id?: string
          instrucoes_enviadas_at?: string | null
          lembrete_enviado?: boolean | null
          motivo_rejeicao?: string | null
          nome_procurador?: string
          observacoes?: string | null
          poderes?: string
          poderes_descricao?: string | null
          prazo_limite?: string | null
          rejeitada_at?: string | null
          revogada_at?: string | null
          status?: string
          updated_at?: string | null
          validada_at?: string | null
          validada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procuracoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procuracoes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "procuracoes_validada_por_fkey"
            columns: ["validada_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_activities: {
        Row: {
          created_at: string
          descricao: string
          id: string
          prospect_id: string
          resultado: string | null
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          prospect_id: string
          resultado?: string | null
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          prospect_id?: string
          resultado?: string | null
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          bairro: string | null
          capital_social: number | null
          cep: string | null
          cnae_descricao: string | null
          cnae_principal: string | null
          cnpj: string
          company_id: string | null
          complemento: string | null
          contato_cargo: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_telefone: string | null
          created_at: string
          data_abertura: string | null
          data_conversao: string | null
          email: string | null
          email_contato: string | null
          id: string
          importado_por: string | null
          logradouro: string | null
          motivo_perda: string | null
          municipio: string | null
          nome_fantasia: string | null
          notas: string | null
          numero: string | null
          plano_interesse: string | null
          porte: string | null
          proximo_followup: string | null
          razao_social: string
          score: number
          segmento: string | null
          source: string
          status: string
          tags: string[]
          telefone1: string | null
          telefone2: string | null
          temperatura: string
          uf: string | null
          ultimo_contato: string | null
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cnae_descricao?: string | null
          cnae_principal?: string | null
          cnpj: string
          company_id?: string | null
          complemento?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          data_abertura?: string | null
          data_conversao?: string | null
          email?: string | null
          email_contato?: string | null
          id?: string
          importado_por?: string | null
          logradouro?: string | null
          motivo_perda?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          notas?: string | null
          numero?: string | null
          plano_interesse?: string | null
          porte?: string | null
          proximo_followup?: string | null
          razao_social: string
          score?: number
          segmento?: string | null
          source?: string
          status?: string
          tags?: string[]
          telefone1?: string | null
          telefone2?: string | null
          temperatura?: string
          uf?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cnae_descricao?: string | null
          cnae_principal?: string | null
          cnpj?: string
          company_id?: string | null
          complemento?: string | null
          contato_cargo?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_telefone?: string | null
          created_at?: string
          data_abertura?: string | null
          data_conversao?: string | null
          email?: string | null
          email_contato?: string | null
          id?: string
          importado_por?: string | null
          logradouro?: string | null
          motivo_perda?: string | null
          municipio?: string | null
          nome_fantasia?: string | null
          notas?: string | null
          numero?: string | null
          plano_interesse?: string | null
          porte?: string | null
          proximo_followup?: string | null
          razao_social?: string
          score?: number
          segmento?: string | null
          source?: string
          status?: string
          tags?: string[]
          telefone1?: string | null
          telefone2?: string | null
          temperatura?: string
          uf?: string | null
          ultimo_contato?: string | null
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      refresh_tokens: {
        Row: {
          created_at: string
          expires_at: string
          family_id: string
          id: string
          token_hash: string
          used: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          family_id: string
          id?: string
          token_hash: string
          used?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          family_id?: string
          id?: string
          token_hash?: string
          used?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refresh_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_events: {
        Row: {
          company_id: string | null
          created_at: string
          detalhes: Json | null
          id: string
          mensagem: string
          severidade: string
          tipo: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          detalhes?: Json | null
          id?: string
          mensagem: string
          severidade?: string
          tipo: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          detalhes?: Json | null
          id?: string
          mensagem?: string
          severidade?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      system_health: {
        Row: {
          component: string
          created_at: string
          details: Json | null
          error_count: number | null
          id: string
          last_heartbeat: string
          status: string
          updated_at: string
          uptime_seconds: number | null
        }
        Insert: {
          component: string
          created_at?: string
          details?: Json | null
          error_count?: number | null
          id?: string
          last_heartbeat?: string
          status?: string
          updated_at?: string
          uptime_seconds?: number | null
        }
        Update: {
          component?: string
          created_at?: string
          details?: Json | null
          error_count?: number | null
          id?: string
          last_heartbeat?: string
          status?: string
          updated_at?: string
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      thread_participants: {
        Row: {
          ativo: boolean
          email: string
          entrou_em: string
          id: string
          motivo_entrada: string
          thread_id: string
          tipo: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          email: string
          entrou_em?: string
          id?: string
          motivo_entrada: string
          thread_id: string
          tipo: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          email?: string
          entrou_em?: string
          id?: string
          motivo_entrada?: string
          thread_id?: string
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_metrics: {
        Row: {
          company_id: string | null
          created_at: string
          dentro_do_prazo: boolean | null
          id: string
          minutos_execucao: number | null
          minutos_resposta: number | null
          modulo_gesp: string | null
          t_acao_iniciada: string | null
          t_cliente_atualizado: string | null
          t_primeira_leitura: string | null
          thread_id: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          dentro_do_prazo?: boolean | null
          id?: string
          minutos_execucao?: number | null
          minutos_resposta?: number | null
          modulo_gesp?: string | null
          t_acao_iniciada?: string | null
          t_cliente_atualizado?: string | null
          t_primeira_leitura?: string | null
          thread_id?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          dentro_do_prazo?: boolean | null
          id?: string
          minutos_execucao?: number | null
          minutos_resposta?: number | null
          modulo_gesp?: string | null
          t_acao_iniciada?: string | null
          t_cliente_atualizado?: string | null
          t_primeira_leitura?: string | null
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "user_metrics_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          bloqueado_ate: string | null
          company_ids: string[] | null
          created_at: string
          deve_trocar_senha: boolean
          email: string
          id: string
          mfa_ativo: boolean
          mfa_enabled: boolean
          mfa_secret: string | null
          nome: string
          password_hash: string
          role: string
          tentativas_falhas: number
          updated_at: string
        }
        Insert: {
          bloqueado_ate?: string | null
          company_ids?: string[] | null
          created_at?: string
          deve_trocar_senha?: boolean
          email: string
          id?: string
          mfa_ativo?: boolean
          mfa_enabled?: boolean
          mfa_secret?: string | null
          nome: string
          password_hash: string
          role?: string
          tentativas_falhas?: number
          updated_at?: string
        }
        Update: {
          bloqueado_ate?: string | null
          company_ids?: string[] | null
          created_at?: string
          deve_trocar_senha?: boolean
          email?: string
          id?: string
          mfa_ativo?: boolean
          mfa_enabled?: boolean
          mfa_secret?: string | null
          nome?: string
          password_hash?: string
          role?: string
          tentativas_falhas?: number
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_maintenance: {
        Row: {
          company_id: string
          created_at: string
          descricao: string | null
          id: string
          km_na_manutencao: number | null
          nf_r2_path: string | null
          nota_fiscal: string | null
          oficina: string | null
          proxima_data: string | null
          proxima_km: number | null
          realizada_em: string
          tipo: string
          valor: number | null
          vehicle_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          km_na_manutencao?: number | null
          nf_r2_path?: string | null
          nota_fiscal?: string | null
          oficina?: string | null
          proxima_data?: string | null
          proxima_km?: number | null
          realizada_em: string
          tipo: string
          valor?: number | null
          vehicle_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          km_na_manutencao?: number | null
          nf_r2_path?: string | null
          nota_fiscal?: string | null
          oficina?: string | null
          proxima_data?: string | null
          proxima_km?: number | null
          realizada_em?: string
          tipo?: string
          valor?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_telemetry: {
        Row: {
          created_at: string
          id: string
          ignicao: boolean | null
          latitude: number
          longitude: number
          odometro: number | null
          provider: string | null
          raw_data: Json | null
          recorded_at: string
          vehicle_id: string
          velocidade: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          ignicao?: boolean | null
          latitude: number
          longitude: number
          odometro?: number | null
          provider?: string | null
          raw_data?: Json | null
          recorded_at: string
          vehicle_id: string
          velocidade?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          ignicao?: boolean | null
          latitude?: number
          longitude?: number
          odometro?: number | null
          provider?: string | null
          raw_data?: Json | null
          recorded_at?: string
          vehicle_id?: string
          velocidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_telemetry_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          alertas_ativos: Json
          ano: number | null
          chassi: string | null
          company_id: string
          cor: string | null
          created_at: string
          data_bateria: string | null
          gps_device_id: string | null
          gps_provider: string | null
          gps_ultima_leitura: string | null
          gps_ultimo_lat: number | null
          gps_ultimo_lng: number | null
          id: string
          km_atual: number
          licenciamento_validade: string | null
          marca: string | null
          modelo: string
          placa: string
          renavam: string | null
          seguro_apolice: string | null
          seguro_validade: string | null
          status: string
          tipo: string
          ultima_correia_km: number | null
          ultima_pastilha_km: number | null
          ultima_revisao_km: number | null
          ultima_troca_oleo_km: number | null
          ultima_troca_pneu_km: number | null
          updated_at: string
          vistoria_pf_validade: string | null
        }
        Insert: {
          alertas_ativos?: Json
          ano?: number | null
          chassi?: string | null
          company_id: string
          cor?: string | null
          created_at?: string
          data_bateria?: string | null
          gps_device_id?: string | null
          gps_provider?: string | null
          gps_ultima_leitura?: string | null
          gps_ultimo_lat?: number | null
          gps_ultimo_lng?: number | null
          id?: string
          km_atual?: number
          licenciamento_validade?: string | null
          marca?: string | null
          modelo: string
          placa: string
          renavam?: string | null
          seguro_apolice?: string | null
          seguro_validade?: string | null
          status?: string
          tipo?: string
          ultima_correia_km?: number | null
          ultima_pastilha_km?: number | null
          ultima_revisao_km?: number | null
          ultima_troca_oleo_km?: number | null
          ultima_troca_pneu_km?: number | null
          updated_at?: string
          vistoria_pf_validade?: string | null
        }
        Update: {
          alertas_ativos?: Json
          ano?: number | null
          chassi?: string | null
          company_id?: string
          cor?: string | null
          created_at?: string
          data_bateria?: string | null
          gps_device_id?: string | null
          gps_provider?: string | null
          gps_ultima_leitura?: string | null
          gps_ultimo_lat?: number | null
          gps_ultimo_lng?: number | null
          id?: string
          km_atual?: number
          licenciamento_validade?: string | null
          marca?: string | null
          modelo?: string
          placa?: string
          renavam?: string | null
          seguro_apolice?: string | null
          seguro_validade?: string | null
          status?: string
          tipo?: string
          ultima_correia_km?: number | null
          ultima_pastilha_km?: number | null
          ultima_revisao_km?: number | null
          ultima_troca_oleo_km?: number | null
          ultima_troca_pneu_km?: number | null
          updated_at?: string
          vistoria_pf_validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      vests: {
        Row: {
          baixa_comprovante_r2: string | null
          baixa_data: string | null
          company_id: string
          created_at: string
          data_fabricacao: string | null
          data_validade: string
          employee_id: string | null
          fabricante: string | null
          id: string
          nivel_protecao: string
          numero_serie: string
          status: string
          updated_at: string
        }
        Insert: {
          baixa_comprovante_r2?: string | null
          baixa_data?: string | null
          company_id: string
          created_at?: string
          data_fabricacao?: string | null
          data_validade: string
          employee_id?: string | null
          fabricante?: string | null
          id?: string
          nivel_protecao: string
          numero_serie: string
          status?: string
          updated_at?: string
        }
        Update: {
          baixa_comprovante_r2?: string | null
          baixa_data?: string | null
          company_id?: string
          created_at?: string
          data_fabricacao?: string | null
          data_validade?: string
          employee_id?: string | null
          fabricante?: string | null
          id?: string
          nivel_protecao?: string
          numero_serie?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "vests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      weapons: {
        Row: {
          calibre: string
          company_id: string
          created_at: string
          employee_id: string | null
          evento_contraparte: string | null
          evento_data: string | null
          evento_nf: string | null
          evento_nf_r2_path: string | null
          evento_tipo: string | null
          id: string
          marca: string | null
          modelo: string | null
          numero_serie: string
          registro_sinarm: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          calibre: string
          company_id: string
          created_at?: string
          employee_id?: string | null
          evento_contraparte?: string | null
          evento_data?: string | null
          evento_nf?: string | null
          evento_nf_r2_path?: string | null
          evento_tipo?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          numero_serie: string
          registro_sinarm?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          calibre?: string
          company_id?: string
          created_at?: string
          employee_id?: string | null
          evento_contraparte?: string | null
          evento_data?: string | null
          evento_nf?: string | null
          evento_nf_r2_path?: string | null
          evento_tipo?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          numero_serie?: string
          registro_sinarm?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weapons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weapons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "weapons_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_processed: {
        Row: {
          endpoint: string
          processed_at: string
          svix_id: string
        }
        Insert: {
          endpoint: string
          processed_at?: string
          svix_id: string
        }
        Update: {
          endpoint?: string
          processed_at?: string
          svix_id?: string
        }
        Relationships: []
      }
      workflow_email_outbound: {
        Row: {
          added_at: string
          email_outbound_id: string
          id: string
          workflow_id: string
        }
        Insert: {
          added_at?: string
          email_outbound_id: string
          id?: string
          workflow_id: string
        }
        Update: {
          added_at?: string
          email_outbound_id?: string
          id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_email_outbound_email_outbound_id_fkey"
            columns: ["email_outbound_id"]
            isOneToOne: false
            referencedRelation: "email_outbound"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_email_outbound_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "email_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_email_outbound_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "vw_processos_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_gesp_tasks: {
        Row: {
          added_at: string
          gesp_task_id: string
          id: string
          workflow_id: string
        }
        Insert: {
          added_at?: string
          gesp_task_id: string
          id?: string
          workflow_id: string
        }
        Update: {
          added_at?: string
          gesp_task_id?: string
          id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_gesp_tasks_gesp_task_id_fkey"
            columns: ["gesp_task_id"]
            isOneToOne: false
            referencedRelation: "gesp_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gesp_tasks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "email_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_gesp_tasks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "vw_processos_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      billing: {
        Row: {
          amount: number | null
          asaas_payment_id: string | null
          company_id: string | null
          created_at: string | null
          due_date: string | null
          id: string | null
          metodo_pagamento: string | null
          paid_date: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          asaas_payment_id?: string | null
          company_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          metodo_pagamento?: string | null
          paid_date?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          asaas_payment_id?: string | null
          company_id?: string | null
          created_at?: string | null
          due_date?: string | null
          id?: string | null
          metodo_pagamento?: string | null
          paid_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      dou_monitor_summary: {
        Row: {
          alertas_enviados: number | null
          alertas_pendentes: number | null
          alvaras_clientes: number | null
          alvaras_notificados: number | null
          alvaras_prospects: number | null
          dia: string | null
          secao: number | null
          total_alvaras: number | null
          total_publicacoes: number | null
        }
        Relationships: []
      }
      prospect_pipeline_summary: {
        Row: {
          mornos: number | null
          quentes: number | null
          score_medio: number | null
          status: string | null
          total: number | null
          valor_total: number | null
        }
        Relationships: []
      }
      vw_agent_dashboard: {
        Row: {
          agent_name: string | null
          avg_ms_24h: number | null
          cache_hit_rate_24h: number | null
          cost_24h: number | null
          failed_24h: number | null
          runs_24h: number | null
          success_24h: number | null
          tokens_24h: number | null
        }
        Relationships: []
      }
      vw_agent_escalations: {
        Row: {
          agent_name: string | null
          company_id: string | null
          confidence: number | null
          created_at: string | null
          human_override: string | null
          id: string | null
          input_summary: string | null
          output_summary: string | null
          run_id: string | null
          step_name: string | null
          trigger_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_decisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      vw_billing_resumo: {
        Row: {
          acoes_gesp_mes: number | null
          billing_status: string | null
          company_id: string | null
          data_proxima_cobranca: string | null
          divergencias_resolvidas_mes: number | null
          emails_enviados_mes: number | null
          plano: string | null
          razao_social: string | null
          valor_mensal: number | null
          vigilantes_ativos: number | null
          workflows_concluidos_mes: number | null
        }
        Insert: {
          acoes_gesp_mes?: never
          billing_status?: string | null
          company_id?: string | null
          data_proxima_cobranca?: string | null
          divergencias_resolvidas_mes?: never
          emails_enviados_mes?: never
          plano?: string | null
          razao_social?: string | null
          valor_mensal?: number | null
          vigilantes_ativos?: never
          workflows_concluidos_mes?: never
        }
        Update: {
          acoes_gesp_mes?: never
          billing_status?: string | null
          company_id?: string | null
          data_proxima_cobranca?: string | null
          divergencias_resolvidas_mes?: never
          emails_enviados_mes?: never
          plano?: string | null
          razao_social?: string | null
          valor_mensal?: number | null
          vigilantes_ativos?: never
          workflows_concluidos_mes?: never
        }
        Relationships: []
      }
      vw_dashboard_kpis: {
        Row: {
          divergencias_abertas: number | null
          emails_enviados_hoje: number | null
          gesp_tasks_pendentes: number | null
          total_empresas_ativas: number | null
          total_veiculos_ativos: number | null
          total_vigilantes_ativos: number | null
          validades_criticas: number | null
          workflows_abertos: number | null
          workflows_urgentes: number | null
        }
        Relationships: []
      }
      vw_dashboard_kpis_materialized: {
        Row: {
          divergencias_abertas: number | null
          emails_enviados_hoje: number | null
          gesp_tasks_pendentes: number | null
          total_empresas_ativas: number | null
          total_veiculos_ativos: number | null
          total_vigilantes_ativos: number | null
          validades_criticas: number | null
          workflows_abertos: number | null
          workflows_urgentes: number | null
        }
        Relationships: []
      }
      vw_iml_event_summary: {
        Row: {
          agent_name: string | null
          company_id: string | null
          entity_type: string | null
          event_type: string | null
          id: string | null
          incoming_edges: number | null
          metadata: Json | null
          occurred_at: string | null
          outgoing_edges: number | null
          severity: string | null
        }
        Insert: {
          agent_name?: string | null
          company_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          id?: string | null
          incoming_edges?: never
          metadata?: Json | null
          occurred_at?: string | null
          outgoing_edges?: never
          severity?: string | null
        }
        Update: {
          agent_name?: string | null
          company_id?: string | null
          entity_type?: string | null
          event_type?: string | null
          id?: string | null
          incoming_edges?: never
          metadata?: Json | null
          occurred_at?: string | null
          outgoing_edges?: never
          severity?: string | null
        }
        Relationships: []
      }
      vw_iml_insights_pending: {
        Row: {
          admin_approved: boolean | null
          admin_approved_at: string | null
          admin_approved_by: string | null
          admin_notes: string | null
          confidence: number | null
          confidence_label: string | null
          created_at: string | null
          description: string | null
          evidence_count: number | null
          evidence_event_ids: string[] | null
          expires_at: string | null
          first_detected_at: string | null
          id: string | null
          impact_level: string | null
          insight_type: string | null
          last_evidence_at: string | null
          parent_insight_id: string | null
          related_agent: string | null
          related_company_id: string | null
          status: string | null
          suggested_action: string | null
          suggested_params: Json | null
          title: string | null
          total_evidence: number | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          admin_approved?: boolean | null
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          admin_notes?: string | null
          confidence?: number | null
          confidence_label?: never
          created_at?: string | null
          description?: string | null
          evidence_count?: number | null
          evidence_event_ids?: string[] | null
          expires_at?: string | null
          first_detected_at?: string | null
          id?: string | null
          impact_level?: string | null
          insight_type?: string | null
          last_evidence_at?: string | null
          parent_insight_id?: string | null
          related_agent?: string | null
          related_company_id?: string | null
          status?: string | null
          suggested_action?: string | null
          suggested_params?: Json | null
          title?: string | null
          total_evidence?: never
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          admin_approved?: boolean | null
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          admin_notes?: string | null
          confidence?: number | null
          confidence_label?: never
          created_at?: string | null
          description?: string | null
          evidence_count?: number | null
          evidence_event_ids?: string[] | null
          expires_at?: string | null
          first_detected_at?: string | null
          id?: string | null
          impact_level?: string | null
          insight_type?: string | null
          last_evidence_at?: string | null
          parent_insight_id?: string | null
          related_agent?: string | null
          related_company_id?: string | null
          status?: string | null
          suggested_action?: string | null
          suggested_params?: Json | null
          title?: string | null
          total_evidence?: never
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "iml_insights_parent_insight_id_fkey"
            columns: ["parent_insight_id"]
            isOneToOne: false
            referencedRelation: "iml_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iml_insights_parent_insight_id_fkey"
            columns: ["parent_insight_id"]
            isOneToOne: false
            referencedRelation: "vw_iml_insights_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_iml_playbook_active: {
        Row: {
          active: boolean | null
          adjusted_value: Json | null
          apply_context: Json | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          default_value: Json | null
          description: string | null
          effectiveness_score: number | null
          id: string | null
          insight_confidence: number | null
          insight_title: string | null
          last_applied_at: string | null
          param_name: string | null
          rule_code: string | null
          source_insight_id: string | null
          successful_applications: number | null
          times_applied: number | null
          total_applications: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iml_playbook_rules_source_insight_id_fkey"
            columns: ["source_insight_id"]
            isOneToOne: false
            referencedRelation: "iml_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iml_playbook_rules_source_insight_id_fkey"
            columns: ["source_insight_id"]
            isOneToOne: false
            referencedRelation: "vw_iml_insights_pending"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_processos_ativos: {
        Row: {
          company_id: string | null
          created_at: string | null
          dados_extraidos: Json | null
          dias_aberto: number | null
          id: string | null
          nome_fantasia: string | null
          prioridade: string | null
          razao_social: string | null
          semaforo: string | null
          status: string | null
          tipo_demanda: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "vw_billing_resumo"
            referencedColumns: ["company_id"]
          },
        ]
      }
      vw_validades_criticas: {
        Row: {
          company_id: string | null
          data_validade: string | null
          dias_restantes: number | null
          entidade_id: string | null
          entidade_nome: string | null
          razao_social: string | null
          severidade: string | null
          tipo: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_expired_refresh_tokens: { Args: never; Returns: number }
      cleanup_old_notifications: { Args: never; Returns: number }
      expire_gesp_approvals: { Args: never; Returns: undefined }
      iml_emit_event: {
        Args: {
          p_agent_name?: string
          p_agent_run_id?: string
          p_caused_by_event_id?: string
          p_company_id?: string
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_metadata?: Json
          p_severity?: string
        }
        Returns: string
      }
      iml_update_insight_confidence: {
        Args: { p_insight_id: string; p_new_evidence_event_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      gesp_approval_status: "pending" | "approved" | "rejected" | "expired"
      gesp_approval_urgency: "low" | "normal" | "high" | "critical"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      gesp_approval_status: ["pending", "approved", "rejected", "expired"],
      gesp_approval_urgency: ["low", "normal", "high", "critical"],
    },
  },
} as const
