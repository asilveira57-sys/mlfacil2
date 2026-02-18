import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSiteContentContext } from '@/contexts/SiteContentContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SeoHead } from '@/components/seo/SeoHead';

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

function renderMarkdown(text: string) {
  // Simple markdown-to-HTML renderer for terms content
  return text
    .split('\n\n')
    .map((block, i) => {
      const trimmed = block.trim();
      if (!trimmed) return null;

      // H1
      if (trimmed.startsWith('# ')) {
        return <h1 key={i} className="text-3xl font-bold text-foreground mb-6">{trimmed.slice(2)}</h1>;
      }
      // H2
      if (trimmed.startsWith('## ')) {
        return <h2 key={i} className="text-xl font-semibold text-foreground mt-8 mb-3">{trimmed.slice(3)}</h2>;
      }

      // List items
      if (trimmed.includes('\n- ')) {
        const lines = trimmed.split('\n');
        const intro = lines[0].startsWith('- ') ? null : lines.shift();
        const items = (intro ? lines : [lines[0], ...lines.slice(1)])
          .filter(l => l.startsWith('- '))
          .map(l => l.slice(2));
        return (
          <div key={i} className="mb-4">
            {intro && <p className="text-muted-foreground mb-2">{renderInline(intro)}</p>}
            <ul className="list-disc pl-6 space-y-1">
              {items.map((item, j) => (
                <li key={j} className="text-muted-foreground">{renderInline(item)}</li>
              ))}
            </ul>
          </div>
        );
      }

      // Plain paragraph
      return <p key={i} className="text-muted-foreground mb-4 leading-relaxed">{renderInline(trimmed)}</p>;
    })
    .filter(Boolean);
}

function renderInline(text: string) {
  // Handle **bold** 
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function TermosDeUso() {
  const { getText } = useSiteContentContext();
  const { isAdmin } = useUserRole();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const { refresh } = useSiteContentContext();

  const contentFromDb = getText('termos.content');
  const hasDbContent = contentFromDb !== 'termos.content';
  const termsContent = hasDbContent ? contentFromDb : DEFAULT_TERMS;

  const handleEdit = () => {
    setEditValue(termsContent);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('site_content')
        .upsert({
          chave: 'termos.content',
          texto: editValue,
          pagina: 'termos',
          secao: 'content',
          tipo: 'texto',
          status: 'ativo',
          updated_at: new Date().toISOString()
        }, { onConflict: 'chave' });

      if (error) throw error;
      await refresh();
      setEditing(false);
      toast.success('Termos de Uso atualizados!');
    } catch (error) {
      console.error('Error saving terms:', error);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SeoHead />
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card">
          <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao início
            </Link>
            {isAdmin && !editing && (
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Pencil className="w-4 h-4 mr-2" />
                Editar Termos
              </Button>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="container mx-auto px-4 md:px-6 py-12 max-w-3xl">
          {editing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Editando Termos de Uso</h2>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Use Markdown: # Título, ## Subtítulo, **negrito**, - item de lista
              </p>
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="min-h-[600px] font-mono text-sm"
              />
            </div>
          ) : (
            <article className="prose prose-sm max-w-none">
              {renderMarkdown(termsContent)}
            </article>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-border bg-card py-6">
          <div className="container mx-auto px-4 md:px-6 text-center">
            <p className="text-sm text-muted-foreground">
              © 2025 MKTP Fácil. Todos os direitos reservados.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
