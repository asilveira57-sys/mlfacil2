
# Correcao da Central de Promocoes - IMPLEMENTADO

## Status: ✅ Concluído (exceto "Voce recebe")

### Parte 1: Enriquecer durante a sincronizacao ✅
- `promotions-sync` agora busca titulo/thumbnail na API do ML (com token de autenticacao) apos sync dos itens
- Upsert no `meli_listings_cache` para futuras sessoes

### Parte 2: Fallback imediato no frontend ✅
- Rota `enrich` adicionada na `promotions-action` (sem funcao nova)
- Usa token do seller para autenticacao na API do ML (multiget com batches de 20)
- Hook `useEnrichedPromotionItems` chama via `supabase.functions.invoke` (sem CORS)

### Parte 3: Deploy da edge function ✅
- `promotions-action` deployada e testada (enrich + adhere/remove)
- `promotions-sync` deployada com enriquecimento

### Parte 4: Modal nao fecha prematuramente ✅
- `AlertDialogAction` substituido por `Button` normal
- `onOpenChange` bloqueado durante `actionLoading`
- Modal de detalhes permanece aberto apos acao

### Parte 5: "Voce recebe" ⏳
- NAO implementado - requer analise de comissao + frete
