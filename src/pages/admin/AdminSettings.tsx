import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { 
  Settings,
  Globe,
  Image,
  Mail,
  Link as LinkIcon,
  Save
} from 'lucide-react';
import { usePlatformSettings } from '@/hooks/useAdmin';
import { toast } from 'sonner';

export function AdminSettings() {
  const { data: settings, isLoading, updateSetting } = usePlatformSettings();

  // Local form state
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const getSettingValue = (key: string): string => {
    if (formValues[key] !== undefined) return formValues[key];
    const setting = settings?.find(s => s.key === key);
    if (!setting) return '';
    if (typeof setting.value === 'string') {
      return setting.value.replace(/^"|"$/g, '');
    }
    if (typeof setting.value === 'object') {
      return JSON.stringify(setting.value);
    }
    return String(setting.value);
  };

  const handleChange = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      const value = formValues[key] ?? getSettingValue(key);
      // Wrap string values in quotes for JSON storage
      const jsonValue = key === 'footer_links' || key === 'system_emails' 
        ? value 
        : JSON.stringify(value);
      await updateSetting.mutateAsync({ key, value: jsonValue });
      toast.success('Configuração salva');
    } catch (error) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(null);
    }
  };

  const generalSettings = settings?.filter(s => s.category === 'general') || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configurações Gerais</h1>
        <p className="text-muted-foreground">
          Configure informações básicas da plataforma
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <>
          {/* Platform Identity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Identidade da Plataforma
              </CardTitle>
              <CardDescription>
                Nome, domínio e logotipo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nome da Plataforma</Label>
                  <div className="flex gap-2">
                    <Input
                      value={getSettingValue('platform_name')}
                      onChange={(e) => handleChange('platform_name', e.target.value)}
                      placeholder="Nome da plataforma"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => handleSave('platform_name')}
                      disabled={saving === 'platform_name'}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Domínio</Label>
                  <div className="flex gap-2">
                    <Input
                      value={getSettingValue('platform_domain')}
                      onChange={(e) => handleChange('platform_domain', e.target.value)}
                      placeholder="exemplo.com"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => handleSave('platform_domain')}
                      disabled={saving === 'platform_domain'}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>URL do Logotipo</Label>
                <div className="flex gap-2">
                  <Input
                    value={getSettingValue('platform_logo_url')}
                    onChange={(e) => handleChange('platform_logo_url', e.target.value)}
                    placeholder="https://..."
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => handleSave('platform_logo_url')}
                    disabled={saving === 'platform_logo_url'}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
                {getSettingValue('platform_logo_url') && (
                  <div className="mt-2 p-4 bg-muted rounded-lg">
                    <img 
                      src={getSettingValue('platform_logo_url')} 
                      alt="Logo preview" 
                      className="h-12 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* System Emails */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                E-mails do Sistema
              </CardTitle>
              <CardDescription>
                Configure os e-mails usados pelo sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>E-mails (JSON)</Label>
                <div className="flex gap-2">
                  <Textarea
                    value={getSettingValue('system_emails')}
                    onChange={(e) => handleChange('system_emails', e.target.value)}
                    placeholder='{"support": "suporte@exemplo.com", "noreply": "noreply@exemplo.com"}'
                    rows={3}
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => handleSave('system_emails')}
                    disabled={saving === 'system_emails'}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Formato JSON: {`{"support": "email", "noreply": "email"}`}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Footer Links */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5" />
                Links do Rodapé
              </CardTitle>
              <CardDescription>
                Configure os links exibidos no rodapé
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Links (JSON Array)</Label>
                <div className="flex gap-2">
                  <Textarea
                    value={getSettingValue('footer_links')}
                    onChange={(e) => handleChange('footer_links', e.target.value)}
                    placeholder='[{"label": "Termos", "url": "/termos"}, {"label": "Privacidade", "url": "/privacidade"}]'
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => handleSave('footer_links')}
                    disabled={saving === 'footer_links'}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Formato: {`[{"label": "Nome", "url": "/caminho"}]`}
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
