import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Eye, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import ArticleFeedback from "@/components/help/ArticleFeedback";

export default function CentralDeAjudaArtigo() {
  const { slug } = useParams<{ slug: string }>();

  const { data: article, isLoading } = useQuery({
    queryKey: ["help-article", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("*, help_categories(name, slug)")
        .eq("slug", slug!)
        .eq("published", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  // Increment views
  useEffect(() => {
    if (!article?.id) return;
    supabase.rpc("increment_help_article_views", { p_article_id: article.id }).then();
  }, [article?.id]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-3xl animate-pulse space-y-4">
        <div className="h-6 bg-muted rounded w-1/3" />
        <div className="h-8 bg-muted rounded w-2/3" />
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-full" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">Artigo não encontrado.</p>
            <Link to="/central-de-ajuda">
              <Button variant="outline" size="sm">Voltar à Central</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Simple markdown-to-html renderer
  const renderContent = (content: string) => {
    return content
      .split("\n")
      .map((line, i) => {
        if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold mt-6 mb-2 text-foreground">{line.slice(4)}</h3>;
        if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-bold mt-6 mb-3 text-foreground">{line.slice(3)}</h2>;
        if (line.startsWith("> ")) return <blockquote key={i} className="border-l-4 border-primary/30 pl-4 py-1 text-sm text-muted-foreground italic my-3">{renderInline(line.slice(2))}</blockquote>;
        if (line.startsWith("- ")) return <li key={i} className="ml-4 text-sm text-foreground list-disc">{renderInline(line.slice(2))}</li>;
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 text-sm text-foreground list-decimal">{renderInline(line.replace(/^\d+\.\s/, ""))}</li>;
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return <p key={i} className="text-sm text-foreground leading-relaxed">{renderInline(line)}</p>;
      });
  };

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      const linkParts = part.split(/(\[[^\]]+\]\([^)]+\))/g);
      return linkParts.map((lp, j) => {
        const match = lp.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (match) return <Link key={`${i}-${j}`} to={match[2]} className="text-primary underline">{match[1]}</Link>;
        return <span key={`${i}-${j}`}>{lp}</span>;
      });
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className="text-xs">
            {(article as any).help_categories?.name}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Eye className="h-3 w-3" /> {article.views} visualizações
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(article.created_at), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">{article.title}</h1>
        {article.summary && (
          <p className="text-muted-foreground mt-2">{article.summary}</p>
        )}
      </div>

      <Card>
        <CardContent className="py-6">
          <div className="prose-sm">{renderContent(article.content)}</div>
        </CardContent>
      </Card>

      <div className="mt-6">
        <ArticleFeedback articleId={article.id} articleTitle={article.title} />
      </div>

      <div className="mt-8 text-center">
        <Link to="/central-de-ajuda">
          <Button variant="outline" size="sm" className="gap-2">
            Voltar à Central de Ajuda
          </Button>
        </Link>
      </div>
    </div>
  );
}
