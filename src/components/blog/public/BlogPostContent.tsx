import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { Calendar, User, Tag, ArrowLeft, Share2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { BlogPost } from '@/types/blog';
import { readingTimeMin } from '@/types/blog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BlogPostContentProps {
  post: BlogPost;
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html || '', {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height', 'target', 'rel', 'loading'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

export function BlogPostContent({ post }: BlogPostContentProps) {
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
        <div className="aspect-video overflow-hidden rounded-lg mb-8">
          <img
            src={post.imagem_capa}
            alt={post.imagem_capa_alt || post.titulo}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div
        className="prose prose-lg max-w-none dark:prose-invert prose-headings:font-bold prose-a:text-primary prose-img:rounded-lg"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />

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

