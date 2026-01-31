

## Plano: Reorganização de Empresas e Contas ML com Hierarquia Menu/Submenu

### Objetivo
Criar uma estrutura hierárquica onde **Empresas** são o nível superior e as **Contas do Mercado Livre** ficam subordinadas a elas, como um menu expandível. Além disso, adicionar opção de criar empresa usando o Nome Fantasia do faturamento e vincular integrações ERP (Olist/Bling) ao nível da empresa.

---

### 1. Mudanças no Banco de Dados

#### 1.1 Adicionar `company_id` na tabela `ml_accounts`
```sql
ALTER TABLE ml_accounts 
ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
```

#### 1.2 Criar índice para performance
```sql
CREATE INDEX idx_ml_accounts_company_id ON ml_accounts(company_id);
```

---

### 2. Mudanças nas Edge Functions

#### 2.1 Atualizar `ml-auth-url/index.ts`
- Receber `companyId` no body da requisição
- Incluir `companyId` no state do OAuth para ser recuperado no callback

#### 2.2 Atualizar `ml-oauth-callback/index.ts`
- Extrair `companyId` do state
- Ao criar/atualizar conta ML, associar ao `company_id` se fornecido

---

### 3. Mudanças na Interface - `SettingsCompanies.tsx`

#### 3.1 Nova Estrutura Visual: Accordion de Empresas
Substituir a lista plana por uma estrutura acordeão expandível:

```
┌─────────────────────────────────────────────────┐
│ 🏢 MINHA LOJA LTDA                    [Expandir]│
│    Pessoa Jurídica • 2 contas ML                │
├─────────────────────────────────────────────────┤
│   ├─ 🏬 ADECONEXVV                   [Conectada]│
│   │     ID: 66043362 • Última sync há 11h       │
│   │                            [Conta Ativa]    │
│   │                                             │
│   └─ 🏬 MLFACIL_CONSULTORIA          [Conectada]│
│         ID: 1667452966 • Última sync há 7h      │
│                             [Definir ativa]     │
│                                                 │
│   [+ Conectar conta ML a esta empresa]          │
├─────────────────────────────────────────────────┤
│   ⚙️ Integrações ERP                            │
│   ├─ Olist: Token configurado ✓                 │
│   └─ Bling: Pendente configuração               │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 🏢 Contas sem empresa                [Expandir] │
│    1 conta não vinculada                        │
├─────────────────────────────────────────────────┤
│   └─ 🏬 CONTA_AVULSA                 [Conectada]│
│         [Vincular a empresa]                    │
└─────────────────────────────────────────────────┘
```

#### 3.2 Modal "Nova Empresa" com Opção de Usar Dados de Faturamento
Adicionar botão para preencher o nome automaticamente com dados de faturamento:

```
┌─────────────────────────────────────────────────┐
│ Adicionar Nova Empresa                    [X]   │
│                                                 │
│ [Usar dados de faturamento]                     │
│                                                 │
│ Nome interno da empresa                         │
│ ┌─────────────────────────────────────────────┐ │
│ │ Ex: Minha Loja ES                           │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Tipo                                            │
│ ○ Pessoa Física   ● Pessoa Jurídica             │
│                                                 │
│              [Cancelar]  [Criar Empresa]        │
└─────────────────────────────────────────────────┘
```

- Ao clicar "Usar dados de faturamento":
  - Se PJ: Preenche com `nomeFantasia` ou `razaoSocial` do billing
  - Se PF: Preenche com nome do perfil do usuário

#### 3.3 Vincular Conta ML ao Conectar
Ao clicar "Conectar conta ML" dentro de uma empresa:
- Passa `companyId` para a edge function `ml-auth-url`
- O callback associa automaticamente a nova conta à empresa

#### 3.4 Mover Conta entre Empresas
Adicionar dropdown para contas "soltas" poderem ser associadas a uma empresa existente.

---

### 4. Mudanças nas Integrações ERP

#### 4.1 Vincular Integrações à Empresa
A tabela `erp_integrations` já possui `company_id`. Exibir seção de integrações ERP dentro do acordeão de cada empresa.

#### 4.2 Mover Configuração de Token
Os tokens Olist/Bling devem ser configurados no contexto da empresa, não globalmente.

---

### 5. Arquivos a Serem Modificados

| Arquivo | Alteração |
|---------|-----------|
| `SettingsCompanies.tsx` | Refatorar para estrutura acordeão; adicionar modal com autofill de billing |
| `SettingsIntegrations.tsx` | Remover (mover lógica para dentro de SettingsCompanies) |
| `ml-auth-url/index.ts` | Passar companyId no state |
| `ml-oauth-callback/index.ts` | Salvar company_id na conta ML |
| `src/locales/*/settings.json` | Adicionar traduções para novos textos |

---

### 6. Fluxo de Uso Esperado

1. Usuário cria empresa (manual ou usando nome de faturamento)
2. Clica em "Conectar conta ML" dentro da empresa
3. Autoriza no Mercado Livre
4. Conta é automaticamente vinculada à empresa
5. Configura token Olist/Bling na mesma empresa
6. Sistema filtra dados por empresa selecionada

---

### Seção Técnica

**Migração de Dados Existentes:**
- Contas ML sem `company_id` ficam na seção "Contas sem empresa"
- Usuário pode vincular manualmente

**Componentes Novos:**
- `CompanyAccordionItem.tsx` - Item expandível por empresa
- `LinkAccountToCompanyDialog.tsx` - Modal para vincular conta solta

**Queries Alteradas:**
- Fetch de contas ML deve incluir JOIN com companies
- Agrupamento por company_id no frontend

**Dependência do Radix Accordion:**
- Já instalado: `@radix-ui/react-accordion`

