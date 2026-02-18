import { LegalPageShell } from '@/components/legal/LegalPageShell';

const DEFAULT_COOKIES = `# 🍪 Política de Cookies – MKTP Fácil

**Última atualização: 18/02/2026**

## 1. O que são Cookies

Cookies são pequenos arquivos armazenados no navegador do usuário quando ele acessa um site ou sistema. Eles servem para melhorar a experiência de navegação, garantir segurança e permitir funcionamento adequado da plataforma.

## 2. Quem Somos

Esta Política aplica-se ao sistema operado por:

**MLFACIL CONSULTORIA E SISTEMAS LTDA**
- CNPJ: 52.833.264/0001-20
- Endereço: Rua Luiz Fernando Reis, nº 417
- Praia da Costa – Vila Velha – ES
- CEP: 29.101-120
- E-mail para contato: contato@mktpfacil.com

## 3. Tipos de Cookies Utilizados

O MKTP Fácil pode utilizar os seguintes tipos de cookies:

### 3.1 Cookies Essenciais

São necessários para o funcionamento da plataforma, incluindo:
- Autenticação de login
- Segurança da sessão
- Manutenção de acesso às contas
- Controle de multicontas

Sem esses cookies, o sistema pode não funcionar corretamente.

### 3.2 Cookies de Desempenho

Utilizados para:
- Medir desempenho do sistema
- Identificar erros técnicos
- Melhorar estabilidade e velocidade

Esses cookies não identificam o usuário diretamente.

### 3.3 Cookies de Funcionalidade

Permitem:
- Salvar preferências do usuário
- Manter configurações personalizadas
- Armazenar dados temporários de navegação

### 3.4 Cookies de Análise

Podem ser utilizados para:
- Avaliar uso da plataforma
- Entender comportamento agregado dos usuários
- Melhorar funcionalidades futuras

## 4. Cookies de Terceiros

O MKTP Fácil pode utilizar serviços externos que também utilizam cookies, como:
- Serviços de hospedagem
- Ferramentas de análise
- Serviços de autenticação
- APIs integradas

Cada serviço possui sua própria política de privacidade.

## 5. Gerenciamento de Cookies

O usuário pode:
- Configurar seu navegador para bloquear cookies
- Excluir cookies já armazenados
- Receber alertas antes de armazenamento

A desativação de cookies essenciais pode comprometer o funcionamento da plataforma.

## 6. Consentimento

Ao continuar navegando ou utilizar a plataforma, o usuário concorda com o uso de cookies conforme descrito nesta Política.

## 7. Alterações

Esta Política pode ser atualizada a qualquer momento para refletir melhorias técnicas ou exigências legais.

## 8. Contato

Em caso de dúvidas sobre esta Política, entre em contato pelo e-mail:

**contato@mktpfacil.com**`;

export default function PoliticaCookies() {
  return (
    <LegalPageShell
      contentKey="cookies.content"
      defaultContent={DEFAULT_COOKIES}
      editLabel="Editar Política de Cookies"
      successMessage="Política de Cookies atualizada!"
    />
  );
}
