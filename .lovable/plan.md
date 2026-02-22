
# Feriados Brasileiros com Localizacao - Implementacao

## Resumo

Importar feriados nacionais, estaduais e municipais do repositorio joaopbini/feriados-brasil, filtrados pela localizacao (estado + municipio) configurada pelo usuario.

## Etapas

### 1. Criar 3 novas tabelas no banco de dados

- **br_estados**: 27 registros (uf PK, codigo_uf, nome, latitude, longitude, regiao)
- **br_municipios**: ~5.570 registros (codigo_ibge PK, nome, capital, uf FK, ddd, fuso_horario)
- **br_feriados**: ~10.000 registros/ano (data, nome, tipo [NACIONAL/ESTADUAL/MUNICIPAL/FACULTATIVO], uf, codigo_ibge, ano)
- Adicionar colunas `uf` e `codigo_ibge` na tabela `social_calendar_user_preferences`
- RLS: SELECT para authenticated em todas as 3 tabelas
- Indices: data, ano, tipo, uf, codigo_ibge para consultas rapidas

### 2. Edge Function `sync-br-holidays`

Funcao backend que busca os JSONs do GitHub e faz upsert no banco:
- `dados/localizacao/estados/estados.json` -> br_estados
- `dados/localizacao/municipios/municipios.json` -> br_municipios
- `dados/feriados/nacional/json/{ano}.json` -> br_feriados
- `dados/feriados/estadual/json/{ano}.json` -> br_feriados
- `dados/feriados/municipal/json/{ano}.json` -> br_feriados

Processamento em batches de 500 registros (sem limite de registros). Parse de datas DD/MM/YYYY para YYYY-MM-DD.

### 3. Hooks de dados (`useSocialCalendar.ts`)

- `useBrEstados()`: busca todos os 27 estados da tabela br_estados
- `useBrMunicipios(uf)`: busca municipios filtrados por UF (usando fetchAllRows para garantir sem limite)
- `useBrFeriados(month, uf, codigoIbge)`: busca feriados do mes filtrados por:
  - NACIONAL (sempre)
  - ESTADUAL (se uf configurado)
  - MUNICIPAL (se codigo_ibge configurado)
  - Retorna como SocialCalendarEvent[] para merge no grid
- Atualizar tipo UserPreferences para incluir uf e codigo_ibge

### 4. Tela de Configuracoes (`SocialCalendarSettings.tsx`)

Substituir o select de "Pais" por:
- **Estado**: Select com os 27 estados ordenados por nome
- **Municipio**: Select filtrado pelo estado, com campo de busca (sao ~600+ municipios por estado)
- Ao trocar estado, municipio e resetado
- Salvar uf e codigo_ibge nas preferencias

### 5. Calendario (`SocialCalendarMainView.tsx`)

- Usar o novo hook `useBrFeriados` para buscar feriados do mes
- Mergear com eventos existentes (tematicas/comerciais/sazonais)
- Feriados brasileiros aparecem com categoria `feriado` e cor vermelha

## Detalhes Tecnicos

### Estrutura dos dados do GitHub

Feriados:
```text
{ "data": "DD/MM/YYYY", "nome": "...", "tipo": "NACIONAL|ESTADUAL|MUNICIPAL", "descricao": "...", "uf": "SP"|null, "codigo_ibge": 3550308|null }
```

Municipios:
```text
{ "codigo_ibge": 3550308, "nome": "Sao Paulo", "capital": true, "codigo_uf": 35, "uf": "SP", "ddd": 11, ... }
```

### Volume e paginacao

- br_municipios: ~5.570 registros -> usar fetchAllRows no hook
- br_feriados por mes+filtro: tipicamente 11 nacionais + 3-5 estaduais + 2-4 municipais = ~18 registros (sem risco de limite)
- Import total municipal: ~9.600 registros -> processados em batches de 500 na edge function

### Arquivos a criar
- `supabase/migrations/20260222100000_br_holidays_tables.sql`
- `supabase/functions/sync-br-holidays/index.ts`
- Entrada em `supabase/config.toml` para verify_jwt = false

### Arquivos a modificar
- `src/hooks/useSocialCalendar.ts` (novos hooks + tipo atualizado)
- `src/components/social-calendar/SocialCalendarSettings.tsx` (selects UF/municipio)
- `src/components/social-calendar/SocialCalendarMainView.tsx` (merge feriados BR)
