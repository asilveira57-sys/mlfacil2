

## Diagnóstico

O erro é **foreign key violation**: o código usa um `company_id` fixo fake (`00000000-0000-0000-0000-000000000001`) que não existe na tabela `companies`. Essa é a causa de todos os erros de integração ERP.

Além disso, o usuário quer unificar Tiny ERP e Olist em um único card, já que são a mesma plataforma (Olist = Tiny).

---

## Plano de correção

### 1. Usar company_id real do usuário logado

No `AdminErpIntegrations.tsx`, substituir o `DEMO_COMPANY_ID` constante pelo `activeCompanyId` obtido via `useUserContext()`. Adicionar tratamento para quando não houver empresa ativa.

### 2. Unificar em um único card "Olist / Tiny ERP"

- Remover os dois cards separados (Tiny + Olist)
- Manter um único card com provider `olist` e label "Olist (Tiny ERP)"
- Remover referências a `tiny` como provider separado nas abas de Captura e Mapeamento
- Manter a edge function `erp-test-connection` suportando ambos os providers internamente

### 3. Ajustar a edge function de teste

A função `erp-test-connection` já suporta `tiny` e `olist` — sem mudança necessária. O provider salvo será `olist`.

---

### Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/admin/AdminErpIntegrations.tsx` | Usar `useUserContext()` no lugar do ID fake; unificar em um único card Olist |

