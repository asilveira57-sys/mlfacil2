
# Ajuste do Calendario Social - Layout Centralizado e Sem Rolagem

## Problema

O grid do calendario ocupa 100% da largura da tela, empurrando os botoes de navegacao (avancar/voltar mes) para as extremidades. Alem disso, a altura total do grid ultrapassa a area visivel, forcando o uso da barra de rolagem.

## Solucao

### 1. Limitar a largura e centralizar

Envolver o calendario em um container com largura maxima (`max-w-4xl` ~896px) e centralizado (`mx-auto`). Isso cria margens laterais naturais e traz os botoes de navegacao para perto do titulo.

### 2. Reduzir altura das celulas para caber na tela

Diminuir `min-h` das celulas de `56px` para `44px`, garantindo que 6 semanas caibam na area visivel sem scroll. Os badges de eventos ficam ainda mais compactos.

### 3. Navegacao mais acessivel

Os botoes de avancar/voltar mes ficam visivelmente proximos ao titulo do mes, sem precisar ir ate a borda da tela.

## Detalhes Tecnicos

### Arquivo: `src/components/social-calendar/SocialCalendarMainView.tsx`

Alteracoes:
- Trocar o container raiz de `<div className="space-y-2">` para `<div className="space-y-2 max-w-4xl mx-auto">`
- Reduzir `min-h-[56px]` para `min-h-[44px]` nas celulas do grid
- Reduzir padding interno das celulas de `p-1` para `p-0.5`
- Manter todos os demais comportamentos (clicks, popover, drawer, legenda)
