
# Plano Mestre — Jornada Completa do Seller

## Status de cada item

### ✅ Já existe no sistema
| # | Item | Status |
|---|------|--------|
| 2 | Cadastro (email/senha + confirmação) | ✅ Implementado |
| 4 | Painel inicial (dashboard) | ✅ Existe (sem velocímetro) |
| 5 | Conexão ML via OAuth | ✅ Implementado |
| 6 | Elegibilidade para teste (>10 vendas) | ✅ Verificação existe na company |
| 8 | Módulo Etiquetas (vendas abertas) | ✅ Implementado |
| 9 | Módulo Custos (sem Passo 2) | ✅ Atualizado agora |
| 13 | Seleção automática de plano | ✅ `useUserSalesVolume` + filtro de planos |
| 15 | Cadastro fiscal (PF/PJ) | ✅ `company_billing` existe |
| 12 | Bloqueio pós-trial | ✅ Parcial (trial_expired bloqueia) |

### 🔶 Existe parcialmente / precisa ajuste
| # | Item | O que falta |
|---|------|-------------|
| 1 | Landing com 3 botões | Landing existe mas precisa revisar CTAs |
| 3 | Tela de boas-vindas (primeiro acesso) | Onboarding existe mas pode não ter welcome screen |
| 7 | Sincronização inicial automática (30d) | Import manual existe, falta auto-trigger pós-OAuth |
| 10 | Módulo ADS (sync pós-pagamento) | ADS existe, falta gate de trial |
| 11 | Linha do Tempo (30d trial vs 1yr pago) | Módulo existe, falta limitar por trial |
| 14 | Dados fiscais obrigatórios pós-pagamento | Tela existe, falta gate de bloqueio |

### 🔴 Precisa ser desenvolvido
| # | Item | Descrição |
|---|------|-----------|
| 4b | Velocímetro de ativação | Widget de progresso no dashboard |
| 9b | Tabela `sync_jobs` + lock após sucesso | Controle de execução de syncs |
| 9c | Lock do botão 1 ano após sucesso | Bloquear re-execução pós-sucesso |
| 16 | Multi-conta (soma de vendas) | Lógica de soma cross-account |
| 17-18 | Estados de conta + aviso pré-conexão | Workflow de nova conta |
| 19 | Verificação de limite + pending_upgrade | Gate automático |
| 20 | Upgrade com pró-rata | Cálculo proporcional |
| 21 | Crescimento natural → bloqueio | Detecção automática de excesso |
| 22 | Proteção contra abuso (logs) | Audit trail de conexões/upgrades |

## Ordem sugerida de implementação

### Fase 1 — Gates e bloqueios (impacto imediato)
1. Velocímetro de ativação no dashboard
2. Tabela `sync_jobs` + controle de locks
3. Gate de dados fiscais pós-pagamento
4. Auto-sync 30d após OAuth

### Fase 2 — Trial gates nos módulos ✅
5. ✅ ADS: banner de trial + sync bloqueado via ML API gate no backend
6. ✅ Linha do Tempo: banner de trial informando limitação a 30d
7. ✅ Etiquetas: filtro "Todos" agora capped a 30 dias

### Fase 3 — Multi-conta e upgrade ✅
8. ✅ Multi-conta: soma de vendas (get_tenant_total_sales + check_tenant_plan_limit)
9. ✅ Estados de conta (account_state enum: active/pending_upgrade/disabled/error)
10. ✅ Upgrade com pró-rata (calculate_prorata_upgrade + execute_plan_upgrade)
11. ✅ Crescimento natural → bloqueio (PlanLimitBanner + useTenantLimits)
12. ✅ Aviso pré-conexão de nova conta (AccountConnectionWarning)
13. ✅ Audit log (tenant_limit_log)

### Fase 4 — Landing e onboarding ✅
14. ✅ Landing com 3 CTAs (Login, Cadastro, Planos) no header e hero
15. ✅ Welcome screen pós-confirmação de email (WelcomeScreen + aviso ML)
16. ✅ Proteção contra abuso (system_audit_log + tenant_limit_log)
