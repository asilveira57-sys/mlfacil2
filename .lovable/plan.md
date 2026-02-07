
# Menus com Suporte a "Abrir em Nova Guia"  
## Resumo

Duas melhorias complementares:
1. **Menu da sidebar passa a usar links reais (`<a href>`)** em vez de `<button onClick>`, habilitando "Abrir em nova guia" via clique direito ou Ctrl+Click


---

## Parte 1: Links Reais no Menu

### Problema Atual
Os itens do menu sidebar usam `<button onClick={() => navigate(url)}>`. Isso impede o comportamento nativo do navegador de "Abrir em nova guia" (clique direito ou Ctrl+Click).

### Solucao
Trocar `<button>` por `<Link to={url}>` do React Router. O componente `Link` renderiza uma tag `<a>` real com `href`, mantendo navegacao SPA no clique normal e permitindo abrir em nova guia.

**Impacto**: Somente `AppSidebar.tsx` precisa ser alterado. Tanto o modo expandido quanto o modo collapsed (com tooltips) serao atualizados.

---


