

## Plano de Correção da Página de Login (`Auth.tsx`)

Tres correções pontuais, sem alterar layout nem lógica de autenticação.

---

### 1. Corrigir o degradê entre colunas

**Problema**: A div de transição (linha 39) usa `bg-gradient-to-r from-transparent to-background` via Tailwind, que aplica o gradiente de forma imprecisa.

**Solução**: Substituir o className por um `style` inline com o gradiente exato do prompt do GPT — faixa de 80px com stops controlados (`rgba(255,255,255,0)` → `rgba(255,255,255,1)`), sem blur nem glow.

```
style={{
  background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.08) 25%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.45) 75%, rgba(255,255,255,1) 100%)'
}}
```
Largura: `w-[80px]`.

---

### 2. Corrigir enquadramento da foto

**Problema**: A foto de Alexandre Silveira (`w-11 h-11 object-cover`) está cortando a cabeça.

**Solução**: Adicionar `object-[center_20%]` (posicionar o foco mais acima para enquadrar o rosto) na tag `<img>` da foto no card de autoridade (linha 74).

---

### 3. Restaurar textos descritivos nos BenefitCards

**Problema**: Os cards de benefício mostram apenas títulos curtos. A versão anterior (e a referência do print) incluía subtítulos descritivos.

**Solução**: Atualizar o componente `BenefitCard` para aceitar uma prop `description` e renderizá-la abaixo do título. Textos:

- **Lucro real por produto** — "Calcule margens considerando custos, comissões, taxas e frete antes de alterar preços."
- **Análise de anúncios e posicionamento** — "Visualize desempenho, estrutura e posicionamento dos produtos para decisões mais seguras."
- **Visão clara da operação** — "Acompanhe vendas, indicadores e movimentações do negócio com dados organizados."

---

### 4. Substituir selo do Mercado Livre

**Problema**: O selo atual (`selo-ml-certificado.png`) foi gerado automaticamente.

**Solução**: Copiar o arquivo enviado (`SELO_CONSULTORIA_CERTIFICADA_MERCADO_LIVRE_2.avif`) para `src/assets/` e usá-lo no import do `Auth.tsx`, substituindo o selo atual no card de autoridade.

---

### Arquivos afetados

- `src/pages/Auth.tsx` — todas as 4 alterações
- `src/assets/selo-consultoria-ml.avif` — novo asset (cópia do upload)

