# ML Analyzer Pro - Projeto Completo

Sistema completo de análise de anúncios do Mercado Livre com backend, frontend web e extensão Chrome.

## 🎯 Arquitetura

```
ml-analyzer-pro/
├── src/                          # Frontend Web (React + TypeScript)
│   ├── pages/
│   │   ├── Index.tsx            # Landing page
│   │   ├── Auth.tsx             # Login/Registro
│   │   └── Dashboard.tsx        # Dashboard principal
│   └── integrations/
│       └── supabase/            # Cliente Supabase (auto-gerado)
│
├── supabase/
│   └── functions/               # Edge Functions (Backend)
│       ├── ml-auth-url/         # Gera URL de OAuth do ML
│       ├── ml-oauth-callback/   # Processa callback OAuth
│       └── ml-get-item/         # Busca dados do anúncio
│
└── chrome-extension/            # Extensão do Chrome
    ├── manifest.json
    ├── content.js               # Script das páginas ML
    ├── background.js            # Service Worker
    └── popup.html/js            # Interface da extensão
```

## 🚀 Setup Inicial

### 1. Backend (Lovable Cloud)
- ✅ Já configurado e conectado
- ✅ Banco de dados criado com tabelas:
  - `profiles` - Perfis de usuários
  - `ml_accounts` - Contas ML vinculadas
  - `analyzed_items` - Anúncios analisados
  - `item_metrics` - Métricas detalhadas
  - `keywords_tracking` - Palavras-chave
- ✅ Secrets configurados: `ML_APP_ID`, `ML_SECRET_KEY`

### 2. Credenciais do Mercado Livre

Você precisa criar um aplicativo no Mercado Livre:

1. Acesse: https://developers.mercadolivre.com.br/
2. Crie uma aplicação
3. Configure Redirect URI: `https://jkyemuypfgldrvquehlb.supabase.co/functions/v1/ml-oauth-callback`
4. As credenciais já foram salvas como secrets

### 3. Políticas RLS (IMPORTANTE!)

Execute este SQL manualmente no backend:

```sql
-- Profiles
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ML Accounts
CREATE POLICY ml_accounts_all ON public.ml_accounts FOR ALL USING (auth.uid() = user_id);

-- Analyzed Items
CREATE POLICY analyzed_items_all ON public.analyzed_items FOR ALL USING (auth.uid() = user_id);

-- Item Metrics
CREATE POLICY item_metrics_select ON public.item_metrics FOR SELECT 
USING (EXISTS (SELECT 1 FROM analyzed_items WHERE analyzed_items.id = item_metrics.analyzed_item_id AND analyzed_items.user_id = auth.uid()));

CREATE POLICY item_metrics_insert ON public.item_metrics FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM analyzed_items WHERE analyzed_items.id = item_metrics.analyzed_item_id AND analyzed_items.user_id = auth.uid()));

-- Keywords
CREATE POLICY keywords_all ON public.keywords_tracking FOR ALL 
USING (EXISTS (SELECT 1 FROM analyzed_items WHERE analyzed_items.id = keywords_tracking.analyzed_item_id AND analyzed_items.user_id = auth.uid()));
```

### 4. Extensão Chrome

1. Navegue até `chrome-extension/`
2. Edite os arquivos substituindo as URLs:
   - `content.js`: Adicione URL do Supabase e anon key
   - `background.js` e `popup.js`: Adicione URL da aplicação web
3. Adicione ícones na pasta `icons/`
4. Carregue em `chrome://extensions/`

## 📖 Como Usar

1. **Criar Conta:** Acesse a aplicação web e registre-se
2. **Conectar ML:** No dashboard, clique em "Conectar Mercado Livre"
3. **Instalar Extensão:** Baixe e instale a extensão do Chrome
4. **Analisar:** Navegue em produtos do ML e veja análises no painel lateral

## 🔄 Fluxo OAuth Mercado Livre

1. Usuário clica "Conectar ML" → chama `ml-auth-url`
2. Redireciona para OAuth do ML
3. Após autorização → callback em `ml-oauth-callback`
4. Tokens salvos em `ml_accounts`
5. Extensão usa tokens para buscar dados via `ml-get-item`

## 📊 Próximas Implementações

**Módulo 2 - SEO e Ranking:**
- Sistema de palavras-chave por anúncio
- Busca automática de posições
- Histórico de ranking

**Módulo 3 - Concorrência:**
- Identificação automática de concorrentes
- Comparativos de preço, reputação, vendas
- Alertas de mudanças

**Módulo 4 - Tendências:**
- Gráficos históricos
- Análise de categoria
- Palavras-chave em alta

**Módulo 5 - Publicidade (Mercado Ads):**
- Integração com API de Ads
- Métricas de campanhas
- ACOS e ROAS

**Módulo 6 - Promoções:**
- Promoções ativas
- Simulador de margem
- Promoções elegíveis

## 🎨 Design System

O projeto usa um design system profissional com:
- Paleta Navy Blue e Cyan para dados analíticos
- Gradientes suaves
- Sombras elevadas
- Transições fluidas
- Totalmente responsivo

## 📞 Suporte

Documentação completa: https://docs.lovable.dev

---

**Status Atual:** MVP funcional com autenticação, OAuth ML, análise básica e extensão Chrome pronta para testes.
