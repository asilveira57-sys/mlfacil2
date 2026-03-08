

## Diagnóstico

O componente `SettingsSubscription.tsx` está **100% hardcoded** com dados mock (planos "Starter", "Profissional", "Enterprise" com preços fixos). Não usa nenhum hook real. Os botões "Escolher plano" não têm `onClick` handler, por isso não são clicáveis. E não há lógica de filtro por volume de vendas.

## Plano: Conectar planos reais + filtro por volume + checkout funcional

### Arquivo: `src/components/settings/SettingsSubscription.tsx`

**1. Substituir dados mock por dados reais**

- Importar `useTierOffersCatalog` (tiers reais do banco) + `useUserSalesVolume` (volume 30d) + `useTenantCheckout` (checkout) + `useUserAccess` (status trial/subscription)
- Remover os arrays hardcoded `plans` e `payments`
- Renderizar os tiers vindos do catálogo real

**2. Filtrar planos por volume de vendas**

- Usar `totalSales30d` do `useUserSalesVolume`
- Cada tier tem `max_orders_30d` — se `totalSales30d > tier.max_orders_30d`, o plano é **pequeno demais** → desabilitar botão com texto "Volume acima do limite"
- Destacar o tier recomendado (o menor tier onde `max_orders_30d >= totalSales30d`)

**3. Botões funcionais**

- Tier enterprise: botão "Fale conosco" → navega para `/contato`
- Tier compatível: botão "Escolher plano" com `onClick` → chama `checkout(tier.code)`
- Tier pequeno demais: botão desabilitado + ícone Lock + tooltip "Seu volume de vendas excede este plano"
- Plano atual (se houver subscription ativa): botão "Plano atual" desabilitado

**4. Seção "Plano Atual"**

- Se trial ativo: mostrar card com status trial + dias restantes (do `useUserAccess`)
- Se subscription ativa: mostrar dados reais do plano contratado
- Se nenhum: mostrar card informativo "Nenhum plano ativo"

**5. Histórico de pagamentos**

- Manter estrutura da tabela mas com estado vazio por enquanto (dados reais de pagamento serão integrados futuramente)
- Mostrar mensagem "Nenhum pagamento registrado" quando vazio

### Resultado esperado
- Cards de planos vêm do banco (6 tiers reais)
- Planos abaixo do volume do seller ficam desabilitados com Lock
- Plano recomendado destacado
- Botão "Escolher plano" funcional → inicia checkout via Mercado Pago
- Trial ativo permite contratar antecipadamente

