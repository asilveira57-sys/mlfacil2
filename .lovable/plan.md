

## Diagnóstico: Catálogo de Custos -- Produto Não Encontrado no ERP

### Causa raiz identificada

A API do Tiny (Olist) **exige requisições POST com dados form-encoded**, mas o sistema está fazendo **GET com query string**. A documentação oficial do Tiny especifica:

```text
Método: POST
Content-Type: application/x-www-form-urlencoded
Body: token=XXX&pesquisa=RM110X74MCBR&formato=JSON
```

O código atual faz:
```text
GET https://api.tiny.com.br/api2/produtos.pesquisa.php?token=XXX&pesquisa=RM110X74MCBR&formato=JSON
```

A API do Tiny pode aceitar GET em algumas situações mas retornar resultados vazios ou inconsistentes. O método correto é POST com form-encoded body.

### Plano de correção

**Arquivo:** `supabase/functions/cost-engine/index.ts` -- função `fetchOlistCost`

1. **Mudar de GET para POST com form-encoded body:**
   - Usar `method: 'POST'` com `Content-Type: application/x-www-form-urlencoded`
   - Enviar `token`, `pesquisa` e `formato` no body, não na URL

2. **Adicionar fallback de busca:** Se a primeira pesquisa por SKU retornar vazio, tentar uma segunda busca removendo caracteres especiais ou usando apenas parte do código (ex: sem o prefixo/sufixo)

3. **Melhorar logs de diagnóstico:** Logar a resposta completa da API quando `status !== 'OK'` para identificar erros silenciosos (token expirado, rate limit, etc.)

### Código da correção

A função `fetchOlistCost` será atualizada de:
```typescript
const response = await fetch(`${url}?${params}`);
```

Para:
```typescript
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: params.toString(),
});
```

Apenas ~5 linhas alteradas no edge function. Redeploy automático.

