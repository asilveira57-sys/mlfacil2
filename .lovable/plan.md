
# Correcao Urgente: Pop-up de Boas-Vindas Reaparecendo

## Problema Identificado

A coluna `seller_id` na tabela `onboarding_user_progress` esta definida como tipo `uuid`, mas o valor passado pelo sistema e o ID numerico do Mercado Livre (ex: "123456789"), que nao e um UUID valido. Isso faz com que o `INSERT` falhe silenciosamente, nenhum progresso seja salvo, e o modal reapareça a cada carregamento de pagina.

Confirmacao: a tabela `onboarding_user_progress` tem **zero registros** no banco.

## Solucao

### 1. Alterar o tipo da coluna `seller_id` de `uuid` para `text`

Migracoes SQL necessarias:
- Remover a constraint UNIQUE existente
- Alterar a coluna `seller_id` de `uuid` para `text`
- Recriar a constraint UNIQUE

Isso permite que o seller ID do Mercado Livre (string numerica) seja armazenado corretamente.

### 2. Corrigir codigo morto no hook `useStartOnboardingProgress`

No arquivo `src/hooks/useWelcomeOnboarding.ts`, linhas 212-235 contem codigo que nunca executa porque esta apos um `return existing;` na linha 210. Esse codigo sera removido para limpeza.

### 3. Adicionar log de erro visivel no `startProgress`

Adicionar tratamento de erro no `onError` do `startProgress.mutate` para que falhas futuras sejam visiveis no console, facilitando depuracao.

## Detalhes Tecnicos

### Migracao SQL
```sql
ALTER TABLE onboarding_user_progress
  DROP CONSTRAINT onboarding_user_progress_company_id_seller_id_user_id_flow__key;

ALTER TABLE onboarding_user_progress
  ALTER COLUMN seller_id TYPE text USING seller_id::text;

ALTER TABLE onboarding_user_progress
  ADD CONSTRAINT onboarding_user_progress_company_id_seller_id_user_id_flow__key
  UNIQUE (company_id, seller_id, user_id, flow_id, flow_versao);
```

### Arquivo editado
- `src/hooks/useWelcomeOnboarding.ts` - remover codigo morto (linhas 212-235) e adicionar error handler

### Resultado esperado
- O pop-up de boas-vindas aparece **uma unica vez** para cada usuario
- Ao clicar "Concluir", o progresso e salvo no banco com status `completed`
- O modal nao reaparece apos recarregar a pagina
- O botao "Ir para Configuracoes" continua navegando para `/settings` (configuracoes do sistema)
