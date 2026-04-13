

## Atualização em massa de prazo de utilização — 95 clientes

### Contexto
A planilha contém 95 clientes com nome, email e dias de acesso restantes. O cliente **Nova Vida** (overlordcomerciobrasil@gmail.com) **não está na lista** e já tem `payment_status: active` — não será afetado.

### O que será feito

Usar a Edge Function `import-users` já existente para processar os 95 clientes em lote. Essa função já faz exatamente o necessário:

- Para **usuários que já existem** no sistema: atualiza `trial_status = active`, `trial_start_at = agora`, `trial_end_at = agora + dias`, e marca tag como `VETERANO`
- Para **usuários que não existem**: cria o usuário no auth (sem senha, email confirmado), cria profile e user_access_state com o trial customizado

### Execução

1. **Extrair os dados da planilha** para JSON (95 registros com `nome`, `email`, `dias`)
2. **Chamar a Edge Function `import-users`** via `supabase.functions.invoke` com o array de usuários
3. **Verificar o resultado** — a função retorna contagem de criados, atualizados e erros, além de gravar logs em `user_import_logs`

### Observações
- Clientes com poucos dias (1-2 dias) terão trial expirando em breve — isso reflete os dados da planilha
- Nenhuma alteração de código é necessária — a função `import-users` já suporta esse fluxo
- Os logs ficam registrados em `user_import_logs` com batch_id para rastreabilidade

### Resumo
| Ação | Detalhes |
|---|---|
| Clientes processados | 95 |
| Nova Vida | Excluído (não está na planilha, já ativo) |
| Método | Edge Function `import-users` existente |
| Alterações de código | Nenhuma |

