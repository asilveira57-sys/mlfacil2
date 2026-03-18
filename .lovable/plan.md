

## Plano: Corrigir Configurações visível para o Seller

### Diagnóstico

O problema é que a página /settings mostra "Configuração - Em breve" em vez das tabs reais. Isso acontece porque:

1. **Os dados do banco estão corretos** — existem 5 grupos com ~30 itens ativos, RLS permite leitura para usuários autenticados
2. **O `useConfigMenu` pode estar retornando vazio para o seller** — possível falha silenciosa na query ou problema de cache/timing
3. **Sem fallback** — quando `groups` está vazio e `isLoading` é false (ex: erro na query), o layout renderiza tabs vazias e o placeholder genérico "Configuração - Em breve"

### Correções

#### 1. Adicionar fallback hardcoded quando o banco não retorna dados
- Se `groups` estiver vazio após loading, usar uma lista estática de tabs como fallback (os mesmos que já estão no COMPONENT_MAP)
- Isso garante que o seller SEMPRE veja as configurações, independente do estado do banco

#### 2. Melhorar tratamento de erro no useConfigMenu
- Logar o erro no console quando a query falha
- Garantir que `menuGroups` nunca cause tela em branco

#### 3. Corrigir a lógica de renderização
- Quando não há items do banco mas existem componentes no COMPONENT_MAP, renderizar as tabs usando o mapa estático
- O COMPONENT_MAP já tem 15 slugs mapeados — usar como fonte de verdade quando o banco falha

### Arquivos

- `src/components/settings/SettingsLayout.tsx` — adicionar fallback estático + melhorar renderização
- `src/hooks/useConfigMenu.ts` — adicionar log de erro

### Resultado
O seller sempre verá todas as tabs de configuração. Se o banco estiver disponível, usa a ordem/nomes customizados. Se não, usa o fallback estático.

