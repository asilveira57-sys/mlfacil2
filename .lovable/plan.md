

# Plano: Mover Perfis e Permissoes para Configuracoes do Seller

## Problema Atual

A tela de Perfis e Permissoes (`AdminAccessProfiles`) esta no modulo Admin (`/admin/perfis`), que e restrito a administradores da plataforma. O Seller (Owner/Admin da empresa) precisa gerenciar perfis e permissoes dos seus colaboradores em **Configuracoes** (`/settings`).

## O que muda

### 1. Nova aba "Perfis" em Configuracoes

Adicionar uma aba entre "Colaboradores" e "Personalizacao" chamada **"Perfis de Acesso"** no `/settings`, com icone `Shield`.

### 2. Novo componente: `SettingsAccessProfiles`

Criar `src/components/settings/SettingsAccessProfiles.tsx` -- uma versao do `AdminAccessProfiles` adaptada para o contexto do Seller:

- Filtra apenas perfis globais (base) + perfis customizados da empresa do usuario (`company_id = empresa atual`)
- Permite ao Owner **duplicar** um perfil base para criar perfil customizado da empresa
- Permite editar permissoes apenas em perfis customizados (perfis base globais sao somente leitura)
- Respeita hierarquia: Owner edita tudo, Admin nao edita perfis de nivel superior
- Exibe a matriz de permissoes (modulos x acoes) com checkboxes

### 3. Atualizar CollaboratorsCard para atribuir perfil

Atualizar o formulario de colaboradores (`CollaboratorFormModal`) para:

- Substituir o grid de modulos antigo (`CollaboratorModuleGrid` com `MODULE_CATALOG`) por um **dropdown de perfil de acesso** (Select com perfis disponiveis da empresa)
- Ao criar/editar colaborador, salvar o `profile_id` na tabela `company_users` (ou `collaborators`)
- Remover dependencia do `MODULE_CATALOG` legado

### 4. Hook `useAccessProfiles` -- versao Seller

Adaptar o hook para aceitar um `companyId` opcional:

- Quando `companyId` e passado, filtra perfis por `company_id IS NULL OR company_id = companyId`
- Adiciona funcao `duplicateProfile(baseProfileId)` que cria copia com `company_id` preenchido
- Adiciona funcao `renameProfile(profileId, newName)`

### 5. Manter `AdminAccessProfiles` no Admin

O Admin da plataforma continua tendo a visao global de todos os perfis base em `/admin/perfis` -- essa tela permanece para gestao dos templates globais.

## Detalhes Tecnicos

### Arquivos a criar

- `src/components/settings/SettingsAccessProfiles.tsx` -- Componente da aba de perfis no Settings

### Arquivos a modificar

- `src/pages/Settings.tsx` -- Adicionar aba "Perfis de Acesso"
- `src/hooks/useAccessProfiles.ts` -- Adicionar filtro por `companyId`, funcoes de duplicar/renomear
- `src/components/settings/collaborators/CollaboratorFormModal.tsx` -- Trocar grid de modulos por dropdown de perfil
- `src/components/settings/collaborators/CollaboratorsCard.tsx` -- Exibir nome do perfil na tabela em vez de "X modulos"
- `src/hooks/useCollaborators.ts` -- Incluir `profile_id` no create/update

### Fluxo do Seller

```text
Configuracoes
  |-- Perfil (dados pessoais)
  |-- Idioma
  |-- Colaboradores (lista + convite + atribuir perfil)
  |-- Perfis de Acesso (matriz de permissoes por perfil)
  |-- Personalizacao
  |-- ...demais abas
```

### Logica de permissoes na aba Perfis

- Perfis base globais (`is_system=true`): exibidos como referencia, somente leitura
- Botao "Duplicar" ao lado de cada perfil base: cria copia customizada para a empresa
- Perfis customizados (`company_id = empresa`): editaveis pelo Owner
- Owner (level 1): edita todos os perfis customizados
- Admin (level 2): edita apenas perfis de level >= 2

### Migracao do formulario de colaboradores

O formulario atual usa `MODULE_CATALOG` (lista estatica hardcoded). Sera substituido por:

1. Um `Select` com os perfis disponiveis (base + customizados da empresa)
2. Preview das permissoes do perfil selecionado (somente leitura, para o Owner ver o que cada perfil pode fazer)
3. O campo `profile_id` e salvo junto com o colaborador

