
# Correcao da Central de Promocoes: Adesao Falha em Promocoes Expiradas

## Problema Diagnosticado

Os logs da edge function mostram que TODAS as 17 falhas tem o mesmo erro da API do Mercado Livre:

```
PROMOTION_STATUS_OPT_IN - finished
```

A promocao "Impulsione suas vendas" (P-MLB16555022) **terminou em 22/02 as 02:50**, mas o banco local ainda mostra `status: started`. Quando o usuario tenta aderir itens, a API do ML rejeita todas as tentativas porque a promocao ja acabou.

## Causas Raiz

1. **Status local desatualizado**: A `promotions-sync` atualiza o status para `finished` quando o ML retorna esse status, mas entre sincronizacoes o status fica stale. Nao existe validacao por `end_at`.

2. **Sem validacao client-side**: O botao "Aderir Candidatos" aparece mesmo quando `end_at` ja passou, porque so verifica `promotion.status === 'started'`.

3. **UX apos erro**: O dialog de confirmacao fecha (`setConfirmAction(null)`) e o refetch pode causar re-render que perde o contexto do modal.

## Alteracoes Tecnicas

### 1. `src/hooks/usePromotions.ts` - Marcar promocoes expiradas automaticamente

Adicionar logica nos computed views para tratar promocoes com `end_at` no passado como `finished`, independente do status no banco:

```typescript
// Ao calcular activePromotions, excluir as que ja passaram do end_at
const activePromotions = promotions.filter(p => {
  if (p.status !== 'started') return false;
  if (p.end_at && new Date(p.end_at) <= now) return false; // Expirou
  return true;
});

// Mover promocoes expiradas para finishedPromotions
const finishedPromotions = promotions.filter(p => {
  if (p.status === 'finished') return true;
  if (p.status === 'started' && p.end_at && new Date(p.end_at) <= now) return true;
  return false;
});
```

### 2. `src/components/promotions/PromotionDetailModal.tsx` - Bloquear acoes em promocoes expiradas

Adicionar verificacao de `end_at` antes de permitir adesao:

```typescript
const isExpired = promotion.end_at && new Date(promotion.end_at) <= new Date();

// Mostrar alerta quando promocao expirou
{isExpired && (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>
      Esta promocao ja encerrou. Sincronize para atualizar os dados.
    </AlertDescription>
  </Alert>
)}

// Desabilitar botoes de adesao quando expirada
{pendingItems.length > 0 && promotion.status === 'started' && !isExpired && (
  <Button ...>Aderir Candidatos</Button>
)}
```

### 3. `src/pages/Promocoes.tsx` - Melhorar tratamento de erros

- Nao fechar o modal de detalhes apos erro
- Mostrar mensagem especifica para erro `PROMOTION_STATUS_OPT_IN`
- Manter o usuario no contexto quando a acao falha

```typescript
// Na handlePromotionAction, tratar erro especifico
if (data?.results?.some(r => r.error?.includes('PROMOTION_STATUS_OPT_IN'))) {
  toast.error('Promocao encerrada no Mercado Livre. Sincronize para atualizar.');
}

// Nao fechar confirmAction se TODAS falharam
if (data?.success_count === 0) {
  // Manter dialog aberto mostrando o erro
  setConfirmAction(null); // Fecha o dialog de confirmacao, mas mantem o modal
}
```

### 4. `supabase/functions/promotions-sync/index.ts` - Marcar expiradas no sync

Adicionar passo para marcar como `finished` todas as promocoes com `end_at` no passado que ainda estao como `started`:

```typescript
// Antes de sincronizar com a API, marcar expiradas localmente
const { data: expiredLocal } = await supabase
  .from('promotion_snapshots')
  .update({ status: 'finished', updated_at: new Date().toISOString() })
  .eq('workspace_id', workspaceId)
  .eq('status', 'started')
  .lt('end_at', new Date().toISOString())
  .select('promotion_id');
```

## Resultado Esperado

- Promocoes expiradas (end_at no passado) aparecem automaticamente na aba "Finalizadas", nao em "Ativas"
- Botao "Aderir Candidatos" fica desabilitado para promocoes expiradas
- Alerta visual informa que a promocao encerrou
- Sincronizacao marca automaticamente promocoes expiradas como finished
- O usuario nao perde o contexto quando uma acao falha
