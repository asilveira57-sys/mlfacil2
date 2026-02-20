

# Plano de Reorganizacao do Menu e Correcoes

## Resumo

Este plano aborda 6 solicitacoes de limpeza e reorganizacao do menu lateral e do painel Admin.

---

## 1. Admin: Eliminar submenu vertical, manter tudo na horizontal

**Problema**: O Admin tem muitos subitens no menu lateral (sidebar), gerando scroll excessivo e atrapalhando o trabalho.

**Solucao**:
- Desativar (`is_active = false`) todos os modulos filhos do Admin na tabela `system_modules` (admin.dashboard, admin.settings, admin.users, etc.)
- O item "Admin" raiz fica com `route = '/admin'` como link direto (sem expandir submenu)
- Todas as opcoes continuam acessiveis pelas tabs horizontais ja existentes em `Admin.tsx`
- Adicionar ao `Admin.tsx` as tabs que faltam (se houver alguma rota no banco que nao esteja nas tabs)

**Verificacao cruzada** - Tabs horizontais atuais vs modulos no banco:

| Modulo no banco | Tab horizontal | Status |
|---|---|---|
| Dashboard Admin (/admin) | Dashboard | OK |
| Configuracoes (/admin/configuracoes) | Configuracoes | OK |
| Perfis e Permissoes (/admin/perfis) | Perfis | OK |
| Colaboradores (/admin/colaboradores) | Nao existe | ADICIONAR |
| Auditoria e Logs (/admin/logs) | Nao existe | ADICIONAR |
| Usuarios (/admin/usuarios) | Usuarios | OK |
| Planos (/admin/planos) | Planos | OK |
| Pagamentos (/admin/pagamentos) | Pagamentos | OK |
| Blog (/admin/blog) | Blog | OK |
| SEO (/admin/seo) | SEO | OK |
| Menu Builder (/admin/menu-builder) | Menu | OK |
| Feature Flags (/admin/feature-flags) | Nao existe | REMOVER (ver item 2) |
| Tags (/admin/tags) | Tags | OK |
| Fila NFS-e (/admin/faturamento) | Fila NFS-e | OK |
| Tiny/Olist (/admin/erp) | Tiny/Olist | OK |

Serao adicionadas as tabs "Colaboradores" e "Auditoria" ao `Admin.tsx` com componentes placeholder.

---

## 2. Feature Flags: Explicacao e remocao

**O que sao**: Feature Flags sao "interruptores" que permitem ligar/desligar funcionalidades do sistema para usuarios ou grupos especificos sem precisar fazer deploy. Exemplo: ativar um modulo beta so para testadores.

**Situacao atual**: Existe um registro no banco (`admin.feature_flags` com rota `/admin/feature-flags`), mas nao existe nenhum componente ou rota registrada no `Admin.tsx` para renderizar essa pagina. Por isso, ao clicar, nada acontece.

**Acao**: Desativar o modulo no banco (`is_active = false`). Se no futuro voce quiser usar, basta reativar e criar a interface.

---

## 3. Retrospectiva: Mover para Admin

**Acao**:
- Desativar `marketplace.retrospectiva` no menu lateral (`is_active = false`)
- Adicionar tab "Retrospectiva" no `Admin.tsx` com rota `/admin/retrospectiva`
- Criar uma `Route` para `/admin/retrospectiva` apontando para o componente `Retrospectiva` existente
- A pagina continua funcionando, mas so acessivel pelo painel Admin

---

## 4. Marketplace: Separar Mercado Livre e Shopee

**Estrutura proposta no menu lateral**:

```text
Marketplace
  +-- Mercado Livre (expande submenu atual)
  |     +-- Vendas
  |     |     +-- Etiquetas de Envio
  |     +-- Anuncios
  |     +-- Crescimento
  |     +-- Inteligencia
  |     +-- Financeiro
  +-- Shopee [badge "Em breve"]
```

**Acao**:
- Criar modulo `marketplace.mercadolivre` (grupo intermediario, sem rota, com icone Store)
- Reparentar todos os grupos atuais (Vendas, Anuncios, Crescimento, etc.) como filhos de `marketplace.mercadolivre`
- Criar modulo `marketplace.shopee` com `status = 'coming_soon'` e sem rota

---

## 5. Pedidos e Etiquetas: Limpeza

**Problemas identificados**:
- "Pedidos" (`marketplace.sales.orders`, rota `/vendas`) da erro 404 (nao existe componente)
- "Envios" deveria chamar "Etiquetas de Envio"
- "Gerar Etiqueta" (`operacional.labels.generate`) aponta para `/shipping-labels` (mesmo que Envios) -- redundante

**Acoes**:
- Desativar `marketplace.sales.orders` (Pedidos) -- `is_active = false`
- Renomear `marketplace.sales.shipping` de "Envios" para "Etiquetas de Envio"
- Desativar `operacional.labels.generate` (Gerar Etiqueta) por ser redundante com "Etiquetas de Envio"
- Manter `operacional.labels.header` (Config. Cabecalho) ativo

---

## 6. Visualizador ZPL: Renomear

**Acao**: Renomear `ferramentas.zpl_viewer` de "Visualizador ZPL" para "Etiqueta ZPL" no banco. A posicao no menu fica como esta (voce ajusta depois).

---

## Detalhes tecnicos

### Migracao SQL (uma unica migracao)

1. **Admin filhos** - SET `is_active = false` para todos os `system_modules` com `parent_module_id = 'a0000000-...-000000000001'`
2. **Admin raiz** - SET `route = '/admin'` no modulo `admin` (id `a0000000-...-000000000001`)
3. **Feature Flags** - ja coberto pelo passo 1
4. **Retrospectiva** - SET `is_active = false` em `marketplace.retrospectiva`
5. **Marketplace ML** - INSERT novo modulo `marketplace.mercadolivre`, UPDATE `parent_module_id` dos grupos atuais
6. **Marketplace Shopee** - INSERT novo modulo `marketplace.shopee` com `status = 'coming_soon'`
7. **Pedidos** - SET `is_active = false` em `marketplace.sales.orders`
8. **Envios** - UPDATE `name` para "Etiquetas de Envio" em `marketplace.sales.shipping`
9. **Gerar Etiqueta** - SET `is_active = false` em `operacional.labels.generate`
10. **ZPL** - UPDATE `name` para "Etiqueta ZPL" em `ferramentas.zpl_viewer`

### Alteracoes em codigo

- **`Admin.tsx`**: Adicionar tabs "Colaboradores", "Auditoria", "Retrospectiva" com rotas e componentes (placeholder para Colaboradores/Auditoria, componente existente para Retrospectiva)
- **`App.tsx`**: Nenhuma alteracao necessaria (rotas admin ja usam wildcard `/admin/*`)
- **`DynamicSidebar.tsx`**: Nenhuma alteracao necessaria (ja consome dados dinamicos do banco)

### Nenhuma rota sera perdida

Todas as rotas atuais do Admin continuam funcionando via tabs horizontais. A unica rota removida e `/admin/feature-flags` que nunca funcionou.

