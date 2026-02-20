import { useState, useMemo } from 'react';
import { Search, Filter, BookOpen, Sparkles, ChevronDown } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConsultantTipCard } from '@/components/consultant-tips/ConsultantTipCard';
import { useConsultantTips } from '@/hooks/useConsultantTips';
import { cn } from '@/lib/utils';

const NIVEIS = [
  { value: 'all', label: 'Todos os níveis' },
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado', label: 'Avançado' },
];

const TIPOS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'texto', label: 'Texto' },
  { value: 'imagem', label: 'Imagem' },
  { value: 'video', label: 'Vídeo' },
  { value: 'carrossel', label: 'Carrossel' },
];

export default function ConsultantLibrary() {
  const [search, setSearch] = useState('');
  const [nivel, setNivel] = useState('all');
  const [tipo, setTipo] = useState('all');
  const [categoria, setCategoria] = useState('all');

  const { data: tips = [], isLoading } = useConsultantTips({
    nivel: nivel !== 'all' ? nivel : undefined,
    tipo: tipo !== 'all' ? tipo : undefined,
    categoria: categoria !== 'all' ? categoria : undefined,
  });

  // Extract unique categories
  const categorias = useMemo(() => {
    const cats = Array.from(new Set(tips.map(t => t.categoria).filter(Boolean)));
    return cats as string[];
  }, [tips]);

  // Client-side search on title + tags
  const filtered = useMemo(() => {
    if (!search.trim()) return tips;
    const q = search.toLowerCase();
    return tips.filter(t =>
      t.titulo.toLowerCase().includes(q) ||
      t.categoria?.toLowerCase().includes(q) ||
      t.tags?.some(tag => tag.toLowerCase().includes(q))
    );
  }, [tips, search]);

  return (
    <PageContainer
      title="Biblioteca de Dicas"
      subtitle="Estratégias e insights do consultor para vender melhor"
    >
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>
            <span className="font-semibold text-foreground">{filtered.length}</span> dicas disponíveis
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título, categoria ou tag..."
              className="pl-9"
            />
          </div>

          <Select value={nivel} onValueChange={setNivel}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NIVEIS.map(n => (
                <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {categorias.length > 0 && (
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categorias.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(search || nivel !== 'all' || tipo !== 'all' || categoria !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setNivel('all'); setTipo('all'); setCategoria('all'); }}
              className="text-muted-foreground"
            >
              Limpar filtros
            </Button>
          )}
        </div>

        {/* Cards grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-muted/20 animate-pulse h-64" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">Nenhuma dica encontrada</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Tente ajustar os filtros de busca</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map(tip => (
              <ConsultantTipCard key={tip.id} tip={tip} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
