
# Correção: Módulo de Custos parou de funcionar (404 nas Edge Functions)

## Causa Raiz

O mesmo padrão que aconteceu com as etiquetas de envio: as Edge Functions do módulo de custos **não estão deployadas** (retornam 404 NOT_FOUND).

Funções afetadas:
- `cost-engine` --> 404 (gerencia pedidos, catálogo, resumo, ABC)
- `costs-nightly-sync` --> 404 (sincronização automática noturna)

O código das funções existe no projeto e já usa `npm:@supabase/supabase-js@2` corretamente. Elas apenas precisam ser redeployadas.

## Impacto Atual

Sem essas funções, o módulo de custos inteiro fica inoperante:
- Aba "Pedidos" --> "Erro ao carregar pedidos"
- Aba "Resumo" --> sem dados
- Aba "Catálogo" --> sem dados
- Aba "ABC por Lucro" --> sem dados
- Sincronização noturna --> não executa

## Correção

**Ação única: Redeploy das 2 Edge Functions**

- `cost-engine` - API principal do módulo de custos
- `costs-nightly-sync` - automação noturna de sincronização

Nenhum arquivo será editado. Nenhuma tabela ou RLS será alterada. Nenhum outro módulo será impactado.

## Resultado Esperado

Após o deploy:
1. Todas as abas do módulo de custos voltam a funcionar normalmente
2. Sincronização noturna retoma execução automática
3. Etiquetas de envio, dashboard, perguntas e demais módulos permanecem inalterados
