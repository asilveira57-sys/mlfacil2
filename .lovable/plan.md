# Stats públicos (últimos 30 dias) na Landing Page

Exibir prova social com métricas reais e atualizadas dos últimos 30 dias, posicionadas na landing page principal (`/`) como argumento de confiança para novos usuários.

## Métricas exibidas (4 cards)

1. **Valor Total Transacionado** — `R$ 32.011.331,00` (com vírgula + 2 casas)
2. **Pedidos Processados** — `165.654`
3. **Ticket Médio** — `valor / pedidos`, formato `R$ X,XX`
4. **Pedidos por Dia** — `pedidos / 30`, inteiro com separador

Todas baseadas em **janela móvel de 30 dias** (não mês calendário).

## Onde aparece

Nova seção `LandingStats` inserida em `src/pages/Index.tsx` entre `LandingHero` e `LandingBenefits`. Título tipo "Movimentado pelos sellers da plataforma — últimos 30 dias".

## Backend

### Nova tabela `public.landing_public_stats` (singleton)
Campos: `total_valor_30d numeric`, `total_pedidos_30d bigint`, `ticket_medio_30d numeric`, `pedidos_por_dia_30d numeric`, `period_start timestamptz`, `period_end timestamptz`, `updated_at timestamptz`.

- GRANT SELECT para `anon` e `authenticated` (dado público para landing).
- RLS habilitado com policy `SELECT USING (true)`.

### Nova edge function `landing-stats-refresh`
Agrega de `meli_orders_cache` onde `order_status='paid'` e `created_at_meli >= now() - interval '30 days'`:
- `sum(total_amount)`, `count(*)`.
- Calcula ticket médio e pedidos/dia.
- Upsert no singleton + log em `system_logs`.

### Cron
1 execução diária às **06:35 BRT** (`35 9 * * *` UTC), logo após o `global-metrics-daily-refresh` das 06:30. Custo desprezível.

## Frontend

### Novo componente `src/components/landing/LandingStats.tsx`
- Fetch público via `supabase.from('landing_public_stats').select('*').single()`.
- Sem autenticação necessária (RLS público).
- Skeleton enquanto carrega; se erro/vazio, seção não renderiza (fail-safe — não quebra a landing).
- Formatação:
  - Valor / Ticket: `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)`
  - Pedidos / por dia: `toLocaleString('pt-BR')` (inteiro)
- Visual alinhado ao print: cards com ícone colorido + label + número grande em negrito, usando tokens semânticos (`bg-card`, `text-foreground`, `text-primary`, etc.). 4 colunas em desktop, 2 em mobile.
- Texto pequeno "Atualizado em DD/MM" usando `updated_at`.

### i18n
Adicionar chaves em `src/locales/{pt-BR,en,es}/landing.json` (`stats.title`, `stats.subtitle`, `stats.transacted`, `stats.orders`, `stats.avg_ticket`, `stats.orders_per_day`, `stats.updated_at`).

## Passos de implementação

1. Migration: criar tabela + GRANTs + RLS + policy + agendar cron (após função existir).
2. Edge function `landing-stats-refresh` + entrada em `supabase/config.toml` com `verify_jwt = false` (chamada pública e por cron).
3. Disparo inicial via `net.http_post` na migration para popular dados imediatamente.
4. Componente `LandingStats` + chaves i18n.
5. Inserir `<LandingStats />` em `src/pages/Index.tsx`.
6. QA: validar formatação `R$ 32.011.331,00` e responsividade no viewport mobile.

## Pontos a confirmar

- **Escopo dos dados**: agregar **todos os sellers** da plataforma (números globais) — confirmado pelo print que mostra 165k pedidos e R$ 32M, valores compatíveis com o agregado global atual. OK?
- **Posicionamento**: logo abaixo do Hero faz mais sentido para impacto. Alternativa: antes do Pricing como reforço final. Preferência?
