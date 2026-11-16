import { Link } from "react-router-dom";
import { Calculator, Percent, Printer, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolsLayout } from "./ToolsLayout";

const TOOLS = [
  {
    href: "/ferramentas/precificacao",
    title: "Simulador de precificação",
    desc: "Calcule o preço de venda no Mercado Livre considerando custo, comissão, frete, imposto e a margem que você quer ter.",
    icon: Calculator,
  },
  {
    href: "/ferramentas/comissoes",
    title: "Tabela de comissões do Mercado Livre",
    desc: "Consulte a tarifa de venda por categoria e tipo de anúncio (Clássico e Premium) antes de anunciar.",
    icon: Percent,
  },
  {
    href: "/ferramentas/zpl",
    title: "Visualizador de etiquetas ZPL",
    desc: "Abra arquivos ZPL do Mercado Envios, veja a etiqueta e gere PDF para imprimir em qualquer impressora.",
    icon: Printer,
  },
  {
    href: "/ferramentas/tendencias",
    title: "Tendências do Mercado Livre",
    desc: "Descubra os termos mais buscados nas categorias e encontre oportunidades de produto.",
    icon: TrendingUp,
  },
];

export default function FerramentasIndex() {
  return (
    <ToolsLayout>
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Ferramentas grátis para vendedores de marketplace</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Calculadoras e utilitários para quem vende no Mercado Livre e na Shopee. Sem cadastro e sem custo.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {TOOLS.map(({ href, title, desc, icon: Icon }) => (
            <Link
              key={href}
              to={href}
              className="group rounded-xl border p-6 hover:shadow-lg hover:border-primary/40 transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">{title}</h2>
              <p className="text-muted-foreground mb-4">{desc}</p>
              <span className="text-sm font-medium text-primary inline-flex items-center">
                Usar grátis <ArrowRight className="h-4 w-4 ml-1" />
              </span>
            </Link>
          ))}
        </div>

        <section className="mt-16 rounded-xl bg-primary/5 border p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Quer tudo isso conectado à sua conta?</h2>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            No MKTP Fácil as etiquetas saem em lote, a precificação usa seus custos reais e os relatórios
            chegam prontos. Teste grátis.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/auth"><Button size="lg">Testar grátis</Button></Link>
            <Link to="/blog"><Button size="lg" variant="outline">Ler o blog</Button></Link>
          </div>
        </section>
      </div>
    </ToolsLayout>
  );
}
