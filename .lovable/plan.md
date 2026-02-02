
# Plan: Fix Missing 6th Plan and Multi-language for Plans Page

## Issues Identified

### Issue 1: Missing 6th Plan ("Acima de 3000 vendas")

**Root Cause**: The `useTierPlans` hook uses this query:
```typescript
supabase.from('public_plans_v1').select('*').eq('visible', true)
```

The "Acima de 3000 vendas" plan exists in the database but has NO associated prices. In the `public_plans_v1` view, the `visible` column comes from the `plan_prices` table via a LEFT JOIN. Since there are no prices, `visible` is `null`, not `true`, so the plan gets filtered out.

**Solution**: Modify the query in `useTierPlans.ts` to use a filter that accepts both `visible = true` OR `visible IS NULL` (for consultation plans without prices).

### Issue 2: Multi-language Not Working for Plans Page

**Root Cause**: The `Planos.tsx` page has many hardcoded Portuguese strings that should use the i18n translation system:
- "Planos e Preços" (line 142)
- "Escolha o plano ideal para o seu negócio." (line 145)
- "Planos baseados no volume mensal de vendas" (line 171)
- "Pagamento Antecipado" (line 190)
- "Assinatura Recorrente" (line 199)
- "Mensal", "Trimestral", "Semestral" (lines 218-220)
- "Precisa de mais?" (line 271)
- And many more...

Additionally, plan names and descriptions come from the database (`plan.name`, `plan.description`), which are stored in Portuguese only.

**Solution**: 
1. Update `Planos.tsx` to use `useTranslation` hook for all static UI strings
2. For dynamic plan content (names, features), create translation keys in the i18n files and use them as fallbacks when database content doesn't have a translation

---

## Technical Implementation

### Task 1: Fix Query to Include Consultation Plans

**File**: `src/hooks/useTierPlans.ts`

Change the query filter from:
```typescript
.eq('visible', true)
```

To use an OR filter that accepts visible=true OR visible IS NULL:
```typescript
.or('visible.eq.true,visible.is.null')
```

This will include plans without prices (like "Acima de 3000 vendas").

---

### Task 2: Add i18n to Planos.tsx

**File**: `src/pages/Planos.tsx`

Add `useTranslation` hook and replace all hardcoded Portuguese strings:

| Current Text | Translation Key |
|-------------|-----------------|
| "Planos e Preços" | `planos.title` |
| "Escolha o plano ideal para o seu negócio." | `planos.subtitle` |
| "Teste grátis por X dias, sem cartão." | `planos.trial_info` |
| "Planos baseados no volume mensal de vendas" | `planos.volume_title` |
| "A cobrança considera a média mensal..." | `planos.volume_subtitle` |
| "Pagamento Antecipado" | `planos.mode_prepaid` |
| "Assinatura Recorrente" | `planos.mode_recurring` |
| "Mensal" | `planos.period_monthly` |
| "Trimestral" | `planos.period_quarterly` |
| "Semestral" | `planos.period_semiannual` |
| "Precisa de mais?" | `planos.enterprise_title` |
| "Plano personalizado para alto volume" | `planos.enterprise_subtitle` |
| "Falar com especialista" | `planos.enterprise_cta` |
| "Pronto para começar?" | `planos.ready_title` |
| "Voltar ao início" | `planos.back_home` |

---

### Task 3: Add Plan-Specific Translations to Locale Files

**Files**: `src/locales/[pt-BR|en|es]/landing.json`

Add translations for plan names, descriptions, and features. Since plans come from the database in Portuguese, we'll create i18n keys that map to each plan slug:

```json
{
  "plan_names": {
    "ate-50-vendas": "Up to 50 sales",
    "51-300-vendas": "51 to 300 sales",
    "301-700-vendas": "301 to 700 sales",
    "701-1500-vendas": "701 to 1500 sales",
    "1501-3000-vendas": "1501 to 3000 sales",
    "acima-3000-vendas": "Over 3000 sales"
  },
  "plan_descriptions": {
    "ate-50-vendas": "Ideal for beginners",
    "51-300-vendas": "For growing sellers",
    ...
  },
  "plan_features": {
    "dashboard_completo": "Complete dashboard",
    "sincronizacao_automatica": "Automatic sync",
    "relatorios_basicos": "Basic reports",
    ...
  }
}
```

---

### Task 4: Update TierPlanCard to Use Translations

**File**: `src/components/pricing/TierPlanCard.tsx`

Modify the component to:
1. Use translated plan names based on `plan.slug`
2. Use translated plan descriptions
3. Use translated features (map each feature to a translation key)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useTierPlans.ts` | Change visible filter to include null values |
| `src/pages/Planos.tsx` | Add useTranslation, replace all hardcoded strings |
| `src/components/pricing/TierPlanCard.tsx` | Use translated plan names/descriptions/features |
| `src/locales/pt-BR/landing.json` | Add plan_names, plan_descriptions, plan_features |
| `src/locales/en/landing.json` | Add plan_names, plan_descriptions, plan_features |
| `src/locales/es/landing.json` | Add plan_names, plan_descriptions, plan_features |

---

## Order of Implementation

1. **Fix useTierPlans query** - Quick fix to show 6th plan
2. **Update Planos.tsx with i18n** - Replace hardcoded strings
3. **Add plan translations to locale files** - Plan names/descriptions/features
4. **Update TierPlanCard** - Use translated content

---

## Expected Outcome

After implementation:
- All 6 volume plans will appear on the /planos page, including "Acima de 3000 vendas"
- The 6th plan will show "Consulte-nos" (or translated equivalent) instead of a price
- All UI text on the plans page will respond to language changes
- Plan names, descriptions, and features will be translated when switching languages
