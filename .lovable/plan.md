

## Plano: Unificar Sessões dentro de Segurança

### O que muda

1. **Remover a aba "Sessões"** do `SettingsLayout.tsx` (linha 36) — libera espaço no menu de tabs.

2. **Adicionar seção "Sessões Ativas" dentro de `SettingsSecurity.tsx`** — novo card entre Alertas e Atividade Recente com:
   - Lista de sessões ativas do usuário (dispositivo, navegador, IP, última atividade)
   - Indicador de "sessão atual"
   - Botão **"Desconectar todos os dispositivos"** que chama `supabase.auth.signOut({ scope: 'others' })` para encerrar todas as outras sessões

3. **Novo hook `useActiveSessions`** em `useSecurity.ts`:
   - Consulta `security_events` filtrando eventos de `login` recentes para montar a lista de dispositivos conhecidos
   - Mutation `signOutAllDevices` que faz sign out das outras sessões + registra evento `all_sessions_revoked` no log

### Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `src/components/settings/SettingsLayout.tsx` | Remover linha do tab "sessoes-ativas" |
| `src/components/settings/SettingsSecurity.tsx` | Adicionar `ActiveSessionsSection` com lista de dispositivos e botão de desconectar todos |
| `src/hooks/useSecurity.ts` | Adicionar hook `useActiveSessions` + mutation `useSignOutOtherSessions` |

### UI do novo card "Sessões Ativas"

```text
┌─────────────────────────────────────────┐
│ 🖥  Sessões Ativas                      │
│ Dispositivos conectados à sua conta     │
├─────────────────────────────────────────┤
│ 🖥 Chrome · Windows  ← Sessão atual    │
│    há 2 minutos · 189.68.x.x           │
│                                         │
│ 📱 Safari · iPhone                      │
│    há 3 horas · 189.68.x.x             │
├─────────────────────────────────────────┤
│ [🔴 Desconectar todos os dispositivos]  │
└─────────────────────────────────────────┘
```

O botão "Desconectar todos os dispositivos" pede confirmação via AlertDialog antes de executar.

