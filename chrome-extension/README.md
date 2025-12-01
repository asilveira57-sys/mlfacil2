# ML Analyzer Pro - Chrome Extension

Extensão do Chrome para análise profissional de anúncios do Mercado Livre em tempo real.

## 🚀 Instalação para Desenvolvimento

1. **Clone o repositório** e navegue até a pasta `chrome-extension/`

2. **Configure as URLs:**
   - Abra o arquivo `content.js` e substitua:
     - `YOUR_SUPABASE_URL` pela URL do seu projeto Supabase
     - `YOUR_SUPABASE_ANON_KEY` pela chave anônima do Supabase
   
   - Abra os arquivos `background.js` e `popup.js` e substitua:
     - `YOUR_APP_URL` pela URL da sua aplicação web

3. **Adicione os ícones:**
   - Crie uma pasta `icons/` dentro de `chrome-extension/`
   - Adicione os ícones nos tamanhos 16x16, 48x48 e 128x128 pixels
   - Nomeie-os como `icon16.png`, `icon48.png` e `icon128.png`

4. **Carregue a extensão no Chrome:**
   - Abra o Chrome e navegue até `chrome://extensions/`
   - Ative o "Modo do desenvolvedor" no canto superior direito
   - Clique em "Carregar sem compactação"
   - Selecione a pasta `chrome-extension/`

## 📋 Funcionalidades

### Versão 1.0

- ✅ Detecção automática de páginas de produtos do Mercado Livre
- ✅ Painel lateral com análise em tempo real
- ✅ Métricas básicas: preço, vendas, estoque, visitas
- ✅ Checklist de qualidade do anúncio
- ✅ Integração com API do backend

### Próximas Versões

- 🔄 Análise de palavras-chave e ranking
- 🔄 Comparação com concorrência
- 🔄 Análise de tendências
- 🔄 Análise financeira detalhada
- 🔄 Histórico e relatórios

## 🔧 Arquitetura

```
chrome-extension/
├── manifest.json        # Configuração da extensão
├── background.js        # Service Worker (background tasks)
├── content.js          # Script injetado nas páginas ML
├── popup.html          # Interface do popup da extensão
├── popup.js            # Lógica do popup
├── styles.css          # Estilos do painel lateral
├── icons/              # Ícones da extensão
└── README.md           # Esta documentação
```

## 🔐 Segurança

- Tokens de autenticação são armazenados localmente no Chrome
- Todas as chamadas à API são autenticadas
- Comunicação segura via HTTPS
- Permissions mínimas necessárias

## 🐛 Debug

Para debugar a extensão:

1. **Background Script:** `chrome://extensions/` → Detalhes da extensão → "Visualizar de service worker"
2. **Content Script:** Inspecionar a página → Console
3. **Popup:** Clicar com botão direito no popup → "Inspecionar"

## 📝 Notas de Desenvolvimento

### Como a extensão funciona:

1. **Detecção:** O `content.js` verifica se a URL atual é uma página de produto do ML
2. **Extração:** Extrai o ID do item da URL (ex: MLB123456789)
3. **API Call:** Envia o ID para o backend via edge function `ml-get-item`
4. **Renderização:** Exibe o painel lateral com as análises recebidas

### Estrutura de dados esperada:

```javascript
{
  success: true,
  item: {
    id: "MLB123456789",
    title: "Produto Exemplo",
    price: 99.90,
    available_quantity: 150,
    sold_quantity: 1234,
    pictures: [...],
    video_id: "xyz",
    // ... outros campos
  },
  visits: {
    total_visits: 5000,
    visits_7d: 500,
    visits_30d: 2000,
  },
  analyzedItemId: "uuid"
}
```

## 🔄 Próximos Passos

1. Implementar análise de concorrência
2. Adicionar gráficos de tendências
3. Implementar cache local de análises
4. Adicionar notificações de alertas
5. Criar opções de configuração
6. Implementar análise offline de dados salvos

## 📞 Suporte

Para problemas ou dúvidas, consulte a documentação completa do projeto ou entre em contato através do dashboard.
