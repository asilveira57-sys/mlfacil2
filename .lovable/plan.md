

# Painel de Aparencia do Seller: Preview Visual + Aplicar Qualquer Template

## Problema identificado

O painel atual em Configuracoes > Aparencia:
- **Nao mostra a imagem** de overlay do template (apenas cores em miniatura)
- **Nao permite testar** um template que nao seja da sua categoria (ex: voce quer ver "Casa e Decoracao" mas sua conta nao e dessa categoria)
- **Nao tem preview visual** antes de aplicar
- O fluxo atual exige entender modos (auto/fixo/clean) sem ver o resultado

## Solucao proposta

Reescrever o `SellerAppearancePanel` com foco em **ver e aplicar**, sem complexidade desnecessaria.

### 1. Galeria de Templates com Preview Visual

Substituir o dropdown de template fixo por uma **galeria de cards visuais** mostrando todos os templates ativos. Cada card tera:

- Nome do template
- Mini-preview das cores (ja existe `TemplateMiniPreview`)
- **Imagem de overlay** (thumbnail da `overlay_url` do variant, se existir)
- Badge indicando se esta ativo no momento
- Botao "Visualizar" e "Aplicar"

### 2. Preview em tempo real

Ao clicar "Visualizar" em qualquer template:
- Aplicar temporariamente os `design_tokens` do template via CSS variables (sem salvar)
- Mostrar o overlay como apareceria na interface (preview inline no proprio painel)
- Botao "Aplicar" para salvar como template fixo
- Botao "Cancelar" para voltar ao tema atual

### 3. Simplificar o fluxo

- Manter os 3 modos (Auto/Fixo/Limpo) mas em formato mais compacto
- Quando usuario clica "Aplicar" em qualquer template da galeria, automaticamente muda para modo "Fixo" com aquele template
- O slider de intensidade e toggles ficam em um accordion "Ajustes avancados"

### 4. Detalhes tecnicos

**Arquivos a modificar:**
- `src/components/settings/SellerAppearancePanel.tsx` -- reescrever com galeria + preview
- `src/components/settings/templates/TemplateColorPreview.tsx` -- adicionar variante com imagem de overlay

**Dados consumidos (sem novas queries):**
- `useTemplatesList()` -- ja carrega todos os templates
- `useThemeResolver` -- tema ativo atual (query existente com cache de 5min)
- Buscar variants dos templates ativos com uma unica query adicional para pegar `overlay_url`

**Preview temporario:**
- Usar `applyDesignTokens()` (ja existe) para injetar tokens temporariamente
- Estado local `previewingTemplateId` controla qual template esta em preview
- Ao cancelar, reaplica os tokens do tema resolvido atual

**Fluxo de aplicar:**
1. Usuario clica "Aplicar" no card do template
2. `upsert` salva `mode: 'fixed'` + `fixed_template_id: <id>`
3. `useApplyTheme` detecta mudanca e aplica automaticamente
4. Overlay layer atualiza sozinha (ja consome `resolved.variant.overlay_url`)

**Nenhuma mudanca de banco necessaria** -- usa `seller_visual_preferences` e `templates/template_variants` existentes.

### 5. O que NAO sera alterado

- Theme Resolver (continua igual)
- VisualOverlayLayer (continua igual)
- useApplyTheme (continua igual)
- Nenhuma tabela nova ou migracao

