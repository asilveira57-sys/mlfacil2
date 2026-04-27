Diagnóstico encontrado:

- O cliente 373 Autoparts existe no cadastro como `373autoparts@gmail.com`, com tag `VETERANO`.
- A conta do Mercado Livre dele está conectada e saudável: status `connected`, token renovado hoje, último OK de API hoje, sem erro registrado.
- Portanto, o bloqueio não parece ser pagamento, plano, token do Mercado Livre ou cadastro do cliente.
- A tela enviada é a tela genérica do nosso `RouteErrorBoundary` (“Não foi possível abrir esta página”). Na imagem aparece o pop-up do Google Translate ativo, e o `index.html` atual ainda está com `<html lang="en">`, mesmo o app sendo majoritariamente português. Isso faz o Chrome tentar traduzir a página automaticamente. Em apps React, o Google Translate pode alterar o DOM por fora do React e causar erros do tipo `removeChild/insertBefore/Node`, derrubando a tela. Isso também explica por que alguns clientes conseguem em janela anônima: extensões/tradução/cache geralmente não atuam igual no anônimo.

Plano de correção:

1. Bloquear tradução automática do navegador no app
   - Alterar o HTML base para português do Brasil.
   - Adicionar metadados e atributos `notranslate` para impedir que o Google Translate modifique o DOM do sistema.
   - Manter o seletor de idioma interno do app como forma segura de tradução.

2. Sincronizar o idioma real do app com o documento
   - Atualizar `document.documentElement.lang` conforme o idioma escolhido no app (`pt-BR`, `en`, `es`).
   - Isso evita que o navegador interprete o sistema como inglês quando o cliente está em português.

3. Melhorar a tela de recuperação para esse caso específico
   - Detectar erros típicos de DOM alterado por tradutor/extensão, como `removeChild`, `insertBefore`, `Node`, `not a child`.
   - Mostrar uma mensagem mais clara: “Detectamos interferência de tradução automática/extensão. Recarregue com a tradução desativada.”
   - O botão de recarregar continuará limpando cache e forçando uma versão nova.

4. Fortalecer a recuperação global
   - Garantir que a proteção de erro cubra também falhas fora das rotas, quando possível, não só o conteúdo interno da página.
   - Manter a recuperação de cache/chunks já implementada, pois ela resolve o outro cenário que já havíamos discutido.

5. Validar após implementação
   - Rodar checagem/build.
   - Confirmar que não há erro de TypeScript.
   - Depois será necessário publicar a versão para o domínio usado pelos clientes.

Arquivos previstos:

- `index.html`
- `src/lib/i18n/index.ts` ou um pequeno utilitário de idioma
- `src/components/RouteErrorBoundary.tsx`
- possivelmente `src/App.tsx` para posicionar melhor a proteção global de erro

Resultado esperado:

- O cliente 373 Autoparts e outros clientes deixam de cair nessa tela por causa da tradução automática/cache do navegador.
- Quando houver interferência externa, a tela passa a orientar corretamente em vez de parecer um erro genérico do sistema.
- O app continua multilíngue pelo seletor interno, sem depender do Google Translate do Chrome.