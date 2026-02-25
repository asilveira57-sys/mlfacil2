import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Search, BookOpen, ChevronRight, HelpCircle, MessageSquare, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function CentralDeAjuda() {
  const [search, setSearch] = useState("");

  const { data: categories = [] } = useQuery({
    queryKey: ["help-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_categories")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["help-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("*, help_categories(name, slug)")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = search.trim()
    ? articles.filter(
        (a: any) =>
          a.title.toLowerCase().includes(search.toLowerCase()) ||
          a.summary?.toLowerCase().includes(search.toLowerCase())
      )
    : articles;

  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const displayed = selectedCat
    ? filtered.filter((a: any) => a.help_categories?.slug === selectedCat)
    : filtered;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 py-6 text-center">
          <HelpCircle className="h-10 w-10 mx-auto mb-3 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Central de Ajuda</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Encontre respostas para suas dúvidas sobre a plataforma.
          </p>
          <div className="max-w-md mx-auto mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar artigos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              maxLength={100}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8 max-w-4xl">
        {/* Categories */}
        <div className="flex flex-wrap gap-2 justify-center">
          <Badge
            variant={selectedCat === null ? "default" : "outline"}
            className="cursor-pointer px-3 py-1.5"
            onClick={() => setSelectedCat(null)}
          >
            Todos
          </Badge>
          {categories.map((cat: any) => (
            <Badge
              key={cat.id}
              variant={selectedCat === cat.slug ? "default" : "outline"}
              className="cursor-pointer px-3 py-1.5"
              onClick={() => setSelectedCat(cat.slug === selectedCat ? null : cat.slug)}
            >
              {cat.name}
            </Badge>
          ))}
        </div>

        {/* Articles */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="py-5 space-y-2">
                  <div className="h-5 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nenhum artigo encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {displayed.map((article: any) => (
              <Link key={article.id} to={`/central-de-ajuda/${article.slug}`}>
                <Card className="hover:shadow-md transition-all hover:border-primary/30 cursor-pointer">
                  <CardContent className="py-4 flex items-center gap-4">
                    <BookOpen className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-foreground">{article.title}</h3>
                      {article.summary && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {article.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <Badge variant="outline" className="text-[10px]">
                          {article.help_categories?.name}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Eye className="h-3 w-3" /> {article.views}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Contact CTA */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-6 text-center">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-primary" />
            <h3 className="font-semibold text-foreground">Não encontrou o que procurava?</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              Entre em contato com nossa equipe.
            </p>
            <Link to="/contato">
              <Button size="sm" className="gap-2">
                <MessageSquare className="h-4 w-4" /> Falar com suporte
              </Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
