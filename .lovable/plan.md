
# Plano: Adicionar Clonagem de Anúncios no Modulo de Concorrencia

## Resumo

O objetivo e permitir clonar qualquer anuncio diretamente do modulo de Concorrencia (aba "Meus Anuncios"), reaproveitando a infraestrutura existente de clonagem do modulo Linha do Tempo.

---

## Contexto

Atualmente a funcao de clonar anuncios esta disponivel apenas no modulo **Linha do Tempo** (`/anuncios/linha-do-tempo`), que depende de dados pre-calculados na tabela `ad_timeline_stats`. Como essa tabela nao esta sendo populada (o recalculo falha), os anuncios nao aparecem e consequentemente a opcao de clonar nao fica acessivel.

A solucao e adicionar a mesma funcionalidade de clonagem diretamente na aba **"Meus Anuncios"** do modulo de Concorrencia, que ja carrega os anuncios do seller via cache (`meli_listings_cache`) e funciona independentemente da Linha do Tempo.

---

## Arquitetura Existente

```text
+---------------------------+
|  CompetitorListings.tsx   |  <-- Lista anuncios do seller
+---------------------------+
            |
            v
+---------------------------+
| CompetitorProductDetail   |  <-- Drawer com detalhes do produto
+---------------------------+
            |
            v (ADICIONAR AQUI)
+---------------------------+
|     ActionDrawer.tsx      |  <-- Ja existe, reutilizar
+---------------------------+
            |
            v
+---------------------------+
|    useCreateAction()      |  <-- Cria registro DRAFT em ad_lifecycle_actions
+---------------------------+
            |
            v
+---------------------------+
|  ad-action-execute (Edge) |  <-- Executa clonagem via API do ML
+---------------------------+
```

---

## Implementacao

### 1. Atualizar CompetitorProductDetail.tsx

Adicionar um botao "Clonar Anuncio" que abre o `ActionDrawer` com tipo `CLONE`:

- Importar o `ActionDrawer` de `@/components/ad-timeline`
- Importar `useCreateAction` de `@/hooks/useAdTimeline`
- Adicionar estado para controlar abertura do drawer
- Obter `workspaceId` (user.id) e `mlAccountId` (sellerId)
- Ao confirmar, chamar `createActionMutation.mutateAsync()` com os dados

### 2. Exibir botao de clonar tambem na tabela (CompetitorListings.tsx)

Adicionar um menu de acoes (three-dot menu) em cada linha da tabela com opcao "Clonar":

- Similar ao que existe em `AdTimelineRadar.tsx`
- Ao clicar, abre o `ActionDrawer` direto para o item selecionado

### 3. Criar hook/utilitario para obter workspaceId

Para evitar duplicacao de logica (buscar `user.id` como workspaceId), considerar:

- Usar diretamente `supabase.auth.getUser()` inline (padrao atual)
- Ou criar um pequeno hook `useWorkspaceId()` que retorna o user.id

### 4. Verificar se ad_lifecycle_actions suporta items sem ad_timeline_stats

A tabela `ad_lifecycle_actions` nao tem FK para `ad_timeline_stats`, entao podemos criar acoes para qualquer `item_id` sem problemas. O edge function `ad-action-execute` busca os dados do item diretamente da API do ML se nao houver snapshot.

---

## Fluxo do Usuario

1. Usuario acessa **Concorrencia > Meus Anuncios**
2. Clica em um anuncio para ver detalhes OU clica no menu de acoes na linha
3. Clica em **"Clonar Anuncio"**
4. Abre o drawer para selecionar o que copiar (titulo, fotos, preco, etc)
5. Confirma e um rascunho e criado em `ad_lifecycle_actions`
6. Usuario pode ir em **Linha do Tempo > Central de Acoes** para executar a clonagem

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/competitor/CompetitorProductDetail.tsx` | Adicionar botao "Clonar" e integrar ActionDrawer |
| `src/components/competitor/CompetitorListings.tsx` | Adicionar menu de acoes com opcao "Clonar" |

---

## Detalhes Tecnicos

### CompetitorProductDetail.tsx - Mudancas

```tsx
// Novos imports
import { ActionDrawer } from "@/components/ad-timeline";
import { useCreateAction } from "@/hooks/useAdTimeline";
import type { ActionType, CloneChecklist } from "@/types/ad-timeline";

// Novos estados
const [cloneDrawerOpen, setCloneDrawerOpen] = useState(false);
const [workspaceId, setWorkspaceId] = useState<string | null>(null);
const createActionMutation = useCreateAction();

// Effect para obter workspaceId
useEffect(() => {
  supabase.auth.getUser().then(({ data }) => {
    if (data.user) setWorkspaceId(data.user.id);
  });
}, []);

// Handler para confirmar clonagem
const handleConfirmClone = async (reason: string, checklist: CloneChecklist) => {
  if (!workspaceId) return;
  await createActionMutation.mutateAsync({
    workspaceId,
    mlAccountId: sellerId,
    itemId: listing.item_id,
    actionType: 'CLONE' as ActionType,
    reason,
    checklist,
  });
  setCloneDrawerOpen(false);
  toast.success('Rascunho de clonagem criado! Vá à Central de Ações para executar.');
};

// Botao no JSX
<Button onClick={() => setCloneDrawerOpen(true)}>
  <Copy className="h-4 w-4 mr-2" />
  Clonar Anúncio
</Button>

// ActionDrawer no final
<ActionDrawer
  open={cloneDrawerOpen}
  onOpenChange={setCloneDrawerOpen}
  actionType="CLONE"
  itemId={listing.item_id}
  itemTitle={listing.title}
  onConfirm={handleConfirmClone}
  isLoading={createActionMutation.isPending}
/>
```

### CompetitorListings.tsx - Mudancas

- Adicionar imports similares
- Adicionar estado para item selecionado e drawer
- Adicionar coluna de acoes com DropdownMenu
- Incluir ActionDrawer no render

---

## Consideracoes

1. **Execucao diferida**: O clone nao e executado imediatamente, apenas um rascunho e criado. O usuario deve ir na Central de Acoes para executar.

2. **Alternativa**: Podemos adicionar execucao direta (com confirmacao) sem passar pela Central de Acoes, mas isso requer modificar o fluxo atual.

3. **RLS**: A tabela `ad_lifecycle_actions` ja tem RLS baseada em `workspace_id`, entao os registros criados estarao protegidos.

---

## Resultado Esperado

Apos a implementacao, o usuario podera:

- Ver qualquer anuncio na aba "Meus Anuncios" do modulo Concorrencia
- Clonar o anuncio diretamente de la
- Gerenciar a execucao na Central de Acoes
