## Diagnóstico crítico

O erro principal é de modelo, não só do Wilson:

- A tela **Admin > Clientes** hoje é centrada em `auth.users`; por isso o Wilson aparece como um “cliente” separado.
- O correto é a tela ser centrada em **empresa/conta principal**: Todovino deve ser uma linha principal, e Wilson deve aparecer como colaborador agregado à Todovino.
- O Wilson já tem vínculo ativo com a empresa/workspace da Todovino, mas o app ainda aceita a conta pessoal `WILSONLONGO16` como conta ativa porque o contexto persistido/localStorage e a seleção inicial ainda priorizam conta pessoal quando ela existe.
- A função de contas acessíveis já foi parcialmente criada, mas falta fechar a regra de produto: colaborador não escolhe conta própria dentro da empresa convidante; ele herda a conexão ML titular da empresa.
- O fluxo de convite/aceite precisa garantir que qualquer colaborador novo ou existente seja vinculado à empresa, workspace, perfil e conta ML principal no mesmo momento em que o acesso é ativado.

## Regra final que vou implementar

```text
Cliente principal / empresa
└── Conta ML titular conectada
    └── Colaboradores
        ├── usam a mesma conexão ML da empresa
        ├── não aparecem como clientes separados
        ├── não precisam conectar ML próprio
        └── têm acesso limitado pelo perfil configurado
```

Para o caso específico:

```text
TODOVINO / TODOVINOBR
└── Wilson Longo / wilson.longo@interfood.com.br
    ├── colaborador ativo
    ├── conta ML ativa: TODOVINOBR
    └── perfil: Operacional
```

## Plano de correção

### 1. Trocar a listagem admin de usuário para empresa principal

Vou alterar a fonte da tela **Admin > Clientes** para retornar apenas clientes principais/empresas titulares.

A linha da Todovino passará a trazer:

- dados do titular da conta;
- empresa principal;
- contas Mercado Livre da empresa;
- colaboradores agregados;
- status do trial/plano da conta principal;
- último acesso da empresa, considerando titular e colaboradores.

Wilson deixará de aparecer como “cliente” separado quando a busca for por Todovino/Interfood/Wilson. Ele aparecerá dentro da Todovino como colaborador.

### 2. Exibir colaboradores dentro da conta principal

Na tela **Admin > Clientes**, vou adicionar uma área de colaboradores por cliente:

- contador de colaboradores na linha principal;
- expansão da linha mostrando colaboradores;
- nome, e-mail, status, perfil e último acesso;
- indicação da conta ML herdada, por exemplo `TODOVINOBR`;
- busca global encontrando a Todovino também quando pesquisar por `wilson.longo@interfood.com.br`.

### 3. Criar gerenciamento global de colaboradores no Admin

Dentro da linha/detalhe da empresa principal, o admin poderá:

- inserir colaborador;
- editar nome/e-mail/perfil;
- reenviar convite;
- desativar/reativar;
- excluir/remover vínculo;
- ver a conta ML principal que o colaborador herdará.

Isso vai reaproveitar a lógica já existente em **Configurações > Colaboradores**, mas com escopo administrativo e agrupado por empresa.

### 4. Corrigir seleção da conta ativa no login do colaborador

Vou ajustar o contexto de conta ativa para esta prioridade:

1. Se o usuário é colaborador ativo de uma empresa, usar obrigatoriamente a conta ML principal dessa empresa.
2. Ignorar `localStorage.active_account_id` e `user_context.active_marketplace_account_id` quando apontarem para conta pessoal fora da empresa ativa.
3. Persistir novamente `active_company_id`, `active_workspace_id` e `active_marketplace_account_id` corretos.
4. Esconder/bloquear troca para conta pessoal enquanto o usuário estiver no workspace da empresa convidante.

Isso resolve o Wilson continuar vendo `WILSONLONGO16` mesmo já estando vinculado à Todovino.

### 5. Fechar a regra de herança no backend

Vou reforçar a função segura de contas acessíveis para retornar, para colaborador:

- a conta ML titular da empresa ativa;
- metadados seguros da conta;
- sem tokens no navegador;
- marcação clara de conta herdada.

Também vou criar/ajustar uma função de reparo de contexto para ser usada no login e no aceite de convite.

### 6. Corrigir convite/aceite de colaborador

No fluxo de convite:

- se o e-mail já existe, ele não vira cliente novo;
- ele é agregado à empresa convidante;
- `company_users`, `workspace_members`, `collaborators`, `user_context` e `user_preferences` ficam sincronizados;
- o perfil de colaboração é aplicado na empresa correta;
- a conta ML ativa passa a ser a conta titular da empresa.

### 7. Corrigir Wilson imediatamente

Depois da estrutura, vou aplicar o reparo de dados:

- Wilson continua existindo como usuário autenticado;
- Wilson deixa de ser tratado como cliente principal na listagem admin;
- contexto ativo dele passa a apontar para a Todovino;
- conta ML ativa dele passa a ser `TODOVINOBR`;
- a conta pessoal `WILSONLONGO16` não será apagada, mas não será usada no contexto da Todovino.

### 8. Validação

Vou validar com consultas e comportamento esperado:

- pesquisar `Todovino` mostra Todovino com Wilson como colaborador;
- pesquisar `wilson.longo@interfood.com.br` encontra a Todovino, não uma linha solta do Wilson;
- Wilson herda `TODOVINOBR` ao logar;
- Wilson não é solicitado a conectar Mercado Livre;
- Wilson continua limitado pelo perfil Operacional;
- desativar/excluir colaborador remove o acesso à conta ML herdada;
- titulares continuam vendo e gerenciando suas próprias conexões normalmente.

## Arquivos/funções que serão alterados

### Backend Lovable Cloud

- `admin_get_clients_overview`: virar visão agrupada por cliente principal/empresa, com colaboradores agregados.
- `get_accessible_ml_accounts`: reforçar herança por empresa ativa.
- Nova função de reparo/sincronização de contexto de colaborador.
- Políticas/funções de autorização para garantir que colaborador acesse só o que o perfil permite.

### Frontend

- `src/hooks/useAdminClients.ts`: novo formato com colaboradores agregados.
- `src/pages/admin/AdminClientes.tsx`: exibir e gerenciar colaboradores dentro da empresa principal.
- `src/contexts/ActiveAccountContext.tsx`: colaborador prioriza conta ML da empresa, nunca a pessoal.
- `src/components/layout/AccountSwitcher.tsx`: indicar conta herdada e bloquear troca indevida.
- `src/hooks/useCollaborators.ts`: garantir criação/edição/desativação/exclusão com vínculo de empresa correto.
- `supabase/functions/collaborator-invite/index.ts`: convite/aceite sincroniza contexto e vínculo com a empresa principal.

## Resultado esperado

A Todovino passa a ser o cliente principal. Wilson passa a aparecer e funcionar como colaborador da Todovino, usando `TODOVINOBR` com as permissões do perfil dele, sem virar cliente separado e sem exigir conexão própria de Mercado Livre.