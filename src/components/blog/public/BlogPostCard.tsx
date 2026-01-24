import { Link } from 'react-router-dom';
import { Calendar, User, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { BlogPost } from '@/types/blog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BlogPostCardProps {
  post: BlogPost;
}

export function BlogPostCard({ post }: BlogPostCardProps) {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow group">
      {post.imagem_capa && (
        <Link to={`/blog/${post.slug}`}>
          <div className="aspect-video overflow-hidden">
            <img
              src={post.imagem_capa}
              alt={post.titulo}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        </Link>
      )}
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          {post.categoria && (
            <Link to={`/blog/categoria/${post.categoria.slug}`}>
              <Badge variant="secondary" className="hover:bg-secondary/80">
                {post.categoria.nome}
              </Badge>
            </Link>
          )}
          {post.data_publicacao && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(post.data_publicacao), "d 'de' MMM, yyyy", { locale: ptBR })}
            </span>
          )}
        </div>
        
        <Link to={`/blog/${post.slug}`}>
          <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2">
            {post.titulo}
          </h3>
        </Link>
        
        {post.resumo && (
          <p className="text-muted-foreground line-clamp-3">
            {post.resumo}
          </p>
        )}
      </CardContent>
      
      <CardFooter className="px-6 pb-6 pt-0 flex items-center justify-between">
        {post.autor && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            {post.autor}
          </span>
        )}
        <Link 
          to={`/blog/${post.slug}`}
          className="text-sm font-medium text-primary flex items-center gap-1 hover:gap-2 transition-all"
        >
          Ler mais
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}
