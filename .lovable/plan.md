

## Mapa Completo de Custos — Lovable Cloud, IA e APIs Externas

Aqui está o levantamento completo de tudo que gera custo no sistema, organizado por categoria.

---

### 1. OpenAI API (custo direto — sua chave `OPENAI_API_KEY`)

Estas 4 edge functions fazem chamadas à `api.openai.com/v1/chat/completions` usando modelo `gpt-4o-mini`:

| Função | Uso | Frequência estimada |
|---|---|---|
| `ads-ai-consultant` | Análise estratégica de anúncios patrocinados | Sob demanda (botão do admin) |
| `blog-generate-article` | Geração de artigos para blog | Sob demanda |
| `generate-message-suggestions` | Geração de frases motivacionais ("Mensagem do Dia") | Sob demanda (com quota diária) |
| `post-sale-messages` | Melhoria de texto de mensagens pós-venda (action `suggest`) | Sob demanda |

**Custo**: ~$0.15/1M tokens input, ~$0.60/1M tokens output (gpt-4o-mini). Custo muito baixo por chamada.

---

### 2. Resend (e-mails transacionais e campanhas)

| Função | Uso |
|---|---|
| `email-worker-send` | Envio real de e-mails (onboarding, notificações, campanhas) |
| `email-test-provider` | Teste de configuração do provedor |

**Secret**: `RESEND_API_KEY`
**Custo**: Plano gratuito Resend = 100 emails/dia, 3.000/mês. Depois disso, pago.

---

### 3. Facebook Conversions API

| Função | Uso |
|---|---|
| `facebook-conversions` | Envia eventos server-side para o Pixel do Facebook |
| `facebook-get-pixel-id` | Retorna o Pixel ID configurado |

**Secrets**: `FACEBOOK_ACCESS_TOKEN`, `FACEBOOK_PIXEL_ID`
**Custo**: Gratuito (API do Facebook não cobra por envio de eventos).

---

### 4. OpenWeatherMap

| Função | Uso |
|---|---|
| `weather-api` | Busca clima atual para exibição no dashboard |

**Secret**: `OPENWEATHERMAP_API_KEY`
**Custo**: Plano gratuito = 1.000 chamadas/dia. Acima disso, pago.

---

### 5. Mercado Livre API (gratuito, mas consome Edge Function executions)

**64 edge functions** fazem chamadas à `api.mercadolibre.com`. Não há custo de API do ML, mas cada invocação consome:
- **Lovable Cloud edge function execution time** (ver item 7)

Funções mais pesadas (maior volume de chamadas ML):
- `ml-sync-orders`, `ml-sync-shipments`, `ml-sync-invoices`, `ml-sync-messages`
- `ml-sync-billing`, `ml-sync-real-costs`, `ml-sync-financial`
- `ads-sync`, `ads-connector-sync`, `ads-nightly-cache`
- `radiography-engine`, `wholesale-engine`, `competitor-engine`
- `qa-messages-polling-sync`, `orders-hourly-sync`, `orders-nightly-sync`

---

### 6. Mercado Pago API (gratuito, mas consome executions)

Funções que chamam `api.mercadopago.com`:
- `mp-sync-movements`, `mp-sync-payments`, `mp-sync-price`
- `mp-sync-tenant-plans`, `mp-token-refresh`
- `mercadopago-checkout`, `mercadopago-webhook`
- `billing-checkout`, `billing-periodic-sync`

---

### 7. Lovable Cloud — Consumo Base

Itens que geram custo no Lovable Cloud independente de IA:

| Recurso | O que consome |
|---|---|
| **Database (Postgres)** | Armazenamento de dados, todas as tabelas, RLS, RPCs |
| **Edge Functions** | Cada invocação = tempo de execução (110+ functions no projeto) |
| **Storage** | Bucket `template-assets` (usado por templates) |
| **Auth** | Cada signup/login/token refresh conta como auth request |
| **Realtime** | Tabelas com realtime habilitado (se houver) |
| **pg_cron jobs** | `billing-periodic-sync` roda a cada 30min, mais qualquer outro cron configurado |

---

### 8. Lovable AI Gateway (LOVABLE_API_KEY)

Após a migração, **apenas 1 uso restante**:

| Função | Uso | Consome créditos IA? |
|---|---|---|
| `auth-email-hook` | Autenticação de webhook de e-mail | **NÃO** — usa a key apenas para verificação de assinatura, não faz chamada de IA |

**Resultado: Zero consumo de créditos Lovable AI no momento.**

---

### Resumo de Custos Variáveis

| Provedor | Secret | Custo |
|---|---|---|
| **OpenAI** | `OPENAI_API_KEY` | Por token (muito baixo com gpt-4o-mini) |
| **Resend** | `RESEND_API_KEY` | Gratuito até 3k emails/mês |
| **Facebook** | `FACEBOOK_ACCESS_TOKEN` | Gratuito |
| **OpenWeatherMap** | `OPENWEATHERMAP_API_KEY` | Gratuito até 1k/dia |
| **Mercado Livre** | Token OAuth | Gratuito |
| **Mercado Pago** | Token OAuth | Gratuito |
| **Lovable Cloud** | — | Database + Auth + Edge executions + Storage |
| **Lovable AI** | `LOVABLE_API_KEY` | **Zero** (não usado para IA) |

