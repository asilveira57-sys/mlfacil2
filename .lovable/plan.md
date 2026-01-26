
# Plano de Correção: Integração Mercado ADS e Central de Promoções

## Diagnóstico Confirmado

### 1. Redundância de Conexões no Mercado ADS
O sistema tem **3 estruturas paralelas** para gerenciar conexões com o Mercado Livre:

| Tabela | Registros | Uso Atual |
|--------|-----------|-----------|
| `ml_accounts` | 1 | Módulos operacionais (Vendas, Custos, Radiografia) |
| `marketplace_accounts` | 0 | Estrutura multiconta do Core SaaS (nova) |
| `ads_connections` | 0 | Exclusiva do módulo Mercado ADS (recém-criada) |

**Causa do problema:** O módulo Mercado ADS detecta corretamente a conta conectada via `ml_accounts` (linha 73-82 do Publicidade.tsx), mas a aba "Conexões" opera sobre `ads_connections` que está vazia, criando a impressão de que não há conexão.

### 2. Central de Promoções Ausente
- **Backend implementado:** Edge Function `promotions-sync`, tabelas `promotion_snapshots` e `promotion_items_snapshots`
- **Frontend ausente:** Não existe rota `/promocoes` no App.tsx nem item no menu lateral (AppSidebar.tsx)
- O módulo está "escondido" dentro de Tarefas, sem acesso direto

---

## Solução Proposta

### Parte 1: Eliminar Redundância no Mercado ADS

**Abordagem:** Fazer o módulo ADS reconhecer automaticamente a conexão existente em `ml_accounts`, eliminando a necessidade de "conectar novamente".

1. **Modificar `useAdsConnections.ts`:**
   - Ao carregar, verificar se existe conta em `ml_accounts` para o usuário
   - Se existir e não houver entrada em `ads_connections`, criar automaticamente (auto-link)
   - Sincronizar status da conexão ADS com o status real da conta ML

2. **Modificar `AdsConnectionsPanel.tsx`:**
   - Mostrar informações da conta ML existente
   - Substituir botão "Conectar Conta" por status "Conta vinculada automaticamente"
   - Manter botões de sincronização manual e configurações

3. **Lógica de Auto-Link:**
```text
Se ml_accounts existe para o usuário:
  ├─ Se ads_connections não existe:
  │     └─ Criar entrada automaticamente com status "connected"
  └─ Se ads_connections existe:
        └─ Sincronizar dados (nome da conta, seller_id)
```

### Parte 2: Criar Página da Central de Promoções

1. **Criar `src/pages/Promocoes.tsx`:**
   - Dashboard de promoções ativas, terminando em breve e finalizadas
   - Lista de itens por status (elegíveis, pendentes, inelegíveis)
   - Cards com métricas de cada promoção
   - Integração com o hook `usePromotions` existente

2. **Adicionar Rota no `App.tsx`:**
   - Nova rota `/promocoes`

3. **Adicionar Item no Menu Lateral:**
   - Novo item "Promoções" no grupo Principal do `AppSidebar.tsx`
   - Ícone: `Tag` ou `Percent`

4. **Estrutura da Página:**
   - Header com título e botão de sincronização
   - Cards de resumo (Ativas, Terminando, Finalizadas)
   - Tabela de promoções com filtros
   - Drawer de detalhes ao clicar em uma promoção
   - Lista de itens da promoção selecionada

---

## Detalhamento Técnico

### Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/pages/Promocoes.tsx` | Página principal da Central de Promoções |
| `src/components/promocoes/PromotionsHeader.tsx` | Header com ações |
| `src/components/promocoes/PromotionsKpis.tsx` | Cards de métricas |
| `src/components/promocoes/PromotionsTable.tsx` | Tabela de promoções |
| `src/components/promocoes/PromotionDetailDrawer.tsx` | Drawer de detalhes |
| `src/components/promocoes/PromotionItemsTable.tsx` | Itens da promoção |

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/hooks/useAdsConnections.ts` | Adicionar auto-link com ml_accounts |
| `src/components/ads/AdsConnectionsPanel.tsx` | Mostrar conta ML vinculada |
| `src/components/layout/AppSidebar.tsx` | Adicionar item Promoções |
| `src/App.tsx` | Adicionar rota /promocoes |

### Fluxo do Auto-Link (Mercado ADS)

```text
useAdsConnections inicializa
    │
    ▼
fetchConnections()
    │
    ├─► Busca ads_connections do usuário
    │
    ▼
checkAutoLink() [NOVO]
    │
    ├─► Busca ml_accounts do usuário
    │
    ├─► Se ml_accounts existe E ads_connections não existe:
    │       └─► Cria ads_connection automaticamente
    │
    └─► Retorna conexão unificada
```

### Componentes da Central de Promoções

```text
Promocoes.tsx
├── PromotionsHeader
│   ├── Título "Central de Promoções"
│   └── Botão "Sincronizar"
│
├── PromotionsKpis
│   ├── Card: Promoções Ativas
│   ├── Card: Terminando em 48h
│   ├── Card: Itens Participando
│   └── Card: Itens Inelegíveis
│
├── PromotionsTable
│   ├── Filtros por status
│   ├── Colunas: Nome, Tipo, Status, Início, Fim, Itens
│   └── Ação: Expandir detalhes
│
└── PromotionDetailDrawer
    ├── Info da promoção
    ├── PromotionItemsTable
    │   ├── Item ID
    │   ├── Status do item
    │   ├── Preço original vs Promo
    │   └── Desconto aplicado
    └── Ações disponíveis
```

---

## Resultado Esperado

1. **Mercado ADS:** Ao acessar a aba Conexões, o sistema reconhece automaticamente a conta ML já conectada, sem exigir ação manual do usuário.

2. **Central de Promoções:** Novo módulo acessível diretamente pelo menu lateral, com visão completa das promoções ativas e gerenciamento de itens.

3. **Unificação:** O sistema passa a usar `ml_accounts` como fonte única de verdade para conexões, com `ads_connections` servindo apenas para configurações específicas do módulo ADS (intervalos de sync, preferências).
