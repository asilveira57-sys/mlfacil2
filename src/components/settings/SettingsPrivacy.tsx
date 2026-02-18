import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Shield,
  Cookie,
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  Clock,
  SmilePlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getStoredConsent } from '@/lib/cookies/consent';
import { generateConsentPdf, recordConsentOnServer } from '@/lib/cookies/api';
import { CookiePreferencesModal } from './CookiePreferencesModal';

interface ConsentRecord {
  id: string;
  consent_scope: string;
  consent_type: string;
  document_version: string;
  accepted_at: string;
  ip_address: string | null;
  source: string;
  pdf_path: string | null;
  performance: boolean | null;
  analytics: boolean | null;
}

interface SentimentRecord {
  id: string;
  context: string;
  sentiment: string;
  comment: string | null;
  created_at: string;
}

const SENTIMENT_LABELS: Record<string, { label: string; emoji: string }> = {
  muito_satisfeito: { label: 'Muito satisfeito', emoji: '😄' },
  satisfeito: { label: 'Satisfeito', emoji: '🙂' },
  neutro: { label: 'Neutro', emoji: '😐' },
  insatisfeito: { label: 'Insatisfeito', emoji: '😕' },
  muito_insatisfeito: { label: 'Muito insatisfeito', emoji: '😞' },
};

export function SettingsPrivacy() {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [sentiments, setSentiments] = useState<SentimentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState('');
  const [comment, setComment] = useState('');
  const [savingSentiment, setSavingSentiment] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);

  const localConsent = getStoredConsent();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [consentsRes, sentimentsRes] = await Promise.all([
        supabase
          .from('user_consents')
          .select('id, consent_scope, consent_type, document_version, accepted_at, ip_address, source, pdf_path, performance, analytics')
          .order('accepted_at', { ascending: false })
          .limit(20),
        supabase
          .from('user_sentiments')
          .select('id, context, sentiment, comment, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      if (consentsRes.data) setConsents(consentsRes.data);
      if (sentimentsRes.data) setSentiments(sentimentsRes.data);
    } catch (err) {
      console.error('Failed to fetch privacy data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownloadPdf = async (consentId: string) => {
    setDownloadingId(consentId);
    try {
      const url = await generateConsentPdf(consentId);
      if (url) {
        window.open(url, '_blank');
        toast.success('PDF gerado com sucesso!');
        fetchData(); // Refresh to show pdf_path
      } else {
        toast.error('Erro ao gerar PDF');
      }
    } catch {
      toast.error('Erro ao gerar PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSaveSentiment = async () => {
    if (!sentiment) {
      toast.error('Selecione um sentimento');
      return;
    }
    setSavingSentiment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Você precisa estar logado');
        return;
      }
      const { error } = await supabase.from('user_sentiments').insert({
        user_id: user.id,
        context: 'privacy_settings' as any,
        sentiment: sentiment as any,
        comment: comment || null,
      });
      if (error) throw error;
      toast.success('Feedback salvo!');
      setSentiment('');
      setComment('');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar feedback');
    } finally {
      setSavingSentiment(false);
    }
  };

  const handleCookiePreferencesSaved = () => {
    setShowCookieModal(false);
    fetchData();
  };

  const latestCookie = consents.find((c) => c.consent_scope === 'cookies');
  const latestTerms = consents.find((c) => c.consent_scope === 'terms');

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Cookies Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cookie className="h-4 w-4 text-primary" />
              Cookies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestCookie ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm">Consentimento registrado</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Tipo: <Badge variant="outline" className="ml-1">{latestCookie.consent_type}</Badge></span>
                  <span>Versão: {latestCookie.document_version}</span>
                  <span className="col-span-2">
                    <Clock className="inline h-3 w-3 mr-1" />
                    {formatDate(latestCookie.accepted_at)}
                  </span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setShowCookieModal(true)}>
                    Revisar preferências
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownloadPdf(latestCookie.id)}
                    disabled={downloadingId === latestCookie.id}
                  >
                    {downloadingId === latestCookie.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="ml-1">PDF</span>
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                {localConsent ? (
                  <span>Consentimento local salvo (versão {localConsent.version}). Será sincronizado automaticamente.</span>
                ) : (
                  <span>Nenhum consentimento registrado.</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Terms Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Termos de Uso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestTerms ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm">Termos aceitos</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Versão: {latestTerms.document_version}</span>
                  <span>
                    <Clock className="inline h-3 w-3 mr-1" />
                    {formatDate(latestTerms.accepted_at)}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDownloadPdf(latestTerms.id)}
                  disabled={downloadingId === latestTerms.id}
                >
                  {downloadingId === latestTerms.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span className="ml-1">Baixar termo aceito (PDF)</span>
                </Button>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                Nenhum aceite de termos registrado.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Consent History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Histórico de Consentimentos
          </CardTitle>
          <CardDescription>Últimos 20 registros</CardDescription>
        </CardHeader>
        <CardContent>
          {consents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum consentimento registrado ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Escopo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Versão</TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="text-right">PDF</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consents.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Badge variant={c.consent_scope === 'cookies' ? 'default' : 'secondary'}>
                          {c.consent_scope === 'cookies' ? 'Cookies' : 'Termos'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{c.consent_type}</TableCell>
                      <TableCell className="text-sm">{c.document_version}</TableCell>
                      <TableCell className="text-sm">{formatDate(c.accepted_at)}</TableCell>
                      <TableCell className="text-sm">{c.source}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.ip_address || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownloadPdf(c.id)}
                          disabled={downloadingId === c.id}
                        >
                          {downloadingId === c.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sentiment Feedback */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SmilePlus className="h-4 w-4" />
            Como você se sente sobre a privacidade?
          </CardTitle>
          <CardDescription>Seu feedback nos ajuda a melhorar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="sentiment-select">Sentimento</Label>
              <Select value={sentiment} onValueChange={setSentiment}>
                <SelectTrigger id="sentiment-select">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SENTIMENT_LABELS).map(([key, { label, emoji }]) => (
                    <SelectItem key={key} value={key}>
                      {emoji} {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="comment-input">Comentário (opcional)</Label>
              <Textarea
                id="comment-input"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Conte-nos mais..."
                rows={2}
              />
            </div>
          </div>
          <Button onClick={handleSaveSentiment} disabled={savingSentiment || !sentiment} size="sm">
            {savingSentiment && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Enviar feedback
          </Button>

          {sentiments.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Seus feedbacks anteriores:</p>
                {sentiments.map((s) => (
                  <div key={s.id} className="flex items-start gap-2 text-sm p-2 rounded bg-muted/50">
                    <span>{SENTIMENT_LABELS[s.sentiment]?.emoji || '❓'}</span>
                    <div>
                      <span className="font-medium">{SENTIMENT_LABELS[s.sentiment]?.label || s.sentiment}</span>
                      {s.comment && <p className="text-xs text-muted-foreground mt-0.5">{s.comment}</p>}
                      <p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Cookie Preferences Modal */}
      <CookiePreferencesModal
        open={showCookieModal}
        onOpenChange={setShowCookieModal}
        onSaved={handleCookiePreferencesSaved}
      />
    </div>
  );
}
