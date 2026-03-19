
Objetivo: garantir que o botão de desconectar sessões apareça e funcione de forma confiável em **Configurações > Segurança**.

1) Diagnóstico do problema atual
- O botão some porque a UI só mostra ações quando há `outras sessões` e hoje a lista é deduplicada por `user_agent` (se dois acessos usam mesmo navegador/SO, vira 1 card).
- A remoção de sessões no banco falha por falta de política de DELETE em `security_events`.
- O hook de desconexão não valida todos os erros retornados, então pode “parecer sucesso” sem limpar a sessão visualmente.

2) Ajustes no backend (política de acesso)
- Criar migração para adicionar política RLS de DELETE em `public.security_events` para o usuário apagar apenas os próprios eventos.

3) Ajustes de lógica (hooks)
- Em `useActiveSessions`:
  - Corrigir verificação de sessão atual para considerar também `user_agent` (está faltando no filtro).
  - Remover deduplicação por `user_agent` e manter sessões recentes como itens distintos.
  - Marcar apenas 1 item como “Sessão atual” (a mais recente do mesmo user agent).
- Em `useSignOutOtherSessions`:
  - Validar e lançar erro para todas as operações críticas (logout e deletes).
  - Garantir limpeza consistente dos registros de sessões após desconectar outros dispositivos.

4) Ajustes de UI (botões visíveis e claros)
- Em `SettingsSecurity.tsx`:
  - Manter ação para desconectar outros dispositivos.
  - Exibir ação de forma consistente (não “sumir” por bug de dedupe).
  - Ajustar feedback/loading/disabled states para não gerar dúvida de funcionamento.

Detalhes técnicos (arquivos)
- `supabase/migrations/<nova_migration>.sql` (policy DELETE em `security_events`)
- `src/hooks/useSecurity.ts` (lógica de listagem e desconexão)
- `src/components/settings/SettingsSecurity.tsx` (renderização dos botões/estados)

Critério de aceite
- Com múltiplas sessões, o botão de desconectar aparece.
- Ao clicar, sessões são realmente encerradas e desaparecem da lista após refresh automático.
- Com uma sessão, o estado da área de sessões permanece consistente (sem comportamento “sumido” por erro de dedupe).
