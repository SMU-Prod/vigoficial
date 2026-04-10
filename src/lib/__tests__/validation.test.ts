import { describe, it, expect } from 'vitest'
import {
  loginSchema,
  changePasswordSchema,
  companySchema,
  employeeSchema,
  vehicleSchema,
  reportSchema,
  createUserSchema,
} from '../validation/schemas'

describe('Validation - loginSchema', () => {
  it('should validate valid login', async () => {
    const result = await loginSchema.parseAsync({
      email: 'user@example.com',
      password: 'mypassword123',
    })

    expect(result.email).toBe('user@example.com')
    expect(result.password).toBe('mypassword123')
  })

  it('should lowercase email', async () => {
    const result = await loginSchema.parseAsync({
      email: 'USER@EXAMPLE.COM',
      password: 'mypassword123',
    })

    expect(result.email).toBe('user@example.com')
  })

  it('should validate email without spaces', async () => {
    const result = await loginSchema.parseAsync({
      email: 'user@example.com',
      password: 'mypassword123',
    })

    expect(result.email).toBe('user@example.com')
  })

  it('should reject invalid email', async () => {
    await expect(
      loginSchema.parseAsync({
        email: 'invalid-email',
        password: 'mypassword123',
      })
    ).rejects.toThrow()
  })

  it('should require password', async () => {
    await expect(
      loginSchema.parseAsync({
        email: 'user@example.com',
        password: '',
      })
    ).rejects.toThrow()
  })

  it('should reject missing email', async () => {
    await expect(
      loginSchema.parseAsync({
        password: 'mypassword123',
      })
    ).rejects.toThrow()
  })
})

describe('Validation - changePasswordSchema', () => {
  it('should validate valid password change', async () => {
    const result = await changePasswordSchema.parseAsync({
      senhaAtual: 'CurrentPassword123!',
      novaSenha: 'NewPassword123!@#',
    })

    expect(result.senhaAtual).toBe('CurrentPassword123!')
    expect(result.novaSenha).toBe('NewPassword123!@#')
  })

  it('should reject short new password', async () => {
    await expect(
      changePasswordSchema.parseAsync({
        senhaAtual: 'CurrentPassword123!',
        novaSenha: 'Short1!',
      })
    ).rejects.toThrow()
  })

  it('should reject new password without uppercase', async () => {
    await expect(
      changePasswordSchema.parseAsync({
        senhaAtual: 'CurrentPassword123!',
        novaSenha: 'newpassword123!@#',
      })
    ).rejects.toThrow()
  })

  it('should reject new password without number', async () => {
    await expect(
      changePasswordSchema.parseAsync({
        senhaAtual: 'CurrentPassword123!',
        novaSenha: 'NewPassword!@#$%^&',
      })
    ).rejects.toThrow()
  })

  it('should reject new password without special character', async () => {
    await expect(
      changePasswordSchema.parseAsync({
        senhaAtual: 'CurrentPassword123!',
        novaSenha: 'NewPassword123ABC',
      })
    ).rejects.toThrow()
  })

  it('should require current password', async () => {
    await expect(
      changePasswordSchema.parseAsync({
        senhaAtual: '',
        novaSenha: 'NewPassword123!@#',
      })
    ).rejects.toThrow()
  })
})

describe('Validation - companySchema', () => {
  const validCompanyData = {
    cnpj: '11222333000181',
    razao_social: 'Empresa Teste Ltda',
    email_operacional: 'operacional@empresa.com',
    email_responsavel: 'responsavel@empresa.com',
    uf_sede: 'SP',
  }

  it('should validate valid company', async () => {
    const result = await companySchema.parseAsync(validCompanyData)

    expect(result.cnpj).toBe('11222333000181')
    expect(result.razao_social).toBe('Empresa Teste Ltda')
  })

  it('should reject invalid CNPJ', async () => {
    await expect(
      companySchema.parseAsync({
        ...validCompanyData,
        cnpj: 'invalid-cnpj',
      })
    ).rejects.toThrow()
  })

  it('should remove CNPJ formatting', async () => {
    const result = await companySchema.parseAsync({
      ...validCompanyData,
      cnpj: '11.222.333/0001-81',
    })

    expect(result.cnpj).toBe('11222333000181')
  })

  it('should reject missing razao_social', async () => {
    await expect(
      companySchema.parseAsync({
        ...validCompanyData,
        razao_social: '',
      })
    ).rejects.toThrow()
  })

  it('should reject invalid email_operacional', async () => {
    await expect(
      companySchema.parseAsync({
        ...validCompanyData,
        email_operacional: 'invalid-email',
      })
    ).rejects.toThrow()
  })

  it('should reject invalid UF', async () => {
    await expect(
      companySchema.parseAsync({
        ...validCompanyData,
        uf_sede: 'XXX',
      })
    ).rejects.toThrow()
  })

  it('should lowercase emails', async () => {
    const result = await companySchema.parseAsync({
      ...validCompanyData,
      email_operacional: 'OPERACIONAL@EMPRESA.COM',
      email_responsavel: 'RESPONSAVEL@EMPRESA.COM',
    })

    expect(result.email_operacional).toBe('operacional@empresa.com')
    expect(result.email_responsavel).toBe('responsavel@empresa.com')
  })

  it('should have default plano value', async () => {
    const result = await companySchema.parseAsync(validCompanyData)

    expect(result.plano).toBe('starter')
  })
})

describe('Validation - employeeSchema', () => {
  const validEmployeeData = {
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    nome_completo: 'João Silva da Santos',
    cpf: '11144477735',
    rg: '123456789',
    rg_orgao_emissor: 'SSP',
    rg_uf: 'SP',
    data_nascimento: '1990-01-15',
    sexo: 'M',
    nome_mae: 'Maria Silva Santos',
    email: 'joao@example.com',
    telefone1: '11987654321',
    status: 'ativo',
    data_admissao: '2023-01-01',
    funcao_principal: 'Vigilante Patrimonial',
    cnv_numero: 'CNV123456',
    cnv_uf_emissora: 'SP',
    cnv_data_emissao: '2023-01-01',
    cnv_data_validade: '2026-01-01',
  }

  it('should validate valid employee', async () => {
    const result = await employeeSchema.parseAsync(validEmployeeData)

    expect(result.nome_completo).toBe('João Silva da Santos')
    expect(result.cpf).toBe('11144477735')
  })

  it('should reject invalid CPF', async () => {
    await expect(
      employeeSchema.parseAsync({
        ...validEmployeeData,
        cpf: '00000000000',
      })
    ).rejects.toThrow()
  })

  it('should remove CPF formatting', async () => {
    const result = await employeeSchema.parseAsync({
      ...validEmployeeData,
      cpf: '111.444.777-35',
    })

    expect(result.cpf).toBe('11144477735')
  })

  it('should lowercase email', async () => {
    const result = await employeeSchema.parseAsync({
      ...validEmployeeData,
      email: 'JOAO@EXAMPLE.COM',
    })

    expect(result.email).toBe('joao@example.com')
  })

  it('should reject missing data_admissao', async () => {
    await expect(
      employeeSchema.parseAsync({
        ...validEmployeeData,
        data_admissao: '',
      })
    ).rejects.toThrow()
  })

  it('should reject invalid funcao_principal', async () => {
    await expect(
      employeeSchema.parseAsync({
        ...validEmployeeData,
        funcao_principal: 'Invalid Function',
      })
    ).rejects.toThrow()
  })

  it('should accept valid funcao_principal values', async () => {
    const funcoes = [
      'Vigilante Patrimonial',
      'Vigilante Armado',
      'Vigilante Desarmado',
      'Vigilante de Transporte de Valores',
      'Vigilante de Escolta Armada',
      'Vigilante de Segurança Pessoal Privada',
      'Vigilante de Grandes Eventos',
    ]

    for (const funcao of funcoes) {
      const result = await employeeSchema.parseAsync({
        ...validEmployeeData,
        funcao_principal: funcao,
      })
      expect(result.funcao_principal).toBe(funcao)
    }
  })

  it('should have default status', async () => {
    const result = await employeeSchema.parseAsync(validEmployeeData)
    expect(result.status).toBe('ativo')
  })
})

describe('Validation - vehicleSchema', () => {
  const validVehicleData = {
    company_id: '550e8400-e29b-41d4-a716-446655440000',
    placa: 'ABC1234',
    modelo: 'Hilux',
  }

  it('should validate valid vehicle', async () => {
    const result = await vehicleSchema.parseAsync(validVehicleData)

    expect(result.placa).toBe('ABC1234')
    expect(result.modelo).toBe('Hilux')
  })

  it('should reject short plate', async () => {
    await expect(
      vehicleSchema.parseAsync({
        ...validVehicleData,
        placa: 'ABC12',
      })
    ).rejects.toThrow()
  })

  it('should reject short model', async () => {
    await expect(
      vehicleSchema.parseAsync({
        ...validVehicleData,
        modelo: 'X',
      })
    ).rejects.toThrow()
  })

  it('should have default type', async () => {
    const result = await vehicleSchema.parseAsync(validVehicleData)
    expect(result.tipo).toBe('operacional')
  })

  it('should have default km_atual', async () => {
    const result = await vehicleSchema.parseAsync(validVehicleData)
    expect(result.km_atual).toBe(0)
  })
})

describe('Validation - reportSchema', () => {
  it('should validate valid report', async () => {
    const result = await reportSchema.parseAsync({
      tipo: 'mensal',
      mes: '2024-01',
    })

    expect(result.tipo).toBe('mensal')
    expect(result.mes).toBe('2024-01')
  })

  it('should reject invalid tipo', async () => {
    await expect(
      reportSchema.parseAsync({
        tipo: 'invalid',
        mes: '2024-01',
      })
    ).rejects.toThrow()
  })

  it('should reject invalid mes format', async () => {
    await expect(
      reportSchema.parseAsync({
        tipo: 'mensal',
        mes: '01-2024',
      })
    ).rejects.toThrow()
  })

  it('should accept all valid tipos', async () => {
    const tipos = ['mensal', 'compliance', 'validades', 'gesp', 'frota', 'billing']

    for (const tipo of tipos) {
      const result = await reportSchema.parseAsync({
        tipo,
        mes: '2024-01',
      })
      expect(result.tipo).toBe(tipo)
    }
  })

  it('should have default tipo', async () => {
    const result = await reportSchema.parseAsync({})
    expect(result.tipo).toBe('mensal')
  })

  it('should set default mes to current month', async () => {
    const result = await reportSchema.parseAsync({})
    const currentMonth = new Date().toISOString().slice(0, 7)
    expect(result.mes).toBe(currentMonth)
  })
})

describe('Validation - createUserSchema', () => {
  const validUserData = {
    email: 'user@example.com',
    nome: 'João Silva',
    password: 'ValidPassword123!@#',
  }

  it('should validate valid user', async () => {
    const result = await createUserSchema.parseAsync(validUserData)

    expect(result.email).toBe('user@example.com')
    expect(result.nome).toBe('João Silva')
  })

  it('should reject weak password', async () => {
    await expect(
      createUserSchema.parseAsync({
        ...validUserData,
        password: 'weak',
      })
    ).rejects.toThrow()
  })

  it('should have default role', async () => {
    const result = await createUserSchema.parseAsync(validUserData)
    expect(result.role).toBe('viewer')
  })

  it('should have default company_ids', async () => {
    const result = await createUserSchema.parseAsync(validUserData)
    expect(result.company_ids).toEqual([])
  })

  it('should accept valid roles', async () => {
    const roles = ['admin', 'operador', 'viewer']

    for (const role of roles) {
      const result = await createUserSchema.parseAsync({
        ...validUserData,
        role,
      })
      expect(result.role).toBe(role)
    }
  })
})
