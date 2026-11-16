import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { Calendar, User, Tag, ArrowLeft, Share2, Clock, Calculator, Percent, Printer, TrendingUp, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { BlogPost } from '@/types/blog';
import { readingTimeMin } from '@/types/blog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BlogPostContentProps {
  post: BlogPost;
  relatedPosts?: BlogPost[];
}

const FREE_TOOLS = [
  { href: '/ferramentas/precificacao', label: 'Simulador de precificação', desc: 'Calcule o preço ideal com comissão, frete e imposto.', icon: Calculator },
  { href: '/ferramentas/comissoes', label: 'Tabela de comissões', desc: 'Consulte as tarifas do Mercado Livre por categoria.', icon: Percent },
  { href: '/ferramentas/zpl', label: 'Visualizador de etiquetas ZPL', desc: 'Abra e imprima etiquetas ZPL em PDF.', icon: Printer },
  { href: '/ferramentas/tendencias', label: 'Tendências do Mercado Livre', desc: 'Veja o que está em alta nas buscas.', icon: TrendingUp },
];

function sanitize(html: string): string {
  return DOMPurify.sanitize(html || '', {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height', 'target', 'rel', 'loading'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

export function BlogPostContent({ post, relatedPosts = [] }: BlogPostContentProps) {
  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: post.titulo, text: post.resumo || '', url: window.location.href });
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  const minutes = post.tempo_leitura_min || readingTimeMin(post.conteudo_principal || '');
  const cleanHtml = sanitize(post.conteudo_principal || '');

  return (
    <article className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to="/blog">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Blog
          </Button>
        </Link>
      </div>

      <header className="mb-8">
        {post.categoria && (
          <Link to={`/blog/categoria/${post.categoria.slug}`}>
            <Badge variant="secondary" className="mb-4">{post.categoria.nome}</Badge>
          </Link>
        )}

        <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">{post.titulo}</h1>

        {post.resumo && <p className="text-xl text-muted-foreground mb-6">{post.resumo}</p>}

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {post.autor && (
            <span className="flex items-center gap-1"><User className="h-4 w-4" />{post.autor}</span>
          )}
          {post.data_publicacao && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(post.data_publicacao), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
          )}
          <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{minutes} min de leitura</span>
          <Button variant="ghost" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-1" /> Compartilhar
          </Button>
        </div>
      </header>

      {post.imagem_capa && (
        <div className="aspect-[1200/630] overflow-hidden rounded-lg mb-8">
          <img
            src={post.imagem_capa}
            alt={post.imagem_capa_alt || post.titulo}
            className="w-full h-full object-cover"
            loading="eager"
            fetchPriority="high"
            width={1200}
            height={630}
          />
        </div>
      )}

      <div
        className="prose prose-lg max-w-none dark:prose-invert prose-headings:font-bold prose-a:text-primary prose-img:rounded-lg"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />

      {/* CTA do produto */}
      <aside className="mt-12 rounded-xl border bg-primary/5 p-6 md:p-8">
        <h2 className="text-2xl font-bold mb-2">Venda mais trabalhando menos com o MKTP Fácil</h2>
        <p className="text-muted-foreground mb-5">
          Etiquetas em lote, conversor ZPL, precificação, curva ABC e gestão de anúncios num só lugar,
          conectado à sua conta do Mercado Livre. Teste grátis, sem cartão.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to="/auth">
            <Button size="lg">Testar grátis <ArrowRight className="h-4 w-4 ml-2" /></Button>
          </Link>
          <Link to="/planos">
            <Button size="lg" variant="outline">Ver planos</Button>
          </Link>
        </div>
      </aside>

      {/* Ferramentas grátis */}
      <section className="mt-10">
        <h2 className="text-xl font-bold mb-4">Ferramentas grátis para vendedores</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FREE_TOOLS.map(({ href, label, desc, icon: Icon }) => (
            <Link key={href} to={href} className="flex gap-3 rounded-lg border p-4 hover:bg-muted transition-colors">
              <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-sm text-muted-foreground">{desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {relatedPosts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold mb-4">Leia também</h2>
          <ul className="space-y-3">
            {relatedPosts.map((rp) => (
              <li key={rp.id}>
                <Link to={`/blog/${rp.slug}`} className="text-primary hover:underline font-medium">
                  {rp.titulo}
                </Link>
                {rp.resumo && <p className="text-sm text-muted-foreground line-clamp-2">{rp.resumo}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {post.tags && post.tags.length > 0 && (
        <>
          <Separator className="my-8" />
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {post.tags.map((tag) => (
              <Badge key={tag} variant="outline">{tag}</Badge>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

