import { LegalPageShell } from '@/components/legal/LegalPageShell';

const DEFAULT_PRIVACY = `# POLÍTICA DE PRIVACIDADE – MKTP FÁCIL

**Última atualização: 18/02/2026**

## 1. Identificação do Controlador

A presente Política de Privacidade regula o tratamento de dados realizado por:

**MLFACIL CONSULTORIA E SISTEMAS LTDA**
CNPJ: 52.833.264/0001-20
Endereço: Rua Luiz Fernando Reis, nº 417
Praia da Costa – Vila Velha – ES
CEP: 29.101-120
E-mail para contato: contato@mktpfacil.com

## 2. Finalidade desta Política

Esta Política tem como objetivo informar como os dados pessoais são coletados, utilizados, armazenados e protegidos no uso da plataforma MKTP Fácil.

## 3. Dados Coletados

O MKTP Fácil pode coletar os seguintes dados:

### 3.1 Dados cadastrais

- Nome
- E-mail
- Telefone
- Informações de login
- Dados da empresa vinculada

### 3.2 Dados provenientes de integrações autorizadas

- Pedidos e vendas
- Informações de anúncios
- Taxas e valores financeiros
- Dados operacionais do marketplace
- Custos importados via ERP (quando autorizado)

### 3.3 Dados técnicos

- Endereço IP
- Navegador e dispositivo
- Logs de acesso
- Informações de sessão

## 4. Finalidade do Tratamento

Os dados são utilizados para:

- Permitir funcionamento da plataforma
- Realizar análises estratégicas
- Importar histórico de vendas (30 dias no teste e até 12 meses após ativação)
- Gerar relatórios e dashboards
- Executar impressão de etiquetas
- Gerenciar multicontas e colaboradores
- Cumprir obrigações legais

## 5. Base Legal

O tratamento de dados ocorre com base em:

- Execução de contrato
- Consentimento do usuário
- Cumprimento de obrigação legal
- Legítimo interesse da empresa

## 6. Compartilhamento de Dados

Os dados podem ser compartilhados com:

- Plataformas integradas (como Mercado Livre e ERPs) quando autorizado
- Provedores de hospedagem e infraestrutura
- Serviços de processamento de pagamento
- Autoridades públicas, quando exigido por lei

**A empresa não vende dados pessoais.**

## 7. Armazenamento e Segurança

Os dados são armazenados em ambiente seguro, com:

- Criptografia
- Controle de acesso
- Monitoramento técnico
- Boas práticas de segurança da informação

Apesar das medidas adotadas, nenhum sistema é totalmente isento de riscos.

## 8. Direitos do Titular

Nos termos da LGPD, o titular pode solicitar:

- Confirmação de tratamento
- Acesso aos dados
- Correção de dados incompletos
- Exclusão de dados (quando aplicável)
- Portabilidade
- Revogação de consentimento

Solicitações podem ser feitas pelo e-mail: contato@mktpfacil.com

## 9. Retenção de Dados

Os dados são mantidos:

- Enquanto houver relação contratual
- Pelo prazo necessário para cumprimento de obrigações legais
- Pelo período necessário para defesa em processos judiciais

## 10. Cookies

O MKTP Fácil pode utilizar cookies para:

- Melhorar a experiência do usuário
- Análise de tráfego
- Segurança da sessão

O usuário pode configurar o navegador para bloquear cookies, podendo haver limitação de funcionalidades.

## 11. Alterações desta Política

Esta Política pode ser atualizada a qualquer momento. A versão vigente estará sempre disponível na plataforma.

## 12. Foro

Fica eleito o foro da comarca de Vila Velha – ES para dirimir eventuais controvérsias.`;

export default function PoliticaPrivacidade() {
  return (
    <LegalPageShell
      contentKey="privacidade.content"
      defaultContent={DEFAULT_PRIVACY}
      editLabel="Editar Política"
      successMessage="Política de Privacidade atualizada!"
    />
  );
}
