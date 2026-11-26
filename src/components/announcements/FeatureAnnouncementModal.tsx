import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";
import { useUserRole } from "@/hooks/useUserRole";
import { usePlanAllowedModuleKeys } from "@/hooks/useCanAccessModule";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Filter, CalendarCheck, Undo2, ArrowRight, Sparkles } from "lucide-react";

/**
 * Pop-up de novidade: abre UMA vez por usuário (registro em
 * user_feature_announcements_seen). Fechou ou clicou → não abre mais,
 * em nenhum navegador.
 *
 * Para um próximo anúncio, troque ANNOUNCEMENT_KEY e o conteúdo.
 */
const ANNOUNCEMENT_KEY = "availability_time_2026_11";
const MODULE_KEY = "operacional.availability_time";
const ROUTE = "/tempo-disponibilidade";

export function FeatureAnnouncementModal() {
  const userId = useCurrentUserId();
  const { isAdmin } = useUserRole();
  const { keys, hasConfig, isLoading: planLoading } = usePlanAllowedModuleKeys();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const temAcesso = isAdmin || !hasConfig || keys.has(MODULE_KEY);

  useEffect(() => {
    if (!userId || planLoading || !temAcesso) return;
    if (location.pathname.startsWith(ROUTE)) return; // já está na ferramenta
    let cancelado = false;

    const timer = setTimeout(async () => {
      const { data, error } = await (supabase as any)
        .from("user_feature_announcements_seen")
        .select("announcement_key")
        .eq("user_id", userId)
        .eq("announcement_key", ANNOUNCEMENT_KEY)
        .maybeSingle();
      if (!cancelado && !error && !data) setOpen(true);
    }, 1500); // deixa a página carregar antes

    return () => { cancelado = true; clearTimeout(timer); };
    // Só decide uma vez por sessão de página; não reabre ao trocar de rota
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, planLoading, temAcesso]);

  const registrar = async (action: "abriu_ferramenta" | "fechou") => {
    setOpen(false);
    if (!userId) return;
    await (supabase as any)
      .from("user_feature_announcements_seen")
      .upsert({ user_id: userId, announcement_key: ANNOUNCEMENT_KEY, action },
        { onConflict: "user_id,announcement_key", ignoreDuplicates: true });
  };

  const passos = [
    { icon: Filter, titulo: "Filtre os produtos", texto: "Busque pelo título com vários termos e tire o que não entra." },
    { icon: CalendarCheck, titulo: "Configure a disponibilidade", texto: "Defina os dias e aplique em todos de uma vez." },
    { icon: Undo2, titulo: "Remova em lote", texto: "Desfez? Volte os anúncios para sem prazo com um clique." },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) void registrar("fechou"); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
        <div className="bg-primary text-primary-foreground px-6 pt-6 pb-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-90">
            <Sparkles className="h-3.5 w-3.5" /> Novidade
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="h-11 w-11 rounded-xl bg-primary-foreground/15 flex items-center justify-center shrink-0">
              <Clock className="h-6 w-6" />
            </div>
            <DialogTitle className="text-xl leading-tight text-primary-foreground">
              Tempo de Disponibilidade em lote
            </DialogTitle>
          </div>
          <DialogDescription className="text-primary-foreground/85 mt-3 text-sm">
            Para quem trabalha com disponibilidade de estoque no Mercado Livre: chega de ajustar anúncio por anúncio.
          </DialogDescription>
        </div>

        <ul className="px-6 py-5 space-y-4">
          {passos.map(({ icon: Icon, titulo, texto }) => (
            <li key={titulo} className="flex gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-sm">{titulo}</p>
                <p className="text-sm text-muted-foreground">{texto}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => void registrar("fechou")}>Agora não</Button>
          <Button onClick={() => { void registrar("abriu_ferramenta"); navigate(ROUTE); }}>
            Experimentar agora <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground text-center pb-4 -mt-2">
          Fica em Mercado Livre › Tempo de Disponibilidade
        </p>
      </DialogContent>
    </Dialog>
  );
}
