

## Botão "Corrigir Dados Geográficos" na Curva ABC Cidades

### Situação Atual
A Edge Function `ml-backfill-shipments` já existe e aceita chamadas autenticadas via `POST` com `{ seller_id }`. Ela busca shipments faltantes na API do ML, preenche cidade/estado/bairro e depois dispara `ml-enrich-neighborhoods` automaticamente (via ViaCEP). Porém, **não existe nenhum botão no frontend** para o seller disparar isso manualmente.

### Plano

**1. Adicionar botão "Corrigir endereços" no `AbcCitiesTab.tsx`**
- Posicionar no header, ao lado de "Ver Mapa" e "Exportar CSV"
- Ícone `RefreshCw` com texto "Corrigir endereços"
- Ao clicar, chama `supabase.functions.invoke('ml-backfill-shipments', { body: { seller_id } })`
- Mostra toast de confirmação ("Correção iniciada em segundo plano")
- Botão entra em estado loading por 3s, depois volta ao normal
- Se já existir um N/D nos dados carregados, destacar o botão com variant `default` (primary); senão, variant `outline`

**2. Detecção automática de N/D**
- Ao carregar os dados geográficos, verificar se existe algum item com nome "N/D" ou vazio
- Se existir, mostrar um banner informativo acima da tabela: "Existem X pedidos sem localização identificada. Clique em 'Corrigir endereços' para resolver automaticamente."
- O banner inclui o botão de correção inline

### Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `src/components/abc/AbcCitiesTab.tsx` | Botão no header + banner N/D + chamada à Edge Function |

