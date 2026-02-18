import { LegalPageShell } from '@/components/legal/LegalPageShell';

const DEFAULT_TERMS = `# TERMOS DE USO – MKTP FÁCIL

**Última atualização: 18/02/2025**

## 1. Identificação da Empresa

O MKTP Fácil é operado por:

**MLFACIL CONSULTORIA E SISTEMAS LTDA**
CNPJ: 52.833.264/0001-20
Endereço: Rua Luiz Fernando Reis, nº 417, Apto 703
Bairro Praia da Costa – Vila Velha – ES
CEP: 29.101-120
E-mail para contato: contato@mktpfacil.com

## 2. Aceitação dos Termos

Ao acessar, criar conta ou utilizar o MKTP Fácil, o usuário declara que leu, compreendeu e concorda integralmente com estes Termos de Uso.

Caso não concorde, o uso da plataforma deve ser interrompido imediatamente.

## 3. Descrição do Serviço

O MKTP Fácil é uma plataforma SaaS voltada para sellers de marketplace, oferecendo ferramentas como:

- Importação e análise de dados de vendas
- Histórico progressivo (30 dias no período de teste e até 12 meses após ativação)
- Curva ABC por produto, cidade, bairro, cliente e lucro
- Análise de intervalo de vendas
- Central de promoções com filtros, aplicação em lote e reagendamento
- Impressão de etiquetas de envio com cabeçalho e observações
- Impressão ZPL sem limites, com conversão para PDF e temporizador
- Gestão multicontas
- Controle de colaboradores com níveis de acesso
- Ferramentas internas de organização

A plataforma funciona por meio de integrações autorizadas pelo próprio usuário.

## 4. Período de Teste

Durante o período de teste, o sistema realiza a importação dos últimos 30 dias de vendas.

Após a ativação de plano pago, o usuário poderá solicitar a importação retroativa de até 12 meses de histórico, respeitando os limites das APIs e disponibilidade de dados.

## 5. Integrações com Terceiros

O MKTP Fácil pode integrar-se com:

- Mercado Livre (API oficial)
- Mercado Pago
- ERPs compatíveis, como Bling e Olist

A empresa não se responsabiliza por indisponibilidades, limitações técnicas ou alterações nas APIs dessas plataformas.

## 6. Responsabilidades do Usuário

O usuário compromete-se a:

- Fornecer informações verdadeiras e atualizadas
- Manter a confidencialidade de login e senha
- Utilizar a plataforma conforme a legislação vigente
- Autorizar integrações de forma legítima

É proibido utilizar o sistema para fins ilícitos ou fraudulentos.

## 7. Limitação de Responsabilidade

O MKTP Fácil:

- Não garante resultados financeiros ou crescimento de vendas
- Não se responsabiliza por decisões comerciais tomadas pelo usuário
- Não responde por falhas decorrentes de terceiros ou APIs externas
- Pode realizar manutenções programadas sem aviso prévio

## 8. Propriedade Intelectual

Todo o conteúdo, marca, código-fonte, layout, funcionalidades e estrutura do sistema são de propriedade da MLFACIL CONSULTORIA E SISTEMAS LTDA.

É proibida reprodução, cópia, engenharia reversa ou uso indevido da tecnologia.

## 9. Suspensão ou Cancelamento de Conta

A empresa poderá suspender ou encerrar contas que violem estes Termos de Uso ou utilizem o sistema de maneira inadequada.

O usuário poderá solicitar cancelamento conforme as regras do plano contratado.

## 10. Proteção de Dados

O tratamento de dados pessoais ocorre conforme a Política de Privacidade da plataforma e em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).

## 11. Alterações dos Termos

A empresa poderá atualizar estes Termos a qualquer momento. Recomenda-se a revisão periódica.

## 12. Foro

Fica eleito o foro da comarca de Vila Velha – ES para dirimir quaisquer controvérsias decorrentes deste Termo.`;

export default function TermosDeUso() {
  return (
    <LegalPageShell
      contentKey="termos.content"
      defaultContent={DEFAULT_TERMS}
      editLabel="Editar Termos"
      successMessage="Termos de Uso atualizados!"
    />
  );
}
