
Objetivo

Restabelecer acesso total e permanente aos dois e-mails informados (`asilveira57@gmail.com` e `etiquetacapixaba2@gmail.com`) em todo o sistema, inclusive em todos os submenus de `/admin`, sem bloqueio por plano, menu ou permissão operacional.

Diagnóstico confirmado

Há 2 problemas diferentes acontecendo ao mesmo tempo:

1. O bypass atual do guard de módulos está incompleto
- Em `ModuleAccessGuard.tsx`, o bypass só cobre a rota exata `/admin`.
- Subrotas como `/admin/canal-oficial` continuam passando pela checagem de plano/módulo.
- Resultado: o usuário entra no admin, mas ao abrir menus internos recebe “Acesso não disponível”, exatamente como no print.

2. O reconhecimento de admin está frágil para esses dois e-mails
- Existe uma migration antiga que tentou semear esses dois e-mails como admin.
- Mas ela rodou uma única vez: se a conta ainda não existia naquele momento, o `user_roles` não foi criado e nunca mais foi auto-reparado.
- Além disso, `useCollaboratorAccess` hoje só dá acesso total para `workspace_members.role = 'admin'`, ignorando o papel global vindo de `user_roles`.
- Resultado: mesmo sendo admin global, o usuário pode continuar sendo tratado como colaborador limitado em menus/checks internos.

Correção proposta

1. Corrigir o bypass de `/admin` inteiro
- Alterar `ModuleAccessGuard` para ignorar bloqueio por plano em toda a namespace admin:
  - `/admin`
  - `/admin/*`
- Além disso, se o usuário for admin global, o guard não deve aplicar bloqueio por módulo/plano em nenhuma rota.

2. Tornar esses dois e-mails “super admin” de forma canônica no backend
Criar uma correção de backend que:
- mantenha esses dois e-mails em whitelist administrativa
- normalize e compare por e-mail em lowercase/trim
- garanta/administre o papel `admin` no `user_roles`
- faça backfill para usuários já existentes

Isso evita depender de uma migration antiga que pode ter falhado porque o usuário ainda não existia no momento da execução.

3. Fazer auto-reparo permanente do papel admin
Ajustar a lógica de autorização para que, se o usuário autenticado tiver um dos dois e-mails permitidos:
- seja tratado como admin mesmo se o `user_roles` ainda estiver inconsistente
- e o sistema repare o `user_roles` automaticamente/backfill de forma segura

Assim o problema não volta após login novo, troca de conta ou inconsistência de dados.

4. Corrigir a camada de acesso de colaborador
Em `useCollaboratorAccess`:
- checar admin global antes de classificar o usuário como colaborador
- se for admin global, retornar acesso total (`__all__`) e nunca aplicar limitação de perfil/módulo

Isso elimina bloqueios internos em menus, seções e recursos administrativos.

Arquivos / áreas a alterar

- `src/components/access/ModuleAccessGuard.tsx`
- `src/hooks/useCollaboratorAccess.ts`
- nova migration SQL em `supabase/migrations/...`

Mudanças técnicas previstas

1. Migration SQL
- cadastrar os dois e-mails autorizados como fonte oficial de super admin
- fazer backfill do `user_roles` para os usuários já existentes
- endurecer a lógica de admin para não depender só do seed histórico

2. `ModuleAccessGuard.tsx`
- trocar bypass exato por bypass de prefixo para `/admin`
- pular checagem de plano/módulo para admin global

3. `useCollaboratorAccess.ts`
- incluir checagem de admin global via backend antes da lógica de colaborador/workspace
- se admin global, devolver acesso total imediatamente

Validação após implementação

1. Logar com `asilveira57@gmail.com`
- acessar `/admin`
- abrir `/admin/canal-oficial`
- abrir outros submenus do admin
- confirmar que não aparece mais “Acesso não disponível”

2. Repetir com `etiquetacapixaba2@gmail.com`

3. Confirmar também:
- menu admin aparece normalmente
- nenhuma tela do admin é filtrada por plano
- navegação interna entre abas do admin funciona sem bloqueio
- o acesso total vale para o sistema inteiro, não só para a rota principal do admin

Resultado esperado

Esses dois e-mails passam a ter acesso administrativo total, estável e permanente.
Nenhuma subrota de admin volta a ser bloqueada por plano/módulo, e o sistema deixa de depender de um seed antigo e frágil para reconhecer esses usuários como admin.
