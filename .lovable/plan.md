

## Plano: Permitir edição do módulo no formulário de chamado

### Problema
Atualmente os badges de rota e módulo são apenas informativos (read-only). O usuário não consegue alterar o módulo caso queira reportar um problema de outra área.

### Solução
Substituir o badge de módulo por um `Select` editável, pré-selecionado com o módulo detectado automaticamente. O badge de rota permanece read-only (informativo).

### Arquivo: `src/components/support/CreateTicketDialog.tsx`

1. Adicionar estado `selectedModule` inicializado com `context?.module`
2. Definir lista de módulos (mesma do `FloatingSupportButton`):
   - Dashboard, Vendas, Etiquetas, Radiografia, Custos, Precificação, Curva ABC, Mercado ADS, Configurações, Outro
3. Substituir o badge de módulo (linhas 247-250) por um `Select` com os módulos acima
4. No `handleSubmit`, usar `selectedModule` em vez de `context?.module` para o campo `current_module`
5. Resetar `selectedModule` junto com os outros campos no reset do form

### Layout
- Badge de rota `/custos` permanece como está (read-only, informativo)
- Ao lado ou abaixo, o Select de módulo com label "Módulo" pré-preenchido

