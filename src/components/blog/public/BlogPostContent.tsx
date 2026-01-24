import { Link } from 'react-router-dom';
import { Calendar, User, Tag, ArrowLeft, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { BlogPost } from '@/types/blog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BlogPostContentProps {
  post: BlogPost;
}

export function BlogPostContent({ post }: BlogPostContentProps) {
  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: post.titulo,
        text: post.resumo || '',
        url: window.location.href
      });
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <article className="max-w-4xl mx-auto">
      {/* Back button */}
      <div className="mb-6">
        <Link to="/blog">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Blog
          </Button>
        </Link>
      </div>

      {/* Header */}
      <header className="mb-8">
        {post.categoria && (
          <Link to={`/blog/categoria/${post.categoria.slug}`}>
            <Badge variant="secondary" className="mb-4">
              {post.categoria.nome}
            </Badge>
          </Link>
        )}
        
        <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
          {post.titulo}
        </h1>
        
        {post.resumo && (
          <p className="text-xl text-muted-foreground mb-6">
            {post.resumo}
          </p>
        )}
        
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {post.autor && (
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {post.autor}
            </span>
          )}
          {post.data_publicacao && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(new Date(post.data_publicacao), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-1" />
            Compartilhar
          </Button>
        </div>
      </header>

      {/* Cover Image */}
      {post.imagem_capa && (
        <div className="aspect-video overflow-hidden rounded-lg mb-8">
          <img
            src={post.imagem_capa}
            alt={post.titulo}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Content */}
      <div className="prose prose-lg max-w-none dark:prose-invert">
        {/* Simple markdown-like rendering */}
        {post.conteudo_principal?.split('\n').map((paragraph, index) => {
          if (!paragraph.trim()) return <br key={index} />;
          
          // Headers
          if (paragraph.startsWith('### ')) {
            return <h3 key={index} className="text-xl font-semibold mt-8 mb-4">{paragraph.slice(4)}</h3>;
          }
          if (paragraph.startsWith('## ')) {
            return <h2 key={index} className="text-2xl font-bold mt-10 mb-4">{paragraph.slice(3)}</h2>;
          }
          if (paragraph.startsWith('# ')) {
            return <h1 key={index} className="text-3xl font-bold mt-12 mb-6">{paragraph.slice(2)}</h1>;
          }
          
          // Lists
          if (paragraph.startsWith('- ')) {
            return <li key={index} className="ml-6">{paragraph.slice(2)}</li>;
          }
          
          // Regular paragraph
          return <p key={index} className="mb-4 leading-relaxed">{paragraph}</p>;
        })}
      </div>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <>
          <Separator className="my-8" />
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            {post.tags.map(tag => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </>
      )}
    </article>
  );
}
