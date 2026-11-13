# MKTP Facil

Você é um desenvolvedor sênior especializado em Chrome Extensions, APIs REST e integração com Mercado Livre.
Crie um projeto completo (back-end + front-end web + extensão para Chrome) para análise de anúncios no Mercado Livre, inspirado em ferramentas como AvantPro, porém mais completo e modular.

OBJETIVO GERAL
Criar uma extensão do Chrome conectada a um back-end próprio que, ao acessar uma página de produto do Mercado Livre, mostre um painel lateral com:

Dados detalhados do anúncio

Análises de concorrência

Tendências de mercado

Indicadores de publicidade (Mercado Ads)

Informações ligadas à Central de Promoções

O foco é atender vendedores profissionais e consultores de e-commerce.

ARQUITETURA GERAL
– Criar no Lovable uma aplicação web com API própria (REST) que será consumida pela extensão.
– A aplicação terá:
• Módulo de autenticação do usuário (login/senha)
• Integração via OAuth com a API do Mercado Livre, salvando tokens de forma segura
• Banco de dados relacional para guardar: usuários, contas ML vinculadas, anúncios analisados, métricas, histórico, configurações e logs
– Criar um módulo específico para gerar o pacote da extensão do Chrome, contendo:
• Manifest v3
• Background/service worker
• Content script injetado nas páginas de produto do Mercado Livre
• Página de opções/configurações da extensão

COMPORTAMENTO DA EXTENSÃO NO NAVEGADOR
– Detectar automaticamente quando o usuário estiver em uma página de anúncio do Mercado Livre (URL de produto).
– Extrair da URL o ID do item.
– Enviar esse ID, junto com o usuário autenticado, para a API da aplicação via chamada segura.
– Receber da API um JSON (internamente) com todas as análises e exibir um painel lateral fixo sobre a própria página do Mercado Livre (side panel encaixado à direita, com opção de abrir/fechar).
– O painel precisa ser responsivo, com boa leitura em monitores menores e maiores, e visual limpo.

MÓDULO 1 – PAINEL DO ANÚNCIO (VISÃO GERAL)
Criar um bloco semelhante ao painel do AvantPro, porém mais rico:

Campos e métricas principais:
– Informações básicas do anúncio:
• Título
• ID do anúncio
• Categoria e subcategoria
• Tipo de anúncio (clássico, premium, catálogo, loja oficial etc.)
• Status (ativo, pausado, finalizado)

– Dados de performance:
• Visitas totais e visitas nos últimos 7, 30 e 90 dias
• Quantidade total vendida e vendas por período (7, 30, 90 dias)
• Média diária de vendas e taxa de conversão (vendas / visitas)
• Data de criação do anúncio
• Data da última atualização do anúncio

– Estoque e risco:
• Quantidade disponível
• Estoque em trânsito (se existir pela API)
• Alerta visual quando estoque < 100 unidades
• Sinalizar se o anúncio está com estoque igual a 0 ou perto de esgotar

– Finanças do anúncio:
• Preço de venda e preço anterior (se tiver)
• Frete médio cobrado ao comprador
• Comissão do Mercado Livre (valor e percentual)
• Impostos estimados (usar um campo configurável de percentual)
• Valor líquido que o vendedor recebe
• Campo para o usuário configurar custo do produto e custo de frete, calculando margem e markup (lucro absolute e percentual)

– Qualidade do anúncio (checklist):
• Número de fotos
• Resolução das fotos, identificando fotos abaixo de 1200 x 1200 e listando quantas estão abaixo desse mínimo
• Verificação se o anúncio possui vídeo
• Verificação se possui Clips de ML
• Tamanho do título (quantidade de caracteres) e se está dentro de uma faixa ideal configurável
• Verificação de campos obrigatórios de ficha técnica / atributos
• Alerta para descrição muito curta
• Mensagens claras de “pontos negativos” e “oportunidades de melhoria” em forma de lista bullet, por exemplo:
– Estoque baixo
– Fotos em baixa resolução
– Falta de vídeo
– Ausência de Clips

MÓDULO 2 – RANKEAMENTO E PALAVRAS-CHAVE
Criar um painel de SEO interno para o anúncio:

– Campo para o usuário cadastrar e salvar uma lista de palavras-chave por anúncio (exemplo: “impressora hp”, “impressora laser postscript hp”).
– Para cada palavra-chave, a ferramenta deve:
• Pesquisar a palavra no Mercado Livre (via API ou scraping controlado, sempre que possível pela API).
• Localizar em qual página e posição esse anúncio aparece nos resultados orgânicos.
• Exibir uma tabela com colunas: Palavra-chave, Página, Posição, Indicador de presença em Ads (sim/não).
– Permitir registrar histórico de posição ao longo do tempo para cada palavra-chave.
– Destacar visualmente as palavras em que o anúncio está na primeira página.

MÓDULO 3 – ANÁLISE DE CONCORRÊNCIA
Criar um módulo robusto de concorrência e comparação:

– Com base no ID do anúncio atual, identificar:
• Produtos semelhantes no mesmo título/categoria
• Principais concorrentes nas mesmas palavras-chave cadastradas
– Exibir lista dos concorrentes com:
• Título
• Link para o anúncio
• Preço (com e sem frete, se possível)
• Tipo de envio (full, normal, flex)
• Quantidade vendida
• Avaliação do vendedor (reputação, medalhas, loja oficial)
• Se participa de promoções específicas (ofertas relâmpago, campanhas especiais)
– Criar um comparativo visual entre o anúncio do usuário e os principais concorrentes:
• Comparar preço, comissão, visitas estimadas, vendas estimadas, frete, reputação e tempo na plataforma.
– Criar um resumo com pontos de atenção, por exemplo:
• “Seu anúncio está X% acima da média de preço dos principais concorrentes.”
• “Concorrentes com frete grátis têm Y% mais vendas.”

MÓDULO 4 – TENDÊNCIAS E MERCADO
Criar um painel de tendências de categoria:

– Levantar dados históricos (últimos meses) do conjunto de anúncios semelhantes para:
• Volume de vendas da categoria ou subcategoria
• Faixa de preço mais frequente
• Tipo de envio mais comum
– Exibir gráficos simples (linha/coluna) na interface web (a extensão só recebe o resultado pronto da API).
– Classificar o produto como:
• Produto em crescimento
• Produto estável
• Produto em queda
– Incluir um campo de lista com “palavras-chave em alta” na categoria, obtidas a partir de análise dos títulos e buscas (quando possível pela API).

MÓDULO 5 – PUBLICIDADE (MERCADO ADS)
Criar integração com o módulo de publicidade do Mercado Livre:

– Ao conectar a conta do vendedor, listar campanhas de Ads ligadas àquele anúncio.
– Para cada campanha e grupo de anúncios, trazer:
• Impressões
• Cliques
• CPC médio
• Custo total no período
• Vendas atribuídas
• Faturamento atribuído
• ACOS e ROAS
– Exibir um painel resumido no lado do anúncio com:
• Investimento por período
• Resultado (vendas e faturamento)
– Gerar sugestões de otimização baseadas em regras simples:
• Se ACOS estiver acima de um limite configurável, sugerir ajuste de lance ou pausa.
• Se ROAS estiver muito baixo, sugerir revisão de criativos, título ou palavras-chave.

MÓDULO 6 – CENTRAL DE PROMOÇÕES
Criar um módulo específico para promoções:

– Listar promoções em que o anúncio está inserido (promoções da própria conta e campanhas oficiais do Mercado Livre).
– Apontar promoções elegíveis da categoria que ainda não foram ativadas para esse anúncio.
– Criar um simulador de preço e margem:
• Campo para escolha de desconto (porcentagem ou valor)
• Recalcular preço de venda, comissão, impostos estimados e lucro
• Mostrar visualmente a margem antes e depois da promoção

MÓDULO 7 – HISTÓRICO, RELATÓRIOS E EXPORTAÇÃO
– Gravar em banco de dados cada análise feita por anúncio.
– Permitir ao usuário abrir um painel web com:
• Histórico de métricas do anúncio
• Evolução de posição em palavras-chave
• Histórico de estoque e preço
• Histórico de campanhas de Ads e resultados
– Criar opção de exportar relatórios em CSV ou planilha para Excel, tanto via interface web quanto via botão na extensão.

MÓDULO 8 – CONFIGURAÇÕES E USABILIDADE
– Configurações gerais por usuário:
• Idioma padrão: pt-BR
• Percentual de imposto padrão para cálculo de margem
• Custo médio de frete, custo de embalagem etc.
• Horário padrão para atualizações automáticas de dados em lote
– Criar sistema de papéis:
• Usuário administrador (dono da conta)
• Usuário colaborador (pode consultar, mas não alterar configurações críticas)
– Interface visual:
• Layout moderno, limpo e de fácil leitura, com card para cada bloco de informação
• Destaque em cores para alertas de risco (estoque baixo, fotos ruins, queda de vendas)
• Manter identidade neutra para permitir futura personalização de marca

SEGURANÇA E PERFORMANCE
– Armazenar tokens OAuth do Mercado Livre de forma criptografada.
– Não expor tokens diretamente na extensão; toda chamada sensível à API do Mercado Livre deve passar pelo back-end.
– Implementar controle de uso e limites de chamada à API, com logs e tratamento de erros amigável.
– Prever paginação e cache de resultados para não sobrecarregar a API nem deixar a extensão lenta.

ROADMAP DE VERSÕES
– Versão 1.0:
• Autenticação
• Integração básica com Mercado Livre
• Extensão com painel do anúncio, estoque, qualidade, ranking de palavras-chave simples e relatório básico
– Versão 1.1:
• Módulo de concorrência
• Exportação de dados
– Versão 1.2:
• Tendências e gráficos
• Módulo avançado de publicidade
• Central de promoções com simulador de margem

ENTREGA ESPERADA PELO LOVABLE
– Gerar toda a estrutura do projeto (back-end, front-end web e extensão do Chrome) já conectada.
– Documentar os principais endpoints da API interna que a extensão utiliza.
– Providenciar instruções claras para:
• Instalar e rodar o back-end
• Executar o front-end web
• Instalar a extensão em modo desenvolvedor no Chrome
– O código gerado deve ser modular, facilitando futuras integrações com outras fontes de dados e novas funcionalidades de análise.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mlfacil2.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/eedfb6c9-8661-4bb0-8bfb-6b322127a4e2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
