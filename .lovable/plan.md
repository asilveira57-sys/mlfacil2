

## Correção do Sandbox Operacional

### Diagnóstico (dados reais do banco)

**1. Cores não aparecem nos cards**
- `company_customization` armazena `company_id` = UUID da **ml_account** (ex: `997e5eb2`, `7130768b`)
- `useSandboxSnapshots` busca cores usando UUID da **company** (ex: `48ecc697`, `7f931fec`)
- Resultado: lookup nunca encontra a cor → fallback "blue" em todos

**2. Horário de corte sempre `--:--`**
- O `sandbox-snapshot-refresh` lê `shipping_cutoff_cache` filtrando por `seller_id = accountId` (ml_account UUID) — isso está correto
- Porém: o último registro de cutoff no cache é de **2026-03-06** (2 dias atrás). Não há refresh automático de cutoff integrado ao sandbox refresh
- O sandbox apenas **lê** o cache, mas nunca **dispara** o `meli-shipping-cutoff-refresh` para atualizar

**3. Etiquetas "agarradas" (Etiqueta Capixaba = 6)**
- O snapshot mostra `etiquetas_pendentes: 6` para seller `66043362`
- Isso vem de `meli_shipments_cache` com `shipment_substatus = ready_to_print`
- Se os envios já foram despachados mas o cache não atualizou, ficam "presos"

**4. Vendas estão sincronizando** (R$ 25.777 = soma de 10.268 + 14.574 + 0 + restante)

---

### Plano de Correção

#### 1. Corrigir lookup de cores no Sandbox

**Arquivo**: `src/hooks/useSandboxSnapshots.ts`

O `company_customization` usa ml_account UUID como `company_id`. Precisamos buscar cores por **ambos os IDs** (company real + ml_account UUID):
- Buscar `ml_accounts` para mapear company_id → ml_account.id
- Consultar `company_customization` usando os ml_account UUIDs
- Mapear de volta para os company_ids reais do snapshot

#### 2. Integrar refresh de cutoff no sandbox-snapshot-refresh

**Arquivo**: `supabase/functions/sandbox-snapshot-refresh/index.ts`

Dentro do loop de empresas, após coletar métricas:
- Verificar se o `shipping_cutoff_cache` tem registro para **hoje** (`date_ref = YYYY-MM-DD` em SP timezone)
- Se não tem ou está expirado: chamar `meli-shipping-cutoff-refresh` inline (invoke interna) passando `company_id`, `seller_id`, `ml_user_id`
- Depois reler o cache atualizado para popular `cutoff_flex_time` e `cutoff_coleta_time`

#### 3. Forçar re-sync de shipments para etiquetas "presas"

**Arquivo**: `supabase/functions/sandbox-snapshot-refresh/index.ts`

Adicionar uma etapa de "limpeza" que:
- Identifica shipments com `ready_to_print` há mais de 48h
- Marca para re-verificação via a fila existente (ou simplesmente não os conta como pendentes se `created_at` > 48h sem atividade)

Alternativa mais simples: filtrar por `date_ref` recente — etiquetas pendentes devem considerar apenas shipments dos **últimos 7 dias** para evitar acúmulo de dados antigos.

#### 4. Aplicar cor configurada nos cards

**Arquivo**: `src/components/sandbox/SandboxCompanyCard.tsx`

Nenhuma alteração necessária aqui — já consome `snapshot.color_key`. O fix é no passo 1 (lookup correto).

---

### Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `src/hooks/useSandboxSnapshots.ts` | Fix color lookup: buscar via ml_account UUID |
| `supabase/functions/sandbox-snapshot-refresh/index.ts` | Integrar cutoff refresh + filtrar etiquetas velhas |
| Deploy das edge functions | Obrigatório após alterações |

### Resultado Esperado

- Cards coloridos conforme configuração do usuário (purple, amber, etc.)
- Horário de corte atualizado automaticamente ao abrir o sandbox
- Etiquetas "presas" há dias não inflam o contador

