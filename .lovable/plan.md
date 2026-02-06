

# Plano: Correcao do Clima + Botao Flutuante Movivel + Aba Suporte em Configuracoes

## Problemas Identificados

### 1. Widget de Clima nao aparece
O widget de clima chama a Edge Function `weather-api`, que retorna erro 401 ("Invalid API key") do OpenWeatherMap. Quando o erro ocorre, o componente `WeatherWidget` retorna `null` silenciosamente (linha 124-126), sem nenhum indicativo visual para o usuario.

**Causa raiz:** A chave da API do OpenWeatherMap ainda esta invalida ou nao foi ativada. Porem, mesmo com chave invalida, o usuario deveria ver algum feedback no header em vez de simplesmente sumir.

### 2. Botao flutuante de suporte atrapalha a navegacao
O botao esta fixo no canto inferior direito (`fixed bottom-6 right-6`) sem opcao de mover ou fechar. Ele sobrepoe a calculadora e outros elementos interativos.

### 3. Falta a aba "Suporte" em Configuracoes
A pagina de Configuracoes tem 8 abas (Perfil, Idioma, Colaboradores, Personalizacao, Utilidades, Faturamento, Empresas, Assinatura), mas nenhuma para Suporte. O seller nao tem onde configurar a visibilidade do botao flutuante nem gerenciar seus tickets.

---

## Solucao Proposta

### Parte 1 - Clima: feedback visual quando indisponivel

Em vez de sumir completamente quando ha erro, o widget mostrara um icone de nuvem com indicador de erro (tooltip explicando que o servico esta indisponivel). Isso evita que o usuario pense que o widget nao existe.

**Arquivo:** `src/components/utilities/WeatherWidget.tsx`
- Alterar a condicao de erro na variante `compact` para exibir um icone de nuvem com cor de aviso em vez de retornar `null`
- Tooltip explicando "Clima indisponivel - verifique configuracoes"

### Parte 2 - Botao flutuante arrastavel com opcao de fechar

**Arquivo:** `src/components/support/FloatingSupportButton.tsx`

Transformar o botao flutuante para suportar:

1. **Drag & Drop nativo** - Usar eventos de mouse/touch (`onPointerDown`, `onPointerMove`, `onPointerUp`) para permitir arrastar o botao para qualquer posicao na tela. A posicao sera salva em `localStorage` para persistir entre navegacoes na mesma sessao.

2. **Botao X para fechar** - Adicionar um pequeno botao X que aparece ao passar o mouse sobre o botao flutuante. Ao fechar, o botao desaparece ate o proximo login/reload.

3. **Respeitar preferencia do usuario** - O botao so aparece se a preferencia `showSupportButton` estiver habilitada (padrao: `true`). Ao fazer login, o botao reseta para visivel (conforme requisito).

4. **Corrigir navegacao SPA** - A linha 104 usa `window.location.href` para navegar para a Base de Conhecimento, violando o padrao SPA. Sera substituido por `useNavigate`.

### Parte 3 - Nova aba "Suporte" em Configuracoes

**Novo arquivo:** `src/components/settings/SettingsSupport.tsx`

Card com duas secoes:

| Secao | Conteudo |
|-------|----------|
| **Botao de Suporte** | Switch "Exibir botao flutuante de suporte" (persiste em `user_preferences.widgets_layout` como `showSupportButton`) |
| **Meus Chamados** | Lista de tickets do seller com status, prioridade e link para detalhes (reutiliza `SupportTicketList` e `SupportTicketDetail`) |

**Arquivo modificado:** `src/pages/Settings.tsx`
- Adicionar aba "Suporte" com icone `Headphones`
- Importar e renderizar `SettingsSupport`
- Ajustar grid de 8 para 9 colunas (`grid-cols-4 lg:grid-cols-9`)

### Parte 4 - Persistencia da preferencia do botao flutuante

**Arquivo:** `src/hooks/useUtilitiesPreferences.ts`
- Adicionar `showSupportButton: boolean` ao tipo `UtilitiesPreferences`
- Ler/salvar no campo `widgets_layout` (JSONB) existente, sem necessidade de migracao SQL

**Arquivo:** `src/components/layout/AppShellLayout.tsx`
- Passar a preferencia `showSupportButton` para o `FloatingSupportButton`
- O botao so renderiza se a preferencia estiver ativa

---

## Resumo de Arquivos

| Arquivo | Acao |
|---------|------|
| `src/components/utilities/WeatherWidget.tsx` | Editar - feedback visual de erro |
| `src/components/support/FloatingSupportButton.tsx` | Editar - drag, fechar, preferencia, fix SPA |
| `src/components/settings/SettingsSupport.tsx` | **Criar** - nova aba de suporte |
| `src/pages/Settings.tsx` | Editar - adicionar aba Suporte |
| `src/hooks/useUtilitiesPreferences.ts` | Editar - adicionar `showSupportButton` |
| `src/components/layout/AppShellLayout.tsx` | Editar - condicional do botao flutuante |
| `src/locales/pt-BR/utilities.json` | Editar - adicionar traducoes de suporte |
| `src/locales/en/utilities.json` | Editar - adicionar traducoes de suporte |
| `src/locales/es/utilities.json` | Editar - adicionar traducoes de suporte |

**Nenhuma migracao de banco de dados e necessaria** - tudo sera persistido no campo JSONB `widgets_layout` ja existente na tabela `user_preferences`.

