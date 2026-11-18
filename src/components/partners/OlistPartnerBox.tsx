import { Link } from 'react-router-dom';
import { ExternalLink, FileText, Boxes, Wallet, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OLIST_COUPON, OLIST_OFFER, OLIST_PARTNER_URL } from './olist';

/** Bloco de parceria exibido no fim dos posts do blog. */
export function OlistPartnerBox() {
  return (
    <aside className="mt-10 rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-background p-6 md:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">Parceiro oficial · Olist</p>
      <h2 className="text-2xl font-bold mb-2">Nota fiscal, estoque e financeiro no automático com o ERP da Olist</h2>
      <p className="text-muted-foreground mb-4">
        O ERP da Olist integra Mercado Livre, Shopee e outros marketplaces: emite NF-e a partir do pedido,
        sincroniza estoque entre canais e organiza o financeiro. Usando o cupom do MKTP Fácil você ganha{' '}
        <strong className="text-foreground">{OLIST_OFFER}</strong>.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 mb-5 text-sm">
        <li className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Emissão automática de NF-e</li>
        <li className="flex items-center gap-2"><Boxes className="h-4 w-4 text-primary" /> Estoque sincronizado entre canais</li>
        <li className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Contas a pagar, receber e conciliação</li>
        <li className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Frete com desconto pelo Olist Envios</li>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <a href={OLIST_PARTNER_URL} target="_blank" rel="sponsored noopener">
          <Button size="lg">Testar a Olist com o cupom <ExternalLink className="h-4 w-4 ml-2" /></Button>
        </a>
        <span className="rounded-md border border-dashed border-primary px-3 py-2 font-mono font-bold tracking-wider">
          {OLIST_COUPON}
        </span>
        <Link to="/olist" className="text-sm text-primary hover:underline">Saiba mais sobre a parceria</Link>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        O MKTP Fácil (ML Fácil Consultoria) é parceiro da Olist e pode receber comissão pelas assinaturas feitas com o cupom.
      </p>
    </aside>
  );
}
