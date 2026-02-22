
# Plano: Integrar Identidade Visual ao Simulador de Aparência

## Problema Atual

Os dois sistemas sao independentes e nao se comunicam:
- **Aparencia (Templates)**: resolve cores e tokens CSS com base em regras de categoria/empresa/sazonal
- **Identidade Visual**: aplica gradientes e imagens overlay com base no grupo visual da categoria ML

O Simulador de Aparencia so mostra os tokens resolvidos, mas nao mostra como ficaria o overlay visual (gradiente + imagem) aplicado. Isso impede que voce teste como "Casa e Decoracao" ficaria sem ser dessa categoria.

## Solucao

Adicionar ao Simulador de Aparencia um seletor de **Grupo Visual** (da tabela `visual_category_groups`), permitindo visualizar o overlay completo junto com os tokens resolvidos.

## Alteracoes

### 1. Modificar `TemplateSimulator.tsx`

- Buscar os `visual_category_groups` ativos junto com os dados de templates
- Adicionar um `Select` para escolher o grupo visual (ex: "Casa e Decoracao", "Tecnologia", etc.)
- Renderizar um preview combinado que mostra:
  - Os tokens de cor resolvidos (como ja funciona)
  - O overlay de gradiente + imagem do grupo selecionado, com controle de intensidade
- Adicionar um slider de intensidade para simular diferentes niveis

### 2. Preview Visual Integrado

O bloco de resultado do simulador passara a ter uma area de preview que combina:
- Fundo com as cores do template resolvido (background, card, etc.)
- Overlay de gradiente do grupo visual selecionado (com `mix-blend-mode: overlay`)
- Overlay de imagem do grupo (com `mix-blend-mode: soft-light`), caso exista
- Intensidade ajustavel via slider

Isso replica exatamente o comportamento do `VisualOverlay` component, mas de forma isolada no simulador.

---

## Detalhes Tecnicos

### Dados adicionais no query do simulador
```
// Adicionar ao queryFn existente:
const groups = await supabase
  .from('visual_category_groups')
  .select('*')
  .eq('ativo', true)
  .order('prioridade');
```

### Novos controles na UI
- `Select` com os grupos visuais disponíveis (slug como valor, nome como label, com preview de cor)
- `Slider` de intensidade (1-10)

### Preview combinado
Replicar a logica do `VisualOverlay` inline no simulador:
- Gradiente com `opacity = intensidade/10` e `mixBlendMode: 'overlay'`
- Imagem (se existir) com `opacity = intensidade/10 * 0.5` e `mixBlendMode: 'soft-light'`
- Conteudo de exemplo por cima (titulo, badges, texto) usando as cores do template resolvido

### Arquivos modificados
- `src/components/settings/templates/TemplateSimulator.tsx` — unico arquivo a ser alterado
