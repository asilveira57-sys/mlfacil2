/**
 * Settings Support Tab
 * Toggle floating support button visibility + ticket management
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { MessageCircle } from 'lucide-react';
import { SupportTicketList } from '@/components/support/SupportTicketList';
import { SupportTicketDetail } from '@/components/support/SupportTicketDetail';
import { CreateTicketDialog } from '@/components/support/CreateTicketDialog';
import { useUtilitiesPreferences } from '@/hooks/useUtilitiesPreferences';

export function SettingsSupport() {
  const { t } = useTranslation();
  const { preferences, loading, updatePreferences } = useUtilitiesPreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Auto-open ticket from URL param
  useEffect(() => {
    const ticketId = searchParams.get('ticket');
    if (ticketId) {
      setSelectedTicketId(ticketId);
    }
  }, [searchParams]);

  const handleBack = () => {
    setSelectedTicketId(null);
    // Remove ticket param from URL
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('ticket');
    setSearchParams(newParams, { replace: true });
  };

  const handleToggleSupportButton = (checked: boolean) => {
    updatePreferences({ showSupportButton: checked });
  };

  if (selectedTicketId) {
    return (
      <SupportTicketDetail
        ticketId={selectedTicketId}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Floating button preference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {t('utilities:support.button_title', { defaultValue: 'Botão de Suporte Flutuante' })}
          </CardTitle>
          <CardDescription>
            {t('utilities:support.button_description', { defaultValue: 'Configure a visibilidade do botão flutuante de suporte que aparece em todas as páginas.' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="support-btn-toggle">
                {t('utilities:support.show_button', { defaultValue: 'Exibir botão flutuante de suporte' })}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('utilities:support.show_button_hint', { defaultValue: 'O botão aparece automaticamente ao fazer login. Você pode fechá-lo temporariamente a qualquer momento.' })}
              </p>
            </div>
            <Switch
              id="support-btn-toggle"
              checked={preferences.showSupportButton}
              onCheckedChange={handleToggleSupportButton}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Ticket list */}
      <SupportTicketList
        onSelectTicket={setSelectedTicketId}
        onCreateTicket={() => setCreateDialogOpen(true)}
      />

      <CreateTicketDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        screenshot={null}
        context={null}
        onClearScreenshot={() => {}}
      />
    </div>
  );
}
