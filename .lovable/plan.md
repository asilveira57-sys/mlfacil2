
# Otimizacao do Cache de Periodos no Modal + Confirmacao de Ordenacao

## Problema

1. **Cache nao aproveitado**: Quando o usuario abre o modal com 30d e troca para 7d, o sistema faz uma nova chamada a API do ML (~20s) porque 7d nunca foi carregado antes. O cache global funciona por range exato de datas, entao 30d e 7d sao chaves diferentes.

2. **Ordenacao de colunas no modal**: Ja esta implementada em `AdsCampaignProducts.tsx` com headers clicaveis e icones de sort. Possivelmente o usuario nao percebeu ou os headers nao estao visualmente claros o suficiente.

## Solucao

### Parte 1: Pre-carregamento de periodos comuns

Quando a aba Campanhas carrega os dados de 30d, disparar em background (sem bloquear a UI) chamadas para os periodos mais usados (7d, 14d) para que ja estejam no cache quando o usuario abrir o modal e trocar de periodo.

**Arquivo**: `src/pages/Publicidade.tsx`

- Adicionar um `useEffect` que, apos o primeiro carregamento do periodo principal, dispara `supabase.functions.invoke('ads-period-metrics')` em background para 7d e 14d
- Salvar os resultados no cache global usando `setAdsCache` com a mesma chave que `useAdsPeriodMetrics` usaria
- Nao bloquear UI, nao mostrar loading - puramente background

### Parte 2: Feedback visual de cache no modal

No modal, quando o periodo ja esta em cache, a troca e instantanea. Quando nao esta, mostrar um indicador mais claro de que os dados estao sendo carregados.

**Arquivo**: `src/components/ads/AdsCampaignDetailModal.tsx`

- Ao lado dos botoes de periodo, indicar com um pequeno icone de check quais periodos ja tem cache disponivel
- Isso ajuda o usuario a entender quais trocas serao instantaneas

### Parte 3: Headers de ordenacao mais visiveis no modal

Tornar os headers de ordenacao da tabela de produtos no modal mais evidentes visualmente.

**Arquivo**: `src/components/ads/AdsCampaignProducts.tsx`

- Adicionar `hover:text-foreground` nos headers para dar feedback visual
- Manter os icones de seta ja existentes mas com opacidade maior

---

## Detalhamento Tecnico

### Pre-carregamento em Publicidade.tsx

```text
useEffect para preload de periodos:
  - Dispara quando sellerId muda ou quando periodLoading termina (primeiro load concluido)
  - Para cada periodo em [7d, 14d] que NAO seja o periodo atual:
    - Calcular dateFrom/dateTo
    - Verificar se ja existe no cache via getAdsCache(adsCacheKey(...))
    - Se nao existir, chamar supabase.functions.invoke('ads-period-metrics') em background
    - Salvar resultado no cache via setAdsCache()
  - Usar Promise.allSettled para nao bloquear
  - Silenciar erros (console.log apenas)
```

### Indicador de cache no modal

Adicionar uma funcao que verifica se um periodo tem dados em cache:

```text
const hasCacheForPeriod = (period: ModalPeriod): boolean => {
  if (period === 'custom') return false;
  const days = modalPeriodDays[period];
  const from = format(subDays(new Date(), days), 'yyyy-MM-dd');
  const to = format(new Date(), 'yyyy-MM-dd');
  const key = adsCacheKey(sellerId, 'period', from, to);
  return !!getAdsCache(key);
};

// No botao de periodo, adicionar indicador visual:
// Ponto verde se cache existe, nada se nao
```

### Headers mais visiveis

Adicionar classes `hover:text-foreground transition-colors` nos `TableHead` clicaveis do modal, e aumentar a opacidade dos icones de sort inativos de `opacity-40` para `opacity-60`.
