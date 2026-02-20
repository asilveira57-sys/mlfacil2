import { useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays, BookOpen, Settings } from 'lucide-react';
import { SocialCalendarMainView } from '@/components/social-calendar/SocialCalendarMainView';
import { SocialCalendarSavedIdeas } from '@/components/social-calendar/SocialCalendarSavedIdeas';
import { SocialCalendarSettings } from '@/components/social-calendar/SocialCalendarSettings';

export default function SocialCalendar() {
  const [tab, setTab] = useState('calendar');

  return (
    <PageContainer
      title="📅 Calendário de Rede Social"
      subtitle="Datas temáticas, feriados e ideias de conteúdo para marketplace"
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Calendário
          </TabsTrigger>
          <TabsTrigger value="ideas" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Minhas Pautas
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <SocialCalendarMainView />
        </TabsContent>

        <TabsContent value="ideas">
          <SocialCalendarSavedIdeas />
        </TabsContent>

        <TabsContent value="settings">
          <SocialCalendarSettings />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
