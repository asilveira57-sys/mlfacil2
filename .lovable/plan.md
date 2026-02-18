

# Substituir Mockup do Dashboard pela Imagem Real

## O que sera feito

Substituir o placeholder CSS (barras cinzas genéricas) na hero da landing page pela captura de tela real do dashboard que voce enviou (Screenshot_1.jpg). A imagem sera emoldurada com um visual de janela de navegador para ficar elegante e profissional.

## Detalhes

1. **Copiar a imagem** do upload para `src/assets/dashboard-preview.jpg`

2. **Atualizar o LandingHero.tsx**:
   - Remover todo o bloco de placeholder CSS (as divs com barras cinzas simulando cards e graficos)
   - Importar a imagem real como modulo ES6
   - Exibir a imagem dentro de um frame estilizado de navegador (com os 3 bolinhas coloridas e a barra de endereco mostrando "dashboard.mktpfacil.com")
   - A imagem tera `rounded-2xl`, `shadow-2xl` e `border` para ficar coerente com o design da pagina
   - Manter o gradiente de fade na parte inferior que ja existe

3. **Manter a funcionalidade EditableImage**: O admin ainda podera trocar a imagem futuramente pelo painel de edicao. A imagem real sera usada como fallback padrao quando nenhuma imagem personalizada estiver configurada no banco.

## Resultado visual esperado

```text
+--------------------------------------------------+
| [vermelho] [amarelo] [verde]  dashboard.mktpfacil.com |
|--------------------------------------------------|
|                                                  |
|   [Screenshot real do dashboard com KPIs,        |
|    grafico de vendas e top produtos]              |
|                                                  |
+--------------------------------------------------+
         (gradiente fade na parte inferior)
```

## Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `src/assets/dashboard-preview.jpg` | Novo - copia da imagem enviada |
| `src/components/landing/LandingHero.tsx` | Substituir placeholder CSS pela imagem real com frame de navegador |

