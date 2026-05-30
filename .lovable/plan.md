
# Carrossel de Telas do Sistema no Hero da Landing

Transformar a imagem única do dashboard (em `LandingHero.tsx`) em um carrossel elegante com múltiplas telas do sistema, navegação por setas, dots indicadores e autoplay.

## O que será feito

### 1. Assets das telas (7 imagens enviadas)
Copiar as imagens anexadas para `src/assets/landing/`:
- `screen-dashboard.png` (Dashboard de Vendas)
- `screen-etiquetas.png` (Etiquetas de Envio)
- `screen-linha-tempo.png` (Linha do Tempo)
- `screen-radiografia.png` (Radiografia / Prontuários)
- `screen-radiografia-detalhe.png` (drawer Ribbon Dourado)
- `screen-promocoes.png` (Promoções)
- `screen-ads.png` (Mercado ADS)

Cada slide terá um rótulo (badge) com o nome do módulo, ex: "Dashboard", "Etiquetas de Envio", "Radiografia", "Publicidade / ADS", etc.

### 2. Novo componente `HeroScreensCarousel.tsx`
Em `src/components/landing/HeroScreensCarousel.tsx`, usando o `Carousel` do shadcn (`@/components/ui/carousel`, já presente — baseado em Embla) com plugin `embla-carousel-autoplay`:

- **Frame "browser"**: mantém o chrome atual (3 bolinhas + barra de URL `dashboard.mktpfacil.com`) envolvendo a imagem ativa, dando moldura premium.
- **Borda trabalhada**: container com `rounded-2xl`, `border border-border`, `shadow-2xl`, gradient ring sutil (`bg-gradient-to-br from-primary/20 via-transparent to-accent/20 p-[2px]`) ao redor do frame; glow suave atrás (`blur-3xl` em primary/10).
- **Badge do módulo**: no canto superior esquerdo da imagem, pill com ícone + nome do módulo (ex: ícone Lucide + "Etiquetas de Envio").
- **Setas prev/next**: botões circulares semitransparentes nas laterais (visíveis no hover em desktop, sempre visíveis no mobile), usando `CarouselPrevious`/`CarouselNext` reposicionados.
- **Dots indicadores**: linha de pontinhos abaixo do carrossel; o ativo é mais largo (pill) na cor `primary`, inativos em `muted-foreground/40`. Clicáveis para pular direto.
- **Autoplay**: 5s por slide, pausa no hover/interação, loop infinito.
- **Acessibilidade**: `aria-label` no carrossel, `alt` descritivo por imagem, `aria-current` nos dots.
- **Responsivo**: imagem `w-full h-auto`, frame mantém `aspect-video`, lazy loading nas imagens não-ativas.

### 3. Integração no `LandingHero.tsx`
Substituir o bloco final "Dashboard mockup / Editable Image" (a partir do `<div className="mt-16 relative">`) pelo `<HeroScreensCarousel />`. Remover o uso do `EditableImage` para `home.hero.dashboard_image` nesse ponto (manter o asset por compatibilidade, mas não exibido). O gradient overlay superior é preservado dentro do componente.

### 4. Sem mudanças em backend
- Não envolve banco, edge functions ou auth.
- Lista de slides definida estaticamente no componente (módulo + imagem + alt), facilmente extensível.

## Detalhes técnicos

- **Dependência nova**: `embla-carousel-autoplay` (peer compatível com `embla-carousel-react` já instalado pelo shadcn carousel). Se não estiver, adicionar via bun.
- **Estado ativo**: usar `api.on("select", ...)` do Embla para sincronizar dots e badge atual.
- **Performance**: `loading="lazy"` + `decoding="async"` em todas imagens exceto a primeira (`eager`).
- **Tokens semânticos**: usar `border-border`, `bg-card`, `text-primary`, `text-muted-foreground` — sem cores hardcoded.
- **Não afeta** outras páginas/módulos; mudança isolada no Hero da landing pública.

## Arquivos

- **Criar**: `src/components/landing/HeroScreensCarousel.tsx`
- **Copiar (assets)**: 7 PNGs para `src/assets/landing/`
- **Editar**: `src/components/landing/LandingHero.tsx` (substituir bloco da imagem)
- **Editar (se necessário)**: `package.json` (adicionar `embla-carousel-autoplay`)

## Fora de escopo
- Edição inline das imagens do carrossel via admin (`EditableImage`) — slides ficam fixos nesta primeira versão.
- Alterar outras seções da landing.
