
# Calendario Social em Grid

## O que muda

O layout atual e uma lista vertical de 28-31 linhas com scroll. Sera substituido por um **grid de calendario tradicional** (7 colunas x 5-6 linhas), onde cada celula representa um dia do mes. Dias com eventos mostram indicadores coloridos; ao clicar em um dia com eventos, abre o drawer de ideias.

## Como vai funcionar

1. **Grid 7x6** - Dom a Sab em colunas, com os dias do mes preenchendo as celulas (incluindo dias do mes anterior/proximo para completar as semanas)
2. **Celulas compactas** - Cada celula mostra o numero do dia e ate 2-3 badges de eventos. Se houver mais, mostra "+N"
3. **Dia atual destacado** - Circulo com cor primaria no numero do dia
4. **Clique no evento** - Abre o drawer lateral de ideias (comportamento atual preservado)
5. **Dias sem eventos** - Celula mais discreta, sem badges
6. **Popover ao clicar no dia** - Se o dia tem mais de um evento, mostra um popover listando todos antes de abrir o drawer

## Layout visual

```text
        Dom   Seg   Ter   Qua   Qui   Sex   Sab
       +-----+-----+-----+-----+-----+-----+-----+
  L1   | 26  | 27  | 28  | 29  | 30  | 31  |  1  |
       |     |     |     |     |     |     |     |
       +-----+-----+-----+-----+-----+-----+-----+
  L2   |  2  |  3  |  4  |  5  |  6  |  7  |  8  |
       |[Tem]|     |     |     |     |     |     |
       +-----+-----+-----+-----+-----+-----+-----+
  ...
       +-----+-----+-----+-----+-----+-----+-----+
  L5   | 23  | 24  | 25  | 26  | 27  | 28  |     |
       |     |[Fer]|     |     |     |     |     |
       +-----+-----+-----+-----+-----+-----+-----+

  [Tem] = badge tematica    [Fer] = badge feriado
```

## Detalhes Tecnicos

### Arquivo: `src/components/social-calendar/SocialCalendarMainView.tsx`

Reescrever o componente mantendo:
- Hooks existentes (`useCalendarEvents`, `useCalendarPreferences`, `useCurrentUser`)
- Navegacao mes anterior/proximo
- Legenda de categorias
- Drawer de ideias (`SocialCalendarIdeasDrawer`)

Substituir a lista vertical por:

1. **Calcular grid de semanas** usando `startOfWeek` e `endOfWeek` do `date-fns` para gerar 5-6 semanas completas (incluindo dias de padding do mes anterior/proximo)
2. **Cabecalho** com dias da semana (Dom-Sab) usando `locale: ptBR`
3. **Grid CSS** com `grid-cols-7` e altura minima por celula (`min-h-[80px]`)
4. **Dentro de cada celula:**
   - Numero do dia (destaque se hoje, opacidade reduzida se fora do mes)
   - Ate 2 badges de eventos clicaveis (mostrando titulo truncado + cor da categoria)
   - Indicador "+N" se houver mais de 2 eventos
5. **Ao clicar em um badge de evento** - abre diretamente o drawer de ideias (mesmo comportamento atual)
6. **Ao clicar no "+N"** - abre um Popover com a lista completa dos eventos do dia, cada um clicavel

### Novas importacoes necessarias

- `startOfWeek`, `endOfWeek`, `isSameDay`, `isToday`, `getDay` do `date-fns`
- `Popover`, `PopoverTrigger`, `PopoverContent` do `@radix-ui/react-popover` (ja instalado)

### Responsividade

- Em telas pequenas (mobile), as celulas reduzem para mostrar apenas o numero e um dot colorido indicando eventos
- A legenda permanece acima do grid
