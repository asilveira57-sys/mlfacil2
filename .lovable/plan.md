

## Plano Veterano — Criação Completa

### O que será feito
Criar o plano "Veterano" no banco de dados com 3 ofertas de preço, restrito exclusivamente a usuários com tag `VETERANO` no perfil. O plano não aparece no frontend público — só é visível e contratável dentro do sistema para sellers veteranos.

### 1. Migration — Novo tier + ofertas

Inserir na tabela `plan_tiers`:
- **code**: `veterano`
- **name**: `Veterano`
- **display_name**: `Plano Veterano`
- **plan_group**: `veterano` (grupo próprio para diferenciação)
- **min_orders_30d**: 0
- **max_orders_30d**: NULL (ilimitado)
- **is_active**: true
- **is_enterprise**: false
- **requires_marketplace_connection**: false
- **display_order**: 99 (fora da ordenação normal)

Inserir 3 registros na tabela `plan_offers` vinculados ao novo tier:

| Oferta | billing_mode | period_months | price_brl | offer_code | is_visible |
|---|---|---|---|---|---|
| Mensal | assinatura | 1 | 4490 | veterano-mensal | false |
| Trimestral | assinatura | 3 | 12000 | veterano-trimestral | false |
| Semestral | assinatura | 6 | 21600 | veterano-semestral | false |

Todas com `is_visible = false` para não aparecer em listagens públicas.

### 2. Frontend — AdminClientes

Adicionar o novo tier à lista `PLAN_TIERS` em `src/pages/admin/AdminClientes.tsx` para que admins possam atribuir o plano a usuários.

### 3. Página de Planos (logado) — Exibição condicional

Em `src/pages/Planos.tsx`, adicionar lógica para:
- Buscar a tag do usuário no perfil (`profiles.tag`)
- Se tag === `VETERANO`, exibir o Plano Veterano com suas ofertas
- Se não for veterano, o plano não aparece

### 4. Sem alteração no frontend público

O plano não será adicionado a nenhuma listagem pública (landing page, catálogo de planos público). As ofertas ficam com `is_visible = false`.

### Resumo de arquivos alterados
- **Migration SQL**: criar tier + 3 ofertas
- `src/pages/admin/AdminClientes.tsx`: adicionar tier à lista
- `src/pages/Planos.tsx`: exibir plano condicionalmente para veteranos

