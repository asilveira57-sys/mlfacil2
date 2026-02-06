

# Plano: Aba "Utilidades" em Configuracoes + Clima Real via API

## Resumo

Adicionar uma aba "Utilidades" na pagina de Configuracoes com controles completos para cada widget (relogio, clima, calculadora), e substituir os dados mock do clima por dados reais via OpenWeatherMap.

---

## O que sera feito

### 1. Nova aba "Utilidades" em Configuracoes

Uma nova aba com icone de engrenagem/ferramenta sera adicionada a pagina de Configuracoes, contendo 3 secoes (cards):

**Card Relogio:**
- Toggle "Exibir no header" (liga/desliga o widget)
- Seletor de fuso horario (dropdown com os principais fusos)
- Toggle de formato: 12 horas (AM/PM) ou 24 horas

**Card Clima:**
- Toggle "Exibir no header" (liga/desliga o widget)
- Campo de texto para cidade (ex: "Sao Paulo")
- Campo de texto para pais (ex: "BR")

**Card Calculadora:**
- Toggle "Exibir no header" (liga/desliga)

Todas as preferencias sao persistidas na tabela `user_preferences` (colunas `widgets_enabled`, `widgets_layout`, `timezone`, `hour_format` que ja existem).

### 2. Edge Function `weather-api`

Nova funcao backend que:
- Recebe `city` e `country` como parametros
- Chama a API do OpenWeatherMap (`api.openweathermap.org/data/2.5/weather`)
- Retorna temperatura, sensacao termica, umidade, vento e condicao

Requer a chave `OPENWEATHERMAP_API_KEY` como secret (gratuita em openweathermap.org).

### 3. WeatherWidget com dados reais

O componente `WeatherWidget` deixara de usar `generateMockWeather()` e passara a chamar a edge function `weather-api`. A cidade vira das preferencias do usuario.

### 4. HeaderUtilities atualizado

Passara a cidade configurada pelo usuario para o `WeatherWidget` em vez do valor fixo "Sao Paulo".

---

## Detalhamento Tecnico

### Migracao SQL

Nenhuma necessaria. A cidade do clima sera armazenada dentro do campo JSONB `widgets_layout` que ja existe:

```text
widgets_layout: {
  order: ["clock", "weather", "calculator"],
  positions: {},
  weatherCity: "São Paulo",    // NOVO
  weatherCountry: "BR"         // NOVO
}
```

### Arquivos criados

| Arquivo | Descricao |
|---------|-----------|
| `src/components/settings/SettingsUtilities.tsx` | Componente da aba com 3 cards de configuracao |
| `supabase/functions/weather-api/index.ts` | Edge function proxy para OpenWeatherMap |

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/Settings.tsx` | Adicionar aba "Utilidades" com icone Wrench |
| `src/hooks/useUtilitiesPreferences.ts` | Adicionar `weatherCity` e `weatherCountry` ao interface e ao load/save |
| `src/components/utilities/WeatherWidget.tsx` | Substituir mock por chamada a edge function |
| `src/components/utilities/HeaderUtilities.tsx` | Passar cidade das preferencias ao WeatherWidget |
| `supabase/config.toml` | Registrar `[functions.weather-api]` |

### Arquivos NAO modificados

- Nenhuma migracao SQL
- ClockWidget.tsx (ja funciona corretamente)
- CalculatorWidget.tsx (ja funciona corretamente)
- Arquivos de traducao (chaves ja existem nos 3 idiomas)
- Nenhum outro modulo (Tendencias, Promocoes, ADS, etc.)

### Secret necessario

Sera solicitada a chave `OPENWEATHERMAP_API_KEY`:
- Obtida gratuitamente em https://openweathermap.org/api (plano Free)
- Limite: 1.000 chamadas/dia (mais que suficiente)
- O usuario precisara criar uma conta e gerar a API key

### Fluxo da Edge Function weather-api

```text
Frontend (WeatherWidget)
  -> supabase.functions.invoke('weather-api', { body: { city, country } })
    -> Edge Function
      -> fetch('https://api.openweathermap.org/data/2.5/weather?q={city},{country}&appid={KEY}&units=metric')
      -> Retorna { temperature, feelsLike, humidity, windSpeed, condition, city }
    <- Response JSON
  <- setWeather(data)
```

### Detalhe do SettingsUtilities

O componente seguira o padrao visual do `SettingsLanguage` (Card com header + content), usando:
- `Switch` para toggles on/off
- `Select` para timezone e formato de hora
- `Input` para cidade e pais
- Salvamento automatico ao alterar qualquer campo (via `updatePreferences`)

---

## Resultado Esperado

- Aba "Utilidades" visivel em Configuracoes com todos os controles
- Relogio respeita timezone e formato escolhidos
- Clima mostra dados REAIS da cidade configurada
- Calculadora pode ser ligada/desligada do header
- Tudo persiste no banco e carrega ao reabrir

