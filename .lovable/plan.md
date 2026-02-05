
Contexto e diagnóstico (por que está acontecendo)
- Hoje existem dois “sistemas” diferentes de conta selecionada:
  1) Seletor global no topo (AccountSwitcher) que atualiza o ActiveAccountContext (e persiste em user_context/localStorage como active_account_id / active_seller_id).
  2) O módulo de Pós‑Venda (PostSaleConversationsTab) usa um seletor próprio baseado em useMlAccounts + localStorage (“post-sale-selected-account”).
- O useMlAccounts atualmente filtra ml_accounts por is_active = true. Isso faz o Pós‑Venda enxergar apenas a(s) conta(s) marcadas como “ativas” no banco (is_active), que nem sempre corresponde à conta selecionada no seletor global.
- Resultado prático: você troca a conta no seletor do topo, mas o módulo de mensagens continua usando outro seller_id (da conta “is_active” ou de um valor persistido antigo), e por isso a sincronização e as queries retornam zero conversas.

Objetivo da correção
- Garantir que “a conta selecionada” seja única e consistente em toda a aplicação.
- Todos os módulos devem derivar seller_id a partir do ActiveAccountContext (conta ativa do topo), ou de um parâmetro explícito “account_id” quando fizer sentido.
- Evitar qualquer dependência de is_active como “conta selecionada” (usar is_active apenas como “habilitada/conectada”, ou parar de usá-la como filtro para seleção).

Escopo (o que será ajustado)
A) Frontend (UI + hooks)
1) Pós‑Venda deve obedecer o seletor global
- Refatorar PostSaleConversationsTab para usar useActiveAccount() como fonte de verdade:
  - sellerId = activeAccount?.sellerId
  - lista de contas = accounts do contexto
  - (opcional) se mantiver dropdown local, ele deve chamar setActiveAccount(account.id) do contexto (não localStorage próprio).
- Remover/aposentar o localStorage “post-sale-selected-account” (ou no mínimo namespacear por usuário). Ideal: remover para não haver conflito com o seletor global.

2) Padronizar “listagem de contas” no app
- Ajustar useMlAccounts para não filtrar por is_active = true (isso está causando inconsistência em módulos que dependem dele).
  - Se houver telas que realmente precisam “somente contas conectadas”, o filtro deve ser por connection_status em ('connected','attention') e nunca por “is_active” como seleção.
- Onde for possível, preferir useActiveAccount() (accounts) em vez de useMlAccounts().

3) Evitar dados “presos” por cache quando troca a conta
- Ao trocar a conta no topo, invalidar queries sensíveis à conta (React Query) para forçar recarga:
  - Invalidate/clear para chaves relacionadas a sellerId (ex.: post-sale-*, ads_*, custos_*, etc.).
  - Alternativa simples: queryClient.clear() no evento active_account_changed (pelo menos para módulos críticos como Mensagens).
- Critério: ao alternar conta, não pode continuar exibindo “0 conversas” por cache de outra conta.

4) Instrumentação mínima para evitar regressão
- Exibir no Pós‑Venda (em modo DEV ou discretamente no UI) qual seller_id está sendo usado para sincronizar.
- Toast de “Sincronização concluída” deve incluir o seller_id/conta (ex.: “Conta: ADECONE… (seller 6604…)”).

B) Backend (funções de backend / integração Mercado Livre)
Problema atual recorrente
- Diversas funções consultam ml_accounts com filtro .eq("is_active", true). Isso pode:
  - Selecionar/validar errado (se is_active estiver inconsistente),
  - Impedir achar token (ou achar token da conta errada em implementações futuras),
  - E principalmente, desacoplar da “conta ativa” que o usuário escolheu no topo.

Correção proposta (padrão único para buscar credenciais)
1) Padronizar busca de credenciais por “account_id” quando possível
- Atualizar chamadas do frontend para enviar account_id (UUID de ml_accounts) para as funções de backend, em vez de apenas seller_id.
- No backend:
  - Validar que account_id pertence ao user.id do JWT.
  - Derivar seller_id real a partir do registro (ml_accounts.ml_user_id).
  - Usar o access_token/refresh_token desse registro.

2) Backward compatibility (para não quebrar chamadas existentes)
- Enquanto migra tudo, aceitar também seller_id:
  - Buscar por (user_id = auth user) + (ml_user_id = seller_id) + connection_status em ('connected','attention').
  - Não usar is_active como filtro de seleção.

3) Aplicar o padrão em todas as funções que usam ML token
- Atualizar, no mínimo:
  - ml-sync-messages
  - ml-send-message
  - ml-sync-questions, ml-answer-question, ml-sync-billing-details, ml-sync-real-costs
  - ml-worker-process (quando precisar token para processar eventos)
- Substituir filtros de is_active por:
  - user_id (quando houver JWT do usuário) e/ou
  - connection_status (connected/attention) e token não-nulo

4) Corrigir inconsistência de refresh de token (robustez)
- Hoje há risco de payload divergente entre funções (ex.: refresh que espera accountId).
- Padronizar ml-token-refresh para aceitar:
  - accountId (preferencial) e/ou seller_id (fallback),
  - sempre validando ownership (user_id) quando a chamada vem do usuário.

C) Banco de dados (opcional, para travar consistência)
1) Não depender de is_active como “conta selecionada”
- Manter a seleção oficial no user_context.active_marketplace_account_id (já existe e é o lugar correto).
- Se ainda existir dependência de is_active em algum lugar:
  - Migrar para usar user_context ou account_id no request.
  - (Opcional) criar índices auxiliares em colunas muito consultadas (ex.: ml_accounts(user_id, ml_user_id), post_sale_conversations(user_id, seller_id)) — alguns já existem.

2) Higienização (se necessário)
- Rodar uma correção única nos dados para alinhar is_active e connection_status:
  - is_active = false quando connection_status in ('disconnected','revoked') ou tokens nulos
  - is_active = true quando connection_status in ('connected','attention')
- Importante: isso é para “habilitada/conectada”, não para “selecionada”.

Sequência de execução (passo a passo)
1) Ajustar Pós‑Venda para obedecer ActiveAccountContext
- Refatorar PostSaleConversationsTab:
  - remover useMlAccounts + STORAGE_KEY local
  - usar activeAccount/accounts do contexto
  - chamar setActiveAccount quando usuário trocar conta dentro do módulo (se mantiver dropdown)
- Garantir que usePostSaleConversations/useSyncPostSaleMessages recebam sellerId do contexto.

2) Ajustar useMlAccounts e pontos de uso
- Remover filtro is_active = true (ou criar parâmetro explícito para filtrar “conectadas” por connection_status).
- Revisar usos encontrados (ex.: Products) para não quebrar seleção.

3) Atualizar funções de backend para não usar is_active como seleção
- Implementar “account_id primeiro” + fallback seller_id.
- Aplicar nas funções listadas no escopo.

4) Cache e troca de conta
- Ao trocar conta (evento active_account_changed), invalidar/limpar caches relevantes para evitar “0 conversas” persistindo.

5) Validação end-to-end
- Cenário A: selecionar conta no topo → abrir /mensagens → sincronizar → conversas aparecem para aquela conta.
- Cenário B: trocar conta no topo → sincronizar → resultados mudam conforme a conta.
- Cenário C: responder mensagem em conversa existente → confirmar envio e retorno no histórico.
- Cenário D: se token pertence a outra conta, exibir erro explícito (ex.: SELLER_TOKEN_MISMATCH) em vez de retornar “0”.

Critérios de aceite (o que precisa ficar OK)
- A conta exibida no seletor do topo é sempre a conta usada para:
  - listar conversas
  - sincronizar histórico
  - enviar resposta
- Trocar a conta altera imediatamente os dados do módulo (sem precisar hard refresh).
- Não existe mais módulo usando um localStorage próprio que conflite com a conta ativa global.
- Funções de backend não selecionam credenciais por is_active; selecionam por account_id (preferencial) ou por (user_id + seller_id) com connection_status válido.

Riscos e mitigação
- Risco: Alterar useMlAccounts pode impactar telas que esperavam apenas “ativas”.
  - Mitigação: adicionar opção no hook (ex.: useMlAccounts({ onlyConnected: true })) ou criar hook separado, e atualizar chamadas conscientemente.
- Risco: caches antigos mascararem o resultado após a troca.
  - Mitigação: invalidar/clear no evento de troca de conta e mostrar seller_id usado no toast/rodapé do módulo durante alguns dias.

Nota sobre limites/restrições da API (para sua dor principal)
- Quando seller_id/token não batem, a API pode devolver “0 resultados” sem erro claro em alguns endpoints. Por isso o sanity check (/users/me) + seleção correta de credenciais é essencial.
- Após a unificação acima, o módulo deixa de “buscar na conta errada” e você deve passar a ver o histórico corretamente (desde que existam pedidos/mensagens na conta selecionada).

Entrega
- Assim que este plano for aprovado, eu implemento as mudanças em frontend + funções de backend na ordem acima e valido o fluxo completo em /mensagens.
