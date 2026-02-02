
# Plan: Fix Scroll, Navigation, Missing Plan, and Multi-language Issues

## Summary of Issues Identified

Based on the user's screenshots and exploration of the codebase, there are 4 distinct issues to address:

1. **Scroll Position Issue**: When navigating to `/planos` or clicking "Comparar Planos", the page starts at the footer instead of the top
2. **Missing 6th Plan**: The "Consult-nos" plan for sellers with 3000+ monthly sales is missing from the grid
3. **Header Navigation Links Not Working**: On `/planos`, menu items like "Recursos", "Como funciona", "Integrações", "Suporte" are not clickable because they use anchor links (`#recursos`) which only work on the landing page
4. **Multi-language Not Working**: The LanguageSwitcher component is present, but the landing page content uses `SiteContentContext` (database-driven) instead of the i18n translation system, so language changes don't affect the displayed content

---

## Task 1: Fix Scroll Position on Navigation

**Problem**: React Router preserves scroll position when navigating between pages, causing users to land at the bottom of `/planos`.

**Solution**: Create a `ScrollToTop` component that resets scroll on route changes.

**Files to create/modify**:
- Create `src/components/ScrollToTop.tsx`
- Modify `src/App.tsx` to include the component inside `BrowserRouter`

```text
+---------------------------+
| BrowserRouter             |
|  +---------------------+  |
|  | ScrollToTop         |  |  <-- New component
|  +---------------------+  |
|  | Routes              |  |
|  +---------------------+  |
+---------------------------+
```

---

## Task 2: Add "Consult-nos" (6th Plan)

**Problem**: The database has 5 volume plans (up to 3000 sales) but no plan for high-volume sellers (3000+).

**Database change required**:
- Insert a new plan in the `plans` table with `sort_order: 6`, category `volume`, slug `acima-3000-vendas`
- This plan will NOT have prices (it's a "contact us" type)

**Frontend changes**:
- Modify `TierPlanCard.tsx` to handle plans without prices (show "Falar com vendas" instead of price)
- Modify `Planos.tsx` to show a special card for consultation-based plans

---

## Task 3: Fix Header Navigation on /planos

**Problem**: The `LandingHeader` uses anchor links (`#recursos`, `#como-funciona`) which work on the landing page but not on `/planos` because those sections don't exist on that page.

**Solution**: Modify navigation logic to:
1. If on landing page (`/`) and clicking anchor link: scroll to section
2. If on any other page and clicking anchor link: navigate to landing page with anchor (e.g., `/#recursos`)

**File to modify**:
- `src/components/landing/LandingHeader.tsx`

---

## Task 4: Implement Multi-language for Landing/Planos

**Problem**: The landing page and plans page use `SiteContentContext` which fetches content from the `site_content` database table. This content is Portuguese-only. The i18n system exists but only has translation files for internal app components, not for landing content.

**Solution** (Two-phase approach):

**Phase 1 (Recommended - Quick Fix)**:
Create translation files for landing content and use the `useTranslation` hook instead of `getText` from SiteContentContext.

**Files to create**:
- `src/locales/pt-BR/landing.json`
- `src/locales/en/landing.json`  
- `src/locales/es/landing.json`

**Files to modify**:
- `src/lib/i18n/index.ts` - Add `landing` namespace
- All landing components (`LandingHeader`, `LandingHero`, `LandingBenefits`, etc.) - Replace `getText()` with `t()` from i18n
- `src/pages/Planos.tsx` - Use i18n for static strings

---

## Technical Implementation Details

### 1. ScrollToTop Component
```typescript
// src/components/ScrollToTop.tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
};
```

### 2. Database Migration for 6th Plan
```sql
-- Insert consultation plan for 3000+ sales
INSERT INTO plans (id, slug, name, category, sort_order, description)
VALUES (
  gen_random_uuid(),
  'acima-3000-vendas',
  'Acima de 3000 vendas',
  'volume',
  6,
  'Plano sob consulta para operações enterprise'
);
```

### 3. Navigation Fix Logic
```typescript
// Updated handleNavClick in LandingHeader
const handleNavClick = (href: string) => {
  setMobileMenuOpen(false);
  if (href.startsWith("#")) {
    // If we're on the landing page, scroll to section
    if (window.location.pathname === "/" || window.location.pathname === "/home") {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      // Navigate to landing page with hash
      navigate(`/${href}`);
    }
  } else {
    navigate(href);
  }
};
```

### 4. i18n Landing Namespace Structure
```json
// Example: src/locales/en/landing.json
{
  "header": {
    "resources": "Resources",
    "how_it_works": "How it Works",
    "integrations": "Integrations",
    "plans": "Plans",
    "blog": "Blog",
    "support": "Support",
    "login": "Sign In",
    "create_account": "Create Account"
  },
  "hero": {
    "badge": "Complete platform for Mercado Livre sellers",
    "title": "Smart management to scale your sales",
    "subtitle": "Centralize operations, monitor performance and make data-driven decisions."
  }
  // ... more translations
}
```

---

## Files to Create
| File | Purpose |
|------|---------|
| `src/components/ScrollToTop.tsx` | Scroll reset on navigation |
| `src/locales/pt-BR/landing.json` | Portuguese landing translations |
| `src/locales/en/landing.json` | English landing translations |
| `src/locales/es/landing.json` | Spanish landing translations |

## Files to Modify
| File | Changes |
|------|---------|
| `src/App.tsx` | Add ScrollToTop component |
| `src/lib/i18n/index.ts` | Add `landing` namespace |
| `src/components/landing/LandingHeader.tsx` | Fix navigation + use i18n |
| `src/components/landing/LandingHero.tsx` | Use i18n instead of SiteContent |
| `src/components/landing/LandingBenefits.tsx` | Use i18n |
| `src/components/landing/LandingModules.tsx` | Use i18n |
| `src/components/landing/LandingHowItWorks.tsx` | Use i18n |
| `src/components/landing/LandingIntegrations.tsx` | Use i18n |
| `src/components/landing/LandingDemo.tsx` | Use i18n |
| `src/components/landing/LandingPricing.tsx` | Use i18n |
| `src/components/landing/LandingTestimonials.tsx` | Use i18n |
| `src/components/landing/LandingFAQ.tsx` | Use i18n |
| `src/components/landing/LandingCTA.tsx` | Use i18n |
| `src/components/landing/LandingFooter.tsx` | Use i18n |
| `src/pages/Planos.tsx` | Use i18n + add consultation plan card |
| `src/components/pricing/TierPlanCard.tsx` | Handle plans without prices |

## Database Changes
- Insert 1 new row in `plans` table for "Acima de 3000 vendas" consultation plan

---

## Order of Implementation

1. **ScrollToTop** (quick fix, immediate user impact)
2. **Navigation Links Fix** (quick fix, improves UX)
3. **Add 6th Plan to Database** (requires migration)
4. **Multi-language for Landing** (larger task, requires creating 3 translation files + updating ~12 components)

---

## Notes

- The `SiteContentContext` will be kept for admin-editable content (like images and CMS-managed text), but static UI strings will use i18n
- The 6th plan will show "Falar com vendas" button that links to a contact page or WhatsApp (user to define later)
- All translation keys will mirror the structure in `siteDefaultTexts.ts` for easy migration
