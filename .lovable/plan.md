
# Corrigir Bug de Log de Auditoria e Padronizar Logging Central

## Problema Identificado

O parametro esta errado: a funcao `logToAudit` passa `p_meta` mas a RPC `register_system_log` espera `p_meta_json`. Isso faz a chamada falhar silenciosamente (catch vazio), e nenhum log e gravado.

O mesmo bug existe em 2 edge functions:
- `ads-campaign-manage` (linha 62): `p_meta` em vez de `p_meta_json`
- `mktpfacil-clone` (linhas 547 e 576): `p_meta` em vez de `p_meta_json`

Alem disso, a grande maioria das edge functions criticas nao tem nenhum logging centralizado (ads-sync, ads-rules-engine, pricing-engine, billing-checkout, etc.).

## Solucao

### Parte 1: Criar helper compartilhado `_shared/audit-log.ts`

Criar um utilitario reutilizavel que encapsula a chamada correta a `register_system_log`, evitando que o erro de parametro se repita.

```text
// supabase/functions/_shared/audit-log.ts
export async function auditLog(supabase, params: {
  level: string,
  area: string,
  action: string,
  userId?: string | null,
  success: boolean,
  message: string,
  meta?: Record<string, unknown>
}) {
  try {
    await supabase.rpc('register_system_log', {
      p_level: params.level,
      p_system_area: params.area,
      p_action: params.action,
      p_user_id: params.userId || null,
      p_success: params.success,
      p_message: params.message,
      p_meta_json: params.meta || {},   // <-- nome correto
    });
  } catch (_) { /* fail-safe */ }
}
```

### Parte 2: Corrigir `ads-campaign-manage`

- Substituir a funcao `logToAudit` local pelo import do `auditLog` compartilhado
- Isso corrige automaticamente o parametro `p_meta` -> `p_meta_json`
- Todas as 10 chamadas existentes serao atualizadas

### Parte 3: Corrigir `mktpfacil-clone`

- Substituir as 2 chamadas diretas a `register_system_log` pelo import de `auditLog`
- Corrige o parametro `p_meta` -> `p_meta_json`

### Parte 4: Adicionar logging as edge functions criticas sem auditoria

Adicionar auditoria centralizada (erro + sucesso) as seguintes funcoes prioritarias:

| Edge Function | Area | O que registrar |
|---|---|---|
| `ads-sync` | ads_sync | Inicio/fim da sync, erros de API |
| `ads-rules-engine` | ads_rules | Regras executadas, acoes tomadas, erros |
| `pricing-engine` | pricing | Calculos executados, erros |
| `billing-checkout` | billing | Checkout iniciado, sucesso/falha |
| `promotions-action` | promotions | Acoes de promocao, erros |
| `publish-to-ml` | publish | Publicacao de anuncio, erros |

Para cada funcao, o padrao sera:
1. Importar `auditLog` do `_shared/audit-log.ts`
2. Adicionar chamada no catch global (erro nao tratado)
3. Adicionar chamada nos pontos de erro de API externa
4. Adicionar chamada de sucesso no fluxo principal

---

## Detalhamento Tecnico

### Arquivo novo: `supabase/functions/_shared/audit-log.ts`

Helper com interface simples que mapeia corretamente para os parametros da RPC.

### Arquivo modificado: `supabase/functions/ads-campaign-manage/index.ts`

- Remover funcao `logToAudit` local (linhas 53-64)
- Importar `auditLog` do shared
- Substituir todas as chamadas `logToAudit(supabase, level, action, userId, success, msg, meta)` por `auditLog(supabase, { level, area: 'ads_manage', action, userId, success, message: msg, meta })`

### Arquivo modificado: `supabase/functions/mktpfacil-clone/index.ts`

- Importar `auditLog` do shared
- Substituir as 2 chamadas diretas a `supabase.rpc('register_system_log', { p_meta: ... })` por `auditLog(supabase, { ... meta: ... })`

### Arquivos modificados (adicionar logging): 6 edge functions

Para cada uma, adicionar:
- Import do `auditLog`
- `auditLog` no catch global
- `auditLog` nos pontos de erro criticos
- `auditLog` de sucesso no fluxo principal

Redeploy de todas as funcoes modificadas.
