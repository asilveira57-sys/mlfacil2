import { useState, useEffect, useCallback } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Link2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SellerListing {
  id: string;
  item_id: string;
  title: string;
  title_short: string | null;
  sku: string | null;
  price: number;
  thumbnail: string | null;
  status: string | null;
}

interface SellerListingSelectorProps {
  sellerId: string;
  value: {
    refType: string | null;
    refId: string | null;
    listingId: string | null;
    title: string | null;
    sku: string | null;
    price: number | null;
  } | null;
  onChange: (value: {
    refType: string;
    refId: string;
    listingId: string;
    title: string;
    sku: string | null;
    price: number;
  } | null) => void;
  disabled?: boolean;
}

export function SellerListingSelector({ sellerId, value, onChange, disabled }: SellerListingSelectorProps) {
  const [open, setOpen] = useState(false);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchListings = useCallback(async (search?: string) => {
    if (!sellerId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('meli_listings_cache')
        .select('id, item_id, title, title_short, sku, price, thumbnail, status')
        .eq('seller_id', sellerId)
        .eq('status', 'active')
        .order('title', { ascending: true })
        .limit(50);

      if (search && search.length >= 2) {
        query = query.or(`title.ilike.%${search}%,sku.ilike.%${search}%,item_id.ilike.%${search}%`);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      setListings(data || []);
    } catch (error: any) {
      console.error('Error fetching listings:', error);
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    if (open && listings.length === 0) {
      fetchListings();
    }
  }, [open, fetchListings, listings.length]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (open && searchQuery) {
        fetchListings(searchQuery);
      }
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, open, fetchListings]);

  const handleSelect = (listing: SellerListing) => {
    onChange({
      refType: 'meli_listings_cache',
      refId: listing.id,
      listingId: listing.item_id,
      title: listing.title_short || listing.title,
      sku: listing.sku,
      price: listing.price,
    });
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  if (listings.length === 0 && !loading && !open) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        <Link2 className="h-6 w-6 mx-auto mb-2 opacity-50" />
        <p>Nenhum anúncio próprio encontrado</p>
        <p className="text-xs mt-1">Sincronize seus anúncios do Mercado Livre primeiro</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {value?.refId ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{value.title}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {value.sku && <span>SKU: {value.sku}</span>}
              {value.listingId && <Badge variant="outline" className="text-xs">{value.listingId}</Badge>}
              {value.price && <span className="font-medium text-foreground">{formatCurrency(value.price)}</span>}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            disabled={disabled}
            className="flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Selecionar seu anúncio
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar por título, SKU ou MLB..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                <CommandEmpty>
                  {loading ? 'Carregando...' : 'Nenhum anúncio encontrado'}
                </CommandEmpty>
                <CommandGroup>
                  {listings.map((listing) => (
                    <CommandItem
                      key={listing.id}
                      value={listing.id}
                      onSelect={() => handleSelect(listing)}
                      className="flex items-center gap-3 py-3"
                    >
                      {listing.thumbnail ? (
                        <img
                          src={listing.thumbnail}
                          alt=""
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                          <Link2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {listing.title_short || listing.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {listing.sku && <span>SKU: {listing.sku}</span>}
                          <span>{formatCurrency(listing.price)}</span>
                        </div>
                      </div>
                      <Check
                        className={cn(
                          "ml-auto h-4 w-4",
                          value?.refId === listing.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
