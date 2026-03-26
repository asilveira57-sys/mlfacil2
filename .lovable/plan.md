

## Plano: Corrigir cards obrigatórios + experiência ZPL sem ML

### 3 problemas identificados

---

### Problema 1 — Cards com carrossel permitem "Concluir" sem ver todos os slides

**Causa raiz:** O modal conta **cards** como unidade de visualização, não **slides**. Um card tipo `carrossel` com 6 slides conta como "1 de 1 visualizado" — `Concluir` fica habilitado imediatamente.

**Solução:** Quando um card é do tipo `carrossel` ou `texto` com `slides`, expandir ("flatten") os slides em cards virtuais dentro do modal. Assim o contador mostra "1 de 6", "2 de 6", etc., e `Concluir` só habilita após ver todos os 6 slides.

**Arquivo:** `src/components/explanatory-cards/ExplanatoryCardModal.tsx`

Alterações:
- No início do componente, criar `flatCards`: se um card tem `conteudo.slides` (tipo carrossel ou texto com slides), expandir cada slide como um item individual com título herdado
- O progresso, dots e navegação usam `flatCards` em vez de `cards`
- `allViewed` passa a exigir que todos os `flatCards` sejam visualizados
- O botão "Concluir" permanece desabilitado até `allViewed === true`

---

### Problema 2 — Página Início (Home) mostra "Conectar Mercado Livre" para ZPL

**Causa raiz:** `src/pages/Home.tsx` (rota `/inicio`) sempre renderiza `MLConnectionCard` quando `connectionInfo.state !== 'CONNECTED'`, mesmo para usuários ZPL que não precisam de ML.

**Solução:** Verificar `user_mode` ou o plano do usuário. Se for ZPL (sem ML), não exibir o card de conexão ML e mostrar conteúdo útil (Daily Message, Quick Actions, etc.).

**Arquivo:** `src/pages/Home.tsx`

Alterações:
- Importar `useUserAccessState` para checar `mlConnected` e o plano selecionado
- Se o plano for ZPL (`planCode` contém 'zpl' ou `user_mode === 'semi_restrito'` sem ML), renderizar o conteúdo sem o `MLConnectionCard`
- Manter `DailyMessageSection`, `DashboardQuickActions` visíveis para ZPL

---

### Problema 3 — Sidebar mostra módulos ML para usuários ZPL

**Causa raiz:** O `useDynamicMenu` já filtra por `plan_modules` (linha 60-62), então se o plano ZPL tem apenas 12 módulos configurados, os módulos ML não deveriam aparecer. Porém, o grupo pai "Mercado Livre" pode estar aparecendo mesmo sem filhos visíveis, ou o `hasPlanConfig` está `false` (fail-open).

**Solução:** Verificar que a filtragem por plano está funcionando. Adicionalmente, garantir que grupos-pai sem filhos visíveis sejam podados (já existe lógica de prune, mas pode não estar cobrindo o cenário).

**Arquivo:** `src/hooks/useDynamicMenu.ts`

Alterações:
- Adicionar log de debug temporário para verificar `hasPlanConfig` e `planModuleKeys`
- Se `hasPlanConfig` for `false` para ZPL, investigar e corrigir o lookup na `useCanAccessModule`

**Arquivo:** `src/pages/Dashboard.tsx`

Alterações:
- Mesmo tratamento do Home: se ZPL, mostrar `MLNotConnectedBanner` leve ou simplesmente não mostrar nada relacionado a ML

---

### Arquivos modificados

| Arquivo | Ação |
|---|---|
| `src/components/explanatory-cards/ExplanatoryCardModal.tsx` | Flatten slides de carrossel em cards virtuais para progresso correto |
| `src/pages/Home.tsx` | Não exibir MLConnectionCard para ZPL |
| `src/pages/Dashboard.tsx` | Não exibir MLConnectionCard para ZPL |
| `src/hooks/useDynamicMenu.ts` | Verificar/corrigir filtragem de módulos ML para plano ZPL |

### Resultado esperado
- Cards com 6 slides exigem visualização de todos antes de "Concluir"
- Usuário ZPL não vê "Conectar Mercado Livre" na Home nem no Dashboard
- Sidebar mostra apenas módulos permitidos pelo plano ZPL

