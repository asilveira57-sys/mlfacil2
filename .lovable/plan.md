

# Plano: Remover modal redundante de Termos e registrar aceite no cadastro

## Problema

1. O seller já aceita os termos no formulário de cadastro (`/criar-acesso`), mas esse aceite **não é registrado** na tabela `user_consents`
2. Após confirmar o e-mail, o `TermsAcceptanceGate` exibe um modal redundante pedindo aceite novamente
3. A tela de auditoria de consentimentos (`SettingsPrivacy`) já existe no código e está mapeada como `privacidade-lgpd` no `SettingsLayout`, mas precisa estar acessível no menu de configurações do seller

## Correções

### 1. Registrar aceite dos termos no momento do cadastro

**Arquivo:** `src/pages/CriarAcesso.tsx`

Após o `signUp` bem-sucedido, chamar `recordConsentOnServer` para gravar o aceite na tabela `user_consents` com `source: 'signup'`. Como o usuário pode ainda não ter sessão confirmada nesse momento, uma alternativa é registrar o aceite no primeiro login (via `onAuthStateChange`) ou armazenar localmente e sincronizar depois.

Abordagem escolhida: salvar um flag no localStorage (`mktp_pending_terms_consent`) e sincronizar no primeiro login autenticado.

### 2. Sincronizar aceite pendente no login

**Arquivo:** `src/components/cookies/CookieConsentGate.tsx` (ou criar `src/lib/cookies/terms-sync.ts`)

No listener de `onAuthStateChange`, verificar se existe `mktp_pending_terms_consent` no localStorage. Se sim, chamar `recordConsentOnServer({ consent_scope: 'terms', consent_type: 'accepted', source: 'signup' })` e remover o flag.

### 3. Remover o TermsAcceptanceGate

**Arquivo:** `src/components/cookies/CookieConsentGate.tsx`

- Remover import e uso do `TermsAcceptanceGate` — o componente deixa de envolver os `children`
- O arquivo `TermsAcceptanceGate.tsx` pode ser mantido por segurança mas não será mais renderizado

### 4. Garantir que "Privacidade & LGPD" esteja no menu de configurações

**Verificação:** O componente `SettingsPrivacy` já está mapeado como `privacidade-lgpd` no `SettingsLayout`. Preciso verificar se existe um registro correspondente na tabela `config_menu_items` do banco de dados. Se não existir, criar via migration para que o item apareça no menu do seller.

## Arquivos modificados

- `src/pages/CriarAcesso.tsx` — marcar aceite pendente no localStorage
- `src/components/cookies/CookieConsentGate.tsx` — remover TermsAcceptanceGate, adicionar sync de termos pendentes
- `src/lib/cookies/terms-sync.ts` (novo) — lógica de sincronização do aceite de termos
- Possível migration para garantir item de menu `privacidade-lgpd` nas configurações

