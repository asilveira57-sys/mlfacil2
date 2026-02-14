import { useState, useCallback } from "react";
import { Search, Link as LinkIcon, ExternalLink, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface AdLinkSearchModalProps {
  sellerId: string;
  onInsertLink: (link: string) => void;
}

interface SearchResult {
  item_id: string;
  title: string;
  sku: string | null;
  thumbnail: string | null;
  permalink: string | null;
  price: number | null;
}

export function AdLinkSearchModal({ sellerId, onInsertLink }: AdLinkSearchModalProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!search.trim() || search.trim().length < 2) return;
    
    setLoading(true);
    setSearched(true);
    
    try {
      // Search in meli_order_items_cache for items with permalink
      const searchTerm = `%${search.trim()}%`;
      
      const { data, error } = await supabase
        .from('meli_order_items_cache')
        .select('item_id, title, sku, thumbnail, permalink')
        .eq('seller_id', sellerId)
        .not('permalink', 'is', null)
        .or(`title.ilike.${searchTerm},sku.ilike.${searchTerm},item_id.ilike.${searchTerm}`)
        .order('last_sync_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Deduplicate by item_id and pick the first occurrence
      const seen = new Map<string, SearchResult>();
      for (const item of data || []) {
        if (!seen.has(item.item_id)) {
          seen.set(item.item_id, {
            item_id: item.item_id,
            title: item.title || item.item_id,
            sku: item.sku,
            thumbnail: item.thumbnail,
            permalink: item.permalink,
            price: null,
          });
        }
      }

      // If no results in items cache, try analyzed_items
      if (seen.size === 0) {
        const { data: analyzed } = await supabase
          .from('analyzed_items')
          .select('item_id, title, thumbnail, permalink, price')
          .or(`title.ilike.${searchTerm},item_id.ilike.${searchTerm}`)
          .not('permalink', 'is', null)
          .limit(50);

        for (const item of analyzed || []) {
          if (!seen.has(item.item_id)) {
            seen.set(item.item_id, {
              item_id: item.item_id,
              title: item.title || item.item_id,
              sku: null,
              thumbnail: item.thumbnail,
              permalink: item.permalink,
              price: item.price,
            });
          }
        }
      }

      setResults(Array.from(seen.values()));
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [search, sellerId]);

  const handleInsert = (item: SearchResult) => {
    if (item.permalink) {
      onInsertLink(item.permalink);
      setOpen(false);
      setSearch("");
      setResults([]);
      setSearched(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setSearch(""); setResults([]); setSearched(false); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <LinkIcon className="h-3 w-3 mr-1" />
          Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inserir link de anúncio</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, SKU ou MLB..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
                autoFocus
              />
            </div>
            <Button onClick={handleSearch} disabled={loading || search.trim().length < 2}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
          </div>

          {/* Results */}
          <ScrollArea className="max-h-[350px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-2">
                {results.map((item) => (
                  <div
                    key={item.item_id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors group"
                  >
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt=""
                        className="w-12 h-12 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.sku && (
                          <Badge variant="outline" className="text-[10px]">
                            SKU: {item.sku}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">{item.item_id}</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0 h-8 text-xs"
                      onClick={() => handleInsert(item)}
                      disabled={!item.permalink}
                    >
                      <LinkIcon className="h-3 w-3 mr-1" />
                      Inserir
                    </Button>
                  </div>
                ))}
              </div>
            ) : searched ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhum anúncio encontrado</p>
                <p className="text-xs mt-1">Tente buscar por outro termo</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Busque por título, SKU ou código MLB</p>
                <p className="text-xs mt-1">Apenas links do Mercado Livre serão inseridos</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
