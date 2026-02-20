
# Configuracoes do Seller: Menu Vertical para Horizontal (Estilo Admin)

## Resumo

Transformar a pagina de Configuracoes (/settings) de menu vertical lateral para navegacao por abas horizontais, seguindo o mesmo padrao ja implementado no Admin.

---

## Estrutura atual do menu vertical

O menu atual possui 5 grupos com subitens aninhados (ate 3 niveis):

```text
MINHA CONTA
  Perfil
  Seguranca
  Sessoes Ativas
  Preferencias
    Idioma
    Notificacoes
    Fuso Horario
    Mensagem do Dia

EQUIPE
  Colaboradores
  Perfis de Acesso

SISTEMA
  Personalizacao (Cores, Logotipo, Nome da Empresa)
  Aparencia (Tema Claro/Escuro)
  Privacidade e LGPD (Consentimentos, Exportacao de Dados)
  Utilidades (Chaves de API, Webhooks, Logs)

FINANCEIRO
  Plano
  Faturamento
  Historico de Pagamentos
  Empresas e Contas

SUPORTE
  Abrir Chamado
  Base de Conhecimento
  Status do Sistema
```

---

## Nova estrutura: Abas horizontais

Cada item folha (com rota ou componente) vira uma aba horizontal. Itens pais sem rota (como "Preferencias", "Personalizacao") serao achatados -- seus filhos sobem como abas diretas.

Abas propostas (agrupadas visualmente por separador ou ordem logica):

| Aba | Slug | Componente |
|---|---|---|
| Perfil | perfil | SettingsProfile |
| Seguranca | seguranca | Placeholder |
| Sessoes | sessoes-ativas | Placeholder |
| Idioma | idioma | SettingsLanguage |
| Notificacoes | notificacoes | Placeholder |
| Colaboradores | colaboradores | CollaboratorsCard |
| Perfis de Acesso | perfis-acesso | SettingsAccessProfiles |
| Personalizacao | personalizacao | SettingsCustomization |
| Aparencia | aparencia | SettingsTemplates |
| Privacidade | privacidade-lgpd | SettingsPrivacy |
| Utilidades | utilidades | SettingsUtilities |
| Plano | plano | SettingsPlan |
| Faturamento | faturamento | SettingsBilling |
| Empresas | empresas-contas | SettingsCompanies |
| Suporte | abrir-chamado | SettingsSupport |
| Msg do Dia | mensagem-do-dia | SettingsDailyMessage |

Itens sem componente (Fuso Horario, Chaves de API, Webhooks, Logs, Historico Pagamentos, Base de Conhecimento, Status do Sistema, Nome da Empresa, Logotipo, Exportacao de Dados, Consentimentos, Tema) nao precisam de aba separada -- ja sao cobertos pelos componentes pais (ex: "Utilidades" ja inclui Chaves API/Webhooks/Logs, "Personalizacao" ja inclui Cores/Logotipo).

---

## Detalhes tecnicos

### Alteracao em SettingsLayout.tsx

1. **Remover** o menu vertical lateral (aside com ScrollArea e toda a logica de renderizacao de grupos/itens colapsaveis)
2. **Substituir** por um bloco de abas horizontais usando `Tabs`/`TabsList`/`TabsTrigger` (mesmo padrao do Admin.tsx)
3. Cada aba usa icone + label, e ao clicar altera o `searchParams` `section`
4. O conteudo renderiza o componente mapeado pela aba ativa (mesma logica atual do COMPONENT_MAP)
5. A barra de abas tera `overflow-x-auto` para scroll horizontal em telas menores

### Codigo sera inspirado no Admin.tsx

```text
const settingsTabs = [
  { id: 'perfil', label: 'Perfil', icon: User },
  { id: 'seguranca', label: 'Seguranca', icon: Shield },
  ...
];

<Tabs value={activeSlug}>
  <TabsList className="h-auto p-1 flex flex-wrap gap-1">
    {settingsTabs.map(tab => (
      <TabsTrigger onClick={() => setActiveSlug(tab.id)} ...>
        <tab.icon /> {tab.label}
      </TabsTrigger>
    ))}
  </TabsList>
</Tabs>

{ActiveComponent ? <ActiveComponent /> : <PlaceholderContent />}
```

### Sem alteracao no banco de dados

Os dados em `config_menu_groups` e `config_menu_items` permanecem intactos. O `useConfigMenu` hook continua disponivel, mas o SettingsLayout nao precisara mais consumi-lo -- as abas serao definidas estaticamente no componente (mesmo padrao do Admin.tsx), o que e mais simples e previsivel.

### Nenhuma rota sera perdida

Todas as rotas existentes continuam funcionando via o parametro `?section=slug`. Os componentes mapeados permanecem os mesmos.
