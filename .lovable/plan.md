
## Plano de ação (urgente): corrigir “sem plano ativo” + histórico financeiro + liberar conta teste

### Diagnóstico confirmado
1. **Erro geral no cálculo de acesso**: a RPC de status do usuário está quebrando para parte dos usuários por comparação inválida entre tipos (`uuid` vs `text`) dentro de `get_user_feature_flags`.  
   - Efeito: o frontend recebe falha no status e passa a mostrar estados errados (ex.: “nenhum plano ativo”, ativação presa em 80%).
2. **Inconsistência de elegibilidade financeira**: existe usuário com direito ativo em `tenant_entitlements`, mas a verificação de acesso de API usa outra fonte e pode continuar bloqueando.
3. **Histórico de faturamento incompleto no app**: na área de Configurações/Faturamento ainda predomina tela de dados fiscais, sem timeline consolidada de pedido/pagamento/aprovação/nota.

---

### Implementação proposta

#### Etapa 1 — Hotfix crítico do status de acesso (prioridade máxima)
- Criar migração para corrigir `get_user_feature_flags`:
  - remover comparação inválida de tipos (`tenant_id = p_user_id::text`);
  - manter checagem por vínculo real de tenant;
  - garantir fallback sem exceção.
- Ajustar também a verificação de acesso financeiro para considerar entitlement ativo como fonte válida.
- Objetivo: eliminar imediatamente o falso “sem plano ativo” e normalizar flags no frontend.

#### Etapa 2 — Reconciliar estados já afetados
- Adicionar backfill em migração para atualizar `user_access_state` de usuários que já têm entitlement ativo, mas ainda estão com estado antigo/bloqueado.
- Resultado esperado: correção retroativa sem depender de novo webhook.

#### Etapa 3 — Liberar a conta principal de teste (1000 dias)
- Inserir entitlement manual de longa duração (1000 dias) para o tenant da conta principal logada (Deconex VV), com status `active` e trilha de auditoria.
- Sincronizar `user_access_state` correspondente para refletir acesso liberado imediatamente.
- Sem alterar regra de rotina/batch; apenas acesso da conta teste.

#### Etapa 4 — Corrigir “Ativação do Sistema” presa em 80%
- Ajustar exibição do `ActivationSpeedometer` para não usar flag quebrada em caso de estado inconsistente temporário.
- Após hotfix de status, validar que “Ativar módulos” conclui corretamente para usuário com onboarding completo.

#### Etapa 5 — Criar menu/área de Histórico financeiro no Faturamento
- Em `Configurações > Faturamento`, incluir subtabs:
  1) **Dados fiscais** (já existente)  
  2) **Histórico de pedidos e pagamentos**  
  3) **Notas fiscais de serviço**
- Popular histórico com dados reais (pedido, método, valor, status, data de aprovação, referência de pagamento, período de cobertura do plano).

#### Etapa 6 — Nota fiscal de serviço (download)
- No bloco “Notas fiscais de serviço”, listar documentos disponíveis e botão de download.
- Quando não houver documento, mostrar estado vazio claro e instrução de próximos passos.
- Preparar estrutura para anexação futura da NFS-e no mesmo fluxo.

#### Etapa 7 — Validação ponta a ponta
- Validar com 2 perfis:
  1) usuário com pagamento aprovado/entitlement ativo;
  2) conta principal teste com entitlement manual de 1000 dias.
- Confirmar:
  - não aparece falso “sem plano ativo”;
  - dashboard carrega sem bloqueio indevido;
  - ativação não fica travada em 80%;
  - histórico de pagamentos e notas aparece no Faturamento.

---

## Arquivos-alvo (previstos)
- **Migração SQL nova** (correção de funções + backfill + concessão teste 1000 dias)
- `src/components/dashboard/ActivationSpeedometer.tsx`
- `src/components/settings/SettingsBilling.tsx`
- `src/components/settings/SettingsPlan.tsx` (se necessário para unificar histórico)
- `src/hooks` (novo hook de histórico financeiro, ex.: `useBillingHistory.ts`)

---

## Detalhes técnicos (resumo)
- Corrigir função de flags para evitar erro de tipo e garantir cálculo resiliente de `has_active_subscription/requires_payment`.
- Reconciliar cache de acesso (`user_access_state`) com direitos ativos já existentes.
- Implementar concessão manual controlada de entitlement para conta teste (1000 dias), auditável.
- Expor no frontend um histórico financeiro completo e navegável, separado da configuração fiscal.
- Não mexer na rotina/batch de sincronização para evitar sobrecarga; apenas destravar estado e visibilidade de dados.
