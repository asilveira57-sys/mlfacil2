import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink, FileText, Boxes, Wallet, Truck, Store, Sparkles, Check, Building2, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { ToolsLayout } from '@/pages/tools/ToolsLayout';
import { OLIST_COUPON, OLIST_OFFER, OLIST_PARTNER_URL } from '@/components/partners/olist';

const FEATURES = [
  { icon: Store, title: 'Integração com marketplaces', desc: 'Mercado Livre, Shopee, Amazon, TikTok Shop e dezenas de outros canais conectados num só painel. Pedidos de todos os canais caem no mesmo lugar.' },
  { icon: FileText, title: 'Nota fiscal automática', desc: 'Emissão de NF-e, NFC-e e NFS-e com os dados puxados do próprio pedido. Acabou digitar nota uma a uma.' },
  { icon: Boxes, title: 'Estoque sincronizado', desc: 'Vendeu no Mercado Livre, baixa na Shopee. Controle multiestoque e multiempresa, sem vender o que você não tem.' },
  { icon: Wallet, title: 'Financeiro organizado', desc: 'Contas a pagar e a receber, conciliação bancária, fluxo de caixa e margem por canal de venda.' },
  { icon: Truck, title: 'Olist Envios', desc: 'Frete com desconto e impressão de etiquetas dentro do ERP para os envios fora da logística dos marketplaces.' },
  { icon: Sparkles, title: 'Assistente com IA', desc: 'A Lis aponta ruptura de estoque e erros operacionais e transforma os dados da operação em ações.' },
];

const FAQ = [
  {
    q: 'Como uso o cupom MLFACIL?',
    a: 'Entre pelo link de parceiro desta página. O cupom do MKTP Fácil já vai aplicado no cadastro e garante 30 dias de teste grátis + 3 meses com 50% de desconto nos planos. Se o sistema pedir o código, digite MLFACIL.',
  },
  {
    q: 'Preciso de cartão de crédito para testar?',
    a: 'Não. O teste de 30 dias começa sem cartão e a configuração é imediata. Você só escolhe um plano se decidir continuar.',
  },
  {
    q: 'A Olist substitui o MKTP Fácil?',
    a: 'Não, eles se completam. A Olist é o ERP: nota fiscal, estoque, financeiro e integração entre canais. O MKTP Fácil cuida da inteligência de venda no Mercado Livre: etiquetas em lote, conversor ZPL, precificação, curva ABC, tendências e análise de anúncios.',
  },
  {
    q: 'Serve para MEI?',
    a: 'Sim. O plano de entrada da Olist atende MEI e Simples Nacional; os planos maiores atendem também Lucro Presumido e Real.',
  },
  {
    q: 'Por que o MKTP Fácil indica a Olist?',
    a: 'A ML Fácil Consultoria, responsável pelo MKTP Fácil, é parceira oficial da Olist. Indicamos porque é o ERP que usamos com os clientes da consultoria, e recebemos comissão pelas assinaturas feitas com o cupom, sem custo extra para você.',
  },
];

function useFaqJsonLd() {
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'jsonld-faq-olist';
    el.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
}

function CtaButtons({ center = false }: { center?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${center ? 'justify-center' : ''}`}>
      <a href={OLIST_PARTNER_URL} target="_blank" rel="sponsored noopener">
        <Button size="lg">Começar teste grátis <ExternalLink className="h-4 w-4 ml-2" /></Button>
      </a>
      <span className="rounded-md border-2 border-dashed border-primary px-4 py-2 font-mono text-lg font-bold tracking-wider">
        {OLIST_COUPON}
      </span>
    </div>
  );
}

export default function OlistParceiro() {
  useFaqJsonLd();
  return (
    <ToolsLayout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Hero */}
        <section className="text-center mb-16">
          <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1 text-sm font-medium text-primary mb-6">
            <Building2 className="h-4 w-4" /> Parceiro oficial Olist
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mb-5 leading-tight">
            ERP da Olist com cupom MLFACIL: {OLIST_OFFER}
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Nota fiscal, estoque, financeiro e todos os seus marketplaces num só sistema. Teste sem cartão
            e, se gostar, pague metade nos três primeiros meses.
          </p>
          <CtaButtons center />
          <p className="mt-3 text-sm text-muted-foreground">Condição de aquecimento da Black Friday, válida por tempo indeterminado.</p>
        </section>

        {/* Para quem é */}
        <section className="mb-16 grid gap-8 md:grid-cols-2 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-4">Quando o seller precisa de um ERP</h2>
            <p className="text-muted-foreground mb-4">
              No começo dá para tocar tudo pelo painel do Mercado Livre. O problema aparece quando as vendas
              crescem: nota fiscal para emitir pedido a pedido, estoque dividido entre Mercado Livre e Shopee,
              planilha de contas que ninguém atualiza.
            </p>
            <ul className="space-y-2">
              {[
                'Você vende em mais de um marketplace e já vendeu produto sem estoque',
                'Emite nota fiscal manualmente e perde horas por semana nisso',
                'Não sabe quanto sobra de verdade em cada canal',
                'Vai abrir CNPJ ou já tem e precisa organizar o fiscal',
              ].map((t) => (
                <li key={t} className="flex gap-2"><Check className="h-5 w-5 text-primary shrink-0" /> {t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border bg-muted/30 p-6">
            <h3 className="font-semibold text-lg mb-3">MKTP Fácil + Olist</h3>
            <p className="text-sm text-muted-foreground mb-3">
              <strong className="text-foreground">Olist</strong> é o sistema de gestão: fiscal, estoque, financeiro e integração entre canais.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              <strong className="text-foreground">MKTP Fácil</strong> é a inteligência de venda no Mercado Livre:
              etiquetas em lote, conversor ZPL, precificação, curva ABC, tendências e análise de anúncios.
            </p>
            <Link to="/planos" className="text-sm font-medium text-primary inline-flex items-center">
              Conheça os planos do MKTP Fácil <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
        </section>

        {/* Recursos */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-8 text-center">O que o ERP da Olist faz</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border p-6">
                <Icon className="h-8 w-8 text-primary mb-3" />
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Como ativar */}
        <section className="mb-16 rounded-xl bg-primary/5 border p-8">
          <h2 className="text-3xl font-bold mb-6">Como ativar o cupom em 3 passos</h2>
          <ol className="space-y-4">
            <li><strong>1. Entre pelo link de parceiro</strong> — o botão abaixo já leva o código MLFACIL.</li>
            <li><strong>2. Crie sua conta e comece o teste</strong> — 30 dias grátis, sem cartão de crédito.</li>
            <li><strong>3. Escolha o plano quando quiser</strong> — os 3 primeiros meses saem com 50% de desconto.</li>
          </ol>
          <div className="mt-6"><CtaButtons /></div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-6">Perguntas frequentes</h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((f, i) => (
              <AccordionItem key={f.q} value={`f${i}`}>
                <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="text-center">
          <h2 className="text-2xl font-bold mb-4">Teste a Olist com o cupom do MKTP Fácil</h2>
          <CtaButtons center />
          <p className="mt-6 text-xs text-muted-foreground max-w-2xl mx-auto">
            O MKTP Fácil (ML Fácil Consultoria) é parceiro oficial da Olist e pode receber comissão pelas assinaturas
            feitas com o cupom, sem custo adicional para você. Condições, planos e preços são definidos pela Olist e
            podem mudar; confira no site oficial antes de contratar.
          </p>
        </section>
      </div>
    </ToolsLayout>
  );
}
