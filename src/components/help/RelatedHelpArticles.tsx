import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveModuleKey } from "@/hooks/useActiveModuleKey";

export default function RelatedHelpArticles() {
  const moduleKey = useActiveModuleKey();

  const { data: articles = [] } = useQuery({
    queryKey: ["help-articles-by-module", moduleKey],
    queryFn: async () => {
      // Find module by key
      const { data: mod } = await supabase
        .from("system_modules")
        .select("id")
        .eq("key", moduleKey)
        .maybeSingle();

      if (!mod) return [];

      const { data: links } = await supabase
        .from("help_article_modules")
        .select("article_id")
        .eq("module_id", mod.id);

      if (!links || links.length === 0) return [];

      const articleIds = links.map((l: any) => l.article_id);

      const { data: arts } = await supabase
        .from("help_articles")
        .select("id, title, slug, summary, helpful_count, not_helpful_count, created_at")
        .in("id", articleIds)
        .eq("published", true)
        .order("helpful_count", { ascending: false });

      return arts || [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!moduleKey,
  });

  if (articles.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Artigos Relacionados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {articles.slice(0, 5).map((a: any) => (
          <Link
            key={a.id}
            to={`/central-de-ajuda/${a.slug}`}
            className="block p-2 rounded-md hover:bg-muted transition-colors"
          >
            <p className="text-sm font-medium text-foreground leading-tight">{a.title}</p>
            {a.summary && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.summary}</p>
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
