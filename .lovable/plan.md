

## Plano: Corrigir jornada do seller sem vendas

### Problemas identificados

1. **Dashboard mostra erro técnico (SystemError)** em vez de cards com R$0,00 — a edge function `ml-sales-data` chama `check_ml_api_access` que retorna 402/403 quando não há trial ativo ou subscription. O frontend trata qualquer erro da edge function como erro técnico, exibindo a tela vermelha.

2. **ActivationSpeedometer em 0%** — todos os steps dependem de `mlConnected` vindo de `useUserAccess()`, que é computado pela RPC do backend baseado na company do usuário. Para contas secundárias ou sem trial, esse flag pode ser `false` mesmo com OAuth válido. O componente deveria usar o estado real de conexão (`useMLConnectionState`).

### Alterações

**1. SalesDashboard.tsx — Tratar gate errors como "sem dados"**
- Quando a edge function retorna erro de gate (402/403 ou error_code como `TRIAL_EXPIRED`, `NO_TRIAL`, `NO_COMPANY`), em vez de mostrar `SystemError`, renderizar o dashboard completo com todos os cards em R$0,00 e gráficos vazios.
- Criar um objeto `emptySalesData` com métricas zeradas e usá-lo como fallback.
- Manter `SystemError` apenas para erros técnicos reais (500, network error, etc).

**2. ActivationSpeedometer.tsx — Usar estado real de conexão**
- Importar `useMLConnectionState` ou `useActiveAccount` para verificar se há conta conectada.
- Step "Conectar ML": marcar como concluído se `connectionState === 'CONNECTED'` OU se `activeAccount` existe (OAuth válido).
- Steps "Importar vendas/anúncios/Sincronizar custos": marcar como concluídos se a conta está conectada (independente de ter vendas — a importação acontece automaticamente na conexão).
- Step "Ativar módulos": manter lógica atual (`onboarding_completed`).
- Resultado: seller com conta conectada sem vendas verá 80% (4/5 steps) em vez de 0%.

**3. SalesDashboard.tsx — Mostrar cards R$0,00 para estado vazio**
- Remover o retorno antecipado do `SystemEmpty` que esconde os cards quando não há vendas.
- Em vez disso, renderizar o layout completo (cards + gráficos) com valores zero — exatamente como pedido pelo cliente.
- Adicionar uma mensagem sutil acima dos cards informando "Ainda não há vendas registradas".

### Arquivos a alterar
- `src/components/SalesDashboard.tsx`
- `src/components/dashboard/ActivationSpeedometer.tsx`

### Resultado esperado
- Seller sem vendas vê dashboard com cards R$0,00 (não erro vermelho)
- Speedometer mostra progresso real (80% com conta conectada)
- Nenhuma regressão para sellers com vendas

