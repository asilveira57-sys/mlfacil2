import { LegalPageShell } from '@/components/legal/LegalPageShell';

const DEFAULT_LGPD = `# 📄 LGPD – Lei Geral de Proteção de Dados
**MKTP Fácil**

**Última atualização: 18/02/2026**

## 1. Compromisso com a Proteção de Dados

O MKTP Fácil, operado por:

**MLFACIL CONSULTORIA E SISTEMAS LTDA**
CNPJ: 52.833.264/0001-20
Vila Velha – ES
E-mail: contato@mktpfacil.com

declara seu compromisso com a proteção de dados pessoais, em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados – LGPD).

## 2. Papel da Empresa

A MLFACIL CONSULTORIA E SISTEMAS LTDA atua como:

- **Controladora** dos dados pessoais coletados diretamente na plataforma.
- **Operadora** quando realiza tratamento de dados por meio de integrações autorizadas pelo usuário.

## 3. Dados Tratados

O MKTP Fácil pode tratar:

### Dados cadastrais
- Nome
- E-mail
- Telefone
- Informações da empresa vinculada

### Dados operacionais (via integração autorizada)
- Informações de vendas
- Dados de anúncios
- Dados financeiros e taxas
- Custos importados via ERP

### Dados técnicos
- IP
- Logs de acesso
- User-Agent
- Informações de sessão

## 4. Finalidade do Tratamento

Os dados são utilizados exclusivamente para:

- Execução do contrato (prestação do serviço SaaS)
- Geração de análises estratégicas
- Emissão de relatórios
- Impressão de etiquetas
- Cumprimento de obrigações legais
- Segurança da plataforma

## 5. Bases Legais

O tratamento ocorre com base em:

- Execução de contrato
- Consentimento do titular
- Cumprimento de obrigação legal
- Legítimo interesse

## 6. Direitos do Titular

Nos termos da LGPD, o titular pode solicitar:

- Confirmação da existência de tratamento
- Acesso aos dados
- Correção de dados incompletos
- Anonimização ou exclusão (quando aplicável)
- Portabilidade
- Revogação de consentimento

Solicitações devem ser enviadas para:
**contato@mktpfacil.com**

## 7. Segurança da Informação

O MKTP Fácil adota medidas técnicas e administrativas como:

- Criptografia
- Controle de acesso por níveis
- Registro de consentimento versionado
- Armazenamento seguro em ambiente cloud
- Controle de histórico de alterações

## 8. Retenção e Exclusão

Os dados são mantidos:

- Durante a vigência contratual
- Pelo prazo necessário ao cumprimento de obrigações legais
- Pelo prazo necessário à defesa em processos judiciais

Após esse período, poderão ser excluídos ou anonimizados.

## 9. Compartilhamento de Dados

Os dados poderão ser compartilhados com:

- Plataformas integradas (quando autorizado)
- Serviços de hospedagem
- Processadores de pagamento
- Autoridades públicas, quando exigido por lei

**O MKTP Fácil não comercializa dados pessoais.**

## 10. Encarregado (DPO)

Para assuntos relacionados à proteção de dados:

**E-mail: contato@mktpfacil.com**

## 11. Atualizações

Esta página poderá ser atualizada sempre que necessário para refletir alterações legais ou melhorias técnicas.`;

export default function Lgpd() {
  return (
    <LegalPageShell
      contentKey="lgpd.content"
      defaultContent={DEFAULT_LGPD}
      editLabel="Editar LGPD"
      successMessage="Página LGPD atualizada!"
    />
  );
}
