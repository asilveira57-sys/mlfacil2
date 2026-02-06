

# Correcao: Widgets de Utilidades nao aparecem no header

## Problema encontrado

A aplicacao usa dois layouts, mas apenas o **AppShellLayout** esta ativo (renderiza todas as rotas via `<Outlet />`). O **DashboardLayout** (que continha o `<HeaderUtilities />`) nao e mais utilizado por nenhuma pagina.

Ou seja, os widgets (relogio, clima, calculadora) foram adicionados ao layout errado. O `AppShellLayout.tsx` nunca importou nem renderizou o componente `HeaderUtilities`.

```text
AppShellLayout.tsx (USADO - falta HeaderUtilities)
  header: SidebarTrigger | Titulo | RefreshButton | LanguageSwitcher | NotificationBell | AccountSwitcher

DashboardLayout.tsx (NAO USADO - tem HeaderUtilities)
  header: SidebarTrigger | Titulo | HeaderUtilities | LanguageSwitcher | NotificationBell | AccountSwitcher
```

## Solucao

Adicionar o `<HeaderUtilities />` ao header do `AppShellLayout.tsx`, posicionando-o antes do botao de refresh (ou logo apos), exatamente como estava planejado no DashboardLayout.

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/components/layout/AppShellLayout.tsx` | Importar `HeaderUtilities` e renderizar no header, antes do `LanguageSwitcher` |

## Detalhe da mudanca

No `AppShellLayout.tsx`:

1. Adicionar import:
   `import { HeaderUtilities } from "@/components/utilities";`

2. Dentro do `<div className="flex items-center gap-2 ml-auto">`, adicionar `<HeaderUtilities />` e um separador vertical antes dos demais itens (RefreshButton, LanguageSwitcher, etc.)

O resultado no header ficara:

```text
[Sidebar] | Titulo |                    [Relogio | Clima | Calculadora] | [Refresh] | [PT] | [Sino] | [Conta]
```

## O que NAO sera alterado

- Nenhum outro arquivo
- Nenhuma migracao SQL
- Os componentes de widget ja estao funcionando corretamente
- A aba de Configuracoes > Utilidades ja esta pronta
- O DashboardLayout continuara existindo (nao sera removido para evitar quebras)

