

# Corrigir: Imagem do Template Nao Aparece (Bug Real)

## Problema encontrado

O bug e claro: o seller salva `mode: fixed` + `fixed_template_id: "Casa e Decoracao"` na tabela `seller_visual_preferences`, mas o hook `useApplyTheme` **nunca le essa tabela**. Ele chama `useThemeResolver` que so consulta `template_rules` (categoria, sazonal, global_default).

Como a conta do seller nao e da categoria `casa-decoracao`, o resolver cai no fallback `global_default` -- que e um template sem imagem de overlay. Resultado: a imagem nunca aparece.

```text
Fluxo ATUAL (quebrado):

Seller clica "Aplicar Casa e Decor"
       |
       v
seller_visual_preferences.fixed_template_id = "Casa e Decor"  (salvo OK)
       |
       v
useApplyTheme() -> useThemeResolver()  (NAO le seller_visual_preferences!)
       |
       v
template_rules -> categoria nao bate -> fallback global_default (sem imagem)
       |
       v
VisualOverlayLayer -> overlay_url = null -> NAO renderiza
```

## Solucao

Modificar `useApplyTheme` para respeitar as preferencias do seller:

```text
Fluxo CORRIGIDO:

useApplyTheme()
       |
       v
Le seller_visual_preferences (mode, fixed_template_id)
       |
       +-- mode = "fixed"?  -> Busca template + variant pelo fixed_template_id
       |                       -> Aplica tokens + overlay diretamente
       |
       +-- mode = "clean"?  -> Nao aplica nada
       |
       +-- mode = "auto"?   -> Usa useThemeResolver normalmente (regras por categoria)
```

## Arquivos a modificar

### 1. `src/hooks/useApplyTheme.ts`
- Importar `useSellerVisualPreferences`
- Quando `mode === 'fixed'` e `fixedTemplateId` existir:
  - Buscar o template e variant diretamente (sem passar pelo resolver de regras)
  - Montar o objeto `ResolvedTheme` com os dados corretos (incluindo `overlay_url`)
  - Aplicar os `design_tokens` via CSS variables
- Quando `mode === 'clean'`: nao aplicar nada
- Quando `mode === 'auto'`: manter fluxo atual via `useThemeResolver`

### 2. `src/components/visual-identity/VisualOverlayLayer.tsx`
- Nenhuma mudanca estrutural necessaria
- Ja consome `resolved.variant.overlay_url` corretamente
- Vai funcionar automaticamente quando `useApplyTheme` retornar o template correto

## Detalhes tecnicos

O `useApplyTheme` vai usar os dados ja carregados pelo `useThemeResolver` (que traz todos os templates e variants em cache) para evitar queries extras. Quando `mode === 'fixed'`:

1. Pega `fixedTemplateId` de `useSellerVisualPreferences`
2. Busca o template correspondente na lista ja carregada
3. Busca o variant `light` correspondente
4. Monta `ResolvedTheme` com `resolution_source: "Preferencia fixa do seller"`
5. Aplica tokens e retorna o `resolved` com `overlay_url` preenchido

Isso corrige tanto as cores quanto a imagem de overlay -- tudo em uma unica mudanca no `useApplyTheme`.

## O que NAO sera alterado

- `useThemeResolver` -- continua funcionando igual para modo auto
- `VisualOverlayLayer` -- ja esta correto, so precisa receber dados certos
- `SellerAppearancePanel` -- ja salva corretamente
- Nenhuma tabela ou migracao necessaria

