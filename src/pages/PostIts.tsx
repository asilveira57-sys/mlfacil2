import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StickyNote, Filter, Pin, ToggleRight, ToggleLeft } from 'lucide-react';
import { useSetPageHeader } from '@/components/layout/AppShellLayout';
import { PageContainer } from '@/components/layout/PageContainer';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useNotes } from '@/hooks/useNotes';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAvailableModules } from '@/hooks/useActiveModuleKey';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import type { NotePin } from '@/types/notes';

const FAB_DISMISSED_KEY = 'postit-fab-dismissed';

export default function PostIts() {
  const { t } = useTranslation('notes');
  const { sellerId } = useActiveAccount();
  const { data: workspaceId } = useCurrentWorkspaceId();
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [fabActive, setFabActive] = useState(() => localStorage.getItem(FAB_DISMISSED_KEY) !== 'true');

  const toggleFab = () => {
    if (fabActive) {
      localStorage.setItem(FAB_DISMISSED_KEY, 'true');
      setFabActive(false);
    } else {
      localStorage.removeItem(FAB_DISMISSED_KEY);
      setFabActive(true);
      window.dispatchEvent(new Event('postit-fab-reactivate'));
    }
  };

  useSetPageHeader('Post-its', t('postit.page_description', { defaultValue: 'Notas fixadas nos módulos' }));

  const { notes, isLoading } = useNotes({
    workspaceId: workspaceId ?? null,
    companyId: sellerId,
    search,
  });

  // Fetch all pins for this workspace
  const { data: allPins = [] } = useQuery({
    queryKey: ['all-note-pins', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      const { data, error } = await supabase
        .from('note_pins')
        .select('*')
        .eq('workspace_id', workspaceId);
      if (error) throw error;
      return (data || []) as unknown as NotePin[];
    },
    enabled: !!workspaceId,
  });

  const modules = useMemo(() => getAvailableModules(), []);

  // Only show notes that have at least one pin
  const pinnedNotes = useMemo(() => {
    const pinsByNote = new Map<string, NotePin[]>();
    allPins.forEach((pin) => {
      const list = pinsByNote.get(pin.note_id) || [];
      list.push(pin);
      pinsByNote.set(pin.note_id, list);
    });

    return notes
      .filter((note) => pinsByNote.has(note.id))
      .filter((note) => {
        if (moduleFilter === 'all') return true;
        const pins = pinsByNote.get(note.id) || [];
        return pins.some((p) => p.module_key === moduleFilter);
      })
      .map((note) => ({
        ...note,
        pins: pinsByNote.get(note.id) || [],
      }));
  }, [notes, allPins, moduleFilter]);

  return (
    <PageContainer>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant={fabActive ? 'default' : 'outline'}
            size="sm"
            onClick={toggleFab}
            className="gap-2"
          >
            {fabActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            {t('settings.show_postit_button')}
          </Button>
          <div className="relative flex-1 min-w-[200px]">
            <Input
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm"
            />
          </div>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder={t('pin.select_module')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('postit.all_modules', { defaultValue: 'Todos os módulos' })}</SelectItem>
              {modules.map((m) => (
                <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {t('postit.loading', { defaultValue: 'Carregando...' })}
          </div>
        ) : pinnedNotes.length === 0 ? (
          <div className="text-center py-12">
            <StickyNote className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{t('pin.no_pins')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {pinnedNotes.map((note) => (
              <Card
                key={note.id}
                className="overflow-hidden"
                style={{ borderColor: note.color_hex + '60' }}
              >
                <div className="h-1.5" style={{ backgroundColor: note.color_hex }} />
                <div className="p-3 space-y-2">
                  <h3 className="text-sm font-medium text-foreground truncate">
                    {note.title || t('untitled')}
                  </h3>
                  {note.content_plain && (
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {note.content_plain}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {note.pins.map((pin) => {
                      const mod = modules.find((m) => m.key === pin.module_key);
                      return (
                        <Badge key={pin.id} variant="secondary" className="text-[10px] gap-1">
                          <Pin className="h-2.5 w-2.5" />
                          {mod?.label || pin.module_key}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
