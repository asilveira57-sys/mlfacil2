

## Logomarca da Empresa — Upload, Padrões de Relatório e Repetição

### O que será feito

1. **Seção de logomarca no card de cada empresa** (dentro do accordion em `SettingsCompanies.tsx`)
   - Exibição da logo atual (ou placeholder com ícone)
   - Botão para upload de nova logo (PNG ou SVG, máx 2MB)
   - Preview com dimensões recomendadas para relatórios
   - Botão para remover logo

2. **Padrões de medida para relatórios**
   - Dimensões de exibição padronizadas: 200×60px (header de relatório), 120×36px (rodapé)
   - Preview visual mostrando como a logo ficará no relatório (caixa com proporção fixa)
   - Ajuste automático com `object-contain` para preservar proporção

3. **Opção "Repetir logo em todas as empresas"**
   - Checkbox que, ao marcar, copia a logo da empresa atual para todas as outras empresas do usuário
   - Atualiza `logo_url` e `logo_original_url` de todas as companies do mesmo `user_id`

### Arquivos a alterar

- **`src/components/settings/SettingsCompanies.tsx`** — Adicionar seção de logo dentro do accordion de cada empresa, com:
  - Componente `CompanyLogoSection` inline ou extraído
  - Upload via `useCompanyLogoUpload` (já existente)
  - Preview em caixas de dimensão fixa (200×60, 120×36)
  - Checkbox "Usar esta logo em todas as empresas" que chama update em batch
  - Botão remover logo (seta `logo_url` para null)

- **`src/hooks/useCompanyLogoUpload.ts`** — Adicionar função `applyLogoToAll(userId, logoUrl)` que faz update em batch de todas as companies do usuário. Também adicionar `removeLogo(companyId)`.

### Detalhes técnicos

- Bucket `company-logos` já existe e é público
- Colunas `logo_url`, `logo_original_url`, `logo_uploaded_at` já existem na tabela `companies`
- Não é necessária migração SQL
- O hook `useCompanyLogoUpload` já valida formato (PNG/SVG), tamanho (2MB) e dimensões mínimas (400×120px)
- A seção de logo ficará entre o header da empresa e a seção de contas ML, dentro do `AccordionContent`

