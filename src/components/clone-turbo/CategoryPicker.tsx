import { useState, useEffect, useRef, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, Search, Star, Loader2 } from 'lucide-react';
import { useSellerCategories, formatGmv } from '@/hooks/useSellerCategories';
import { cn } from '@/lib/utils';

interface MlSearchResult {
  domain_id: string;
  domain_name: string;
  category_id: string;
  category_name: string;
}

interface Props {
  accountId: string | null;
  value: string;
  originCategoryId?: string;
  originCategoryName?: string;
  onSelect: (categoryId: string, categoryName: string) => void;
}

export function CategoryPicker({ accountId, value, originCategoryId, originCategoryName, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MlSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: sellerCategories = [], isLoading: loadingCategories } = useSellerCategories(accountId);

  // Resolve display label
  useEffect(() => {
    if (value && !selectedLabel) {
      // Check seller categories first
      const match = sellerCategories.find(c => c.category_id === value);
      if (match) {
        setSelectedLabel(match.category_name);
      } else if (value === originCategoryId && originCategoryName) {
        setSelectedLabel(originCategoryName);
      } else {
        setSelectedLabel(value); // fallback to ID
      }
    }
  }, [value, sellerCategories, originCategoryId, originCategoryName, selectedLabel]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query || query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?q=${encodeURIComponent(query)}&limit=10`
        );
        if (res.ok) {
          const data: MlSearchResult[] = await res.json();
          setSearchResults(data);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const handleSelect = (categoryId: string, categoryName: string) => {
    setSelectedLabel(categoryName);
    onSelect(categoryId, categoryName);
    setOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const displayValue = selectedLabel || (value ? value : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal h-10 text-sm',
            !displayValue && 'text-muted-foreground'
          )}
        >
          <span className="truncate">
            {displayValue || 'Selecionar categoria...'}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar categoria por nome..."
            value={searchQuery}
            onValueChange={handleSearch}
          />
          <CommandList>
            <CommandEmpty>
              {searching ? (
                <div className="flex items-center gap-2 justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando...
                </div>
              ) : searchQuery.length >= 2 ? (
                'Nenhuma categoria encontrada.'
              ) : (
                'Digite para buscar categorias do ML.'
              )}
            </CommandEmpty>

            {/* Origin category if present */}
            {originCategoryId && !searchQuery && (
              <CommandGroup heading="Categoria da origem">
                <CommandItem
                  value={`origin-${originCategoryId}`}
                  onSelect={() => handleSelect(originCategoryId, originCategoryName || originCategoryId)}
                  className="flex items-center gap-2"
                >
                  <Badge variant="outline" className="text-xs shrink-0">Origem</Badge>
                  <span className="truncate text-sm">{originCategoryName || originCategoryId}</span>
                  {value === originCategoryId && <span className="ml-auto text-xs text-primary">✓</span>}
                </CommandItem>
              </CommandGroup>
            )}

            {/* Seller's categories */}
            {!searchQuery && sellerCategories.length > 0 && (
              <>
                {originCategoryId && <CommandSeparator />}
                <CommandGroup heading="Suas categorias">
                  {sellerCategories.slice(0, 8).map(cat => (
                    <CommandItem
                      key={cat.category_id}
                      value={`seller-${cat.category_id}`}
                      onSelect={() => handleSelect(cat.category_id, cat.category_name)}
                      className="flex items-center gap-2"
                    >
                      <Star className="h-3 w-3 text-amber-500 shrink-0" />
                      <span className="truncate text-sm flex-1">{cat.category_name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatGmv(cat.gmv_90d)}
                      </span>
                      {value === cat.category_id && <span className="text-xs text-primary">✓</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {!searchQuery && loadingCategories && (
              <CommandGroup heading="Suas categorias">
                <CommandItem disabled className="justify-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Carregando...
                </CommandItem>
              </CommandGroup>
            )}

            {/* Search results */}
            {searchQuery.length >= 2 && searchResults.length > 0 && (
              <CommandGroup heading="Resultados da busca">
                {searchResults.map((r, i) => (
                  <CommandItem
                    key={`${r.category_id}-${i}`}
                    value={`search-${r.category_id}-${i}`}
                    onSelect={() => handleSelect(r.category_id, r.category_name)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="text-sm">{r.category_name}</span>
                    <span className="text-xs text-muted-foreground">{r.domain_name} · {r.category_id}</span>
                    {value === r.category_id && <span className="absolute right-2 text-xs text-primary">✓</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
