
# Plano: Adicionar Logging Detalhado à Edge Function Anti-Catálogo

## Objetivo
Adicionar console.log com emojis em cada etapa do processo de criação de anúncio para diagnosticar erros, incluindo os logs na resposta da Edge Function.

---

## Análise da Situação Atual

A edge function `clone-anti-catalog-execute/index.ts` já possui alguns logs básicos:
- `[ANTI-CATALOG-V3] First attempt payload keys:`
- `[ANTI-CATALOG-V3] First attempt response:`
- `[ANTI-CATALOG-V3] Retry payload with family_name:`
- `[ANTI-CATALOG-V3] Retry response:`

No entanto, faltam:
1. Logs formatados com emojis para fácil visualização
2. Array de logs acumulados para retorno na resposta
3. Timestamp em cada log
4. Logs específicos para cada etapa do retry
5. Inclusão de `last_payload_sent` e `last_api_response` no retorno

---

## Implementação

### 1. Criar Sistema de Coleta de Logs

Adicionar no início da função `createItemWithFamilyNameRetry`:

```typescript
// Array para coletar logs
const executionLogs: string[] = [];

function addLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = data 
    ? `[${timestamp}] ${message} ${JSON.stringify(data)}`
    : `[${timestamp}] ${message}`;
  executionLogs.push(logEntry);
  console.log(logEntry);
}
```

### 2. Adicionar Logs na Primeira Tentativa

**Antes do primeiro POST:**
```typescript
addLog('🚀 [MERCADOLIVRE] Tentativa 1 - Payload SEM family_name', {
  category_id: itemPayload.category_id,
  title: itemPayload.title?.substring(0, 50),
  price: itemPayload.price,
  has_family_name: !!itemPayload.family_name,
  payload_keys: Object.keys(itemPayload),
  attributes_ids: (itemPayload.attributes || []).map((a: any) => a.id)
});
```

**Após resposta do primeiro POST (erro):**
```typescript
addLog('❌ [MERCADOLIVRE] Erro na tentativa 1', {
  status: createResponse.status,
  error_code: createData?.error,
  message: createData?.message,
  cause: createData?.cause,
  full_error: createData
});
```

**Após resposta do primeiro POST (sucesso):**
```typescript
addLog('✅ [MERCADOLIVRE] Anúncio criado com sucesso na tentativa 1', {
  item_id: createData.id,
  permalink: createData.permalink
});
```

### 3. Adicionar Logs na Detecção de Retry

**Ao detectar necessidade de family_name:**
```typescript
addLog('🔄 [MERCADOLIVRE] Detectado erro required_fields, buscando family_name...');
```

**Após buscar family_name:**
```typescript
addLog('📋 [MERCADOLIVRE] family_name obtido', {
  category_id: categoryId,
  family_name: familyNameValue,
  source: familyNameSource
});
```

### 4. Adicionar Logs na Segunda Tentativa

**Antes do segundo POST:**
```typescript
addLog('🚀 [MERCADOLIVRE] Tentativa 2 - Payload COM family_name', {
  category_id: retryPayload.category_id,
  family_name: retryPayload.family_name,
  title: retryPayload.title?.substring(0, 50),
  payload_keys: Object.keys(retryPayload),
  attributes_ids: (retryPayload.attributes || []).map((a: any) => a.id)
});
```

**Após resposta do segundo POST (sucesso):**
```typescript
addLog('✅ [MERCADOLIVRE] Anúncio criado com sucesso no retry', {
  item_id: createData.id,
  retry_count: 2,
  family_name_used: familyNameValue
});
```

**Após resposta do segundo POST (erro):**
```typescript
addLog('❌ [MERCADOLIVRE] Erro na tentativa 2 (retry)', {
  status: createResponse.status,
  error_code: createData?.error,
  message: createData?.message,
  cause: createData?.cause,
  full_error: createData
});
```

### 5. Atualizar Interface de Resultado

Adicionar novos campos à interface `CreateItemResult`:

```typescript
interface CreateItemResult {
  // ... campos existentes ...
  
  // Novos campos para debug
  execution_logs: string[];
  last_payload_sent: Record<string, any>;
  last_api_response: any;
}
```

### 6. Incluir Logs na Resposta

Atualizar o retorno para incluir:

```typescript
result.execution_logs = executionLogs;
result.last_payload_sent = lastPayloadSent; // Guardar o último payload enviado
result.last_api_response = createData;      // Guardar a última resposta da API
```

---

## Seção Técnica: Detalhes da Implementação

### Arquivo a Modificar
- `supabase/functions/clone-anti-catalog-execute/index.ts`

### Estrutura dos Logs
Cada log seguirá o padrão:
```
[2026-01-31T18:00:00.000Z] 🚀 [MERCADOLIVRE] Mensagem { dados_json }
```

### Variáveis de Tracking
```typescript
let lastPayloadSent: Record<string, any> = {};
let lastApiResponse: any = null;
```

### Pontos de Inserção de Log

| Linha Atual | Ação | Tipo de Log |
|-------------|------|-------------|
| ~234 | Antes do 1º POST | 🚀 Tentativa 1 |
| ~252 | Após 1º POST (erro) | ❌ Erro tentativa 1 |
| ~255-259 | Após 1º POST (sucesso) | ✅ Sucesso tentativa 1 |
| ~266 | Detecta retry | 🔄 Detectado required_fields |
| ~287 | Após buscar family_name | 📋 family_name obtido |
| ~302 | Antes do 2º POST | 🚀 Tentativa 2 |
| ~319 | Após 2º POST | ✅/❌ Resultado retry |
| ~350 | Erro final | ❌ Erro final |

### Retorno Atualizado da Função

```typescript
return {
  success: true/false,
  item_id?: string,
  permalink?: string,
  error?: string,
  error_code?: string,
  api_status?: number,
  api_error?: any,
  retry_info: { ... },
  diagnostic: { ... },
  // Novos campos:
  execution_logs: string[],
  last_payload_sent: Record<string, any>,
  last_api_response: any
};
```

---

## Resultado Esperado

Após implementação, ao clicar em "Clonar como Anúncio Novo" e ocorrer erro:

1. **Nos logs da Edge Function** (via Cloud View):
   - Sequência completa com emojis
   - Payloads enviados
   - Respostas da API

2. **Na resposta da API** (visível no frontend):
   - `execution_logs`: Array com todos os passos
   - `last_payload_sent`: Último payload enviado
   - `last_api_response`: Resposta completa do Mercado Livre

Isso permitirá identificar exatamente:
- Se o retry está sendo executado
- Se o `family_name` está sendo adicionado corretamente
- Qual resposta exata a API está retornando
