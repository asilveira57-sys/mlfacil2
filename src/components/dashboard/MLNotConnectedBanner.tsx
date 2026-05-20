import { BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCollaboratorAccess } from "@/hooks/useCollaboratorAccess";

interface Props {
  onConnect: () => void;
}

/**
 * Light, non-aggressive banner shown once on the dashboard
 * when the user hasn't connected their ML account yet.
 * Designed to feel like a helpful suggestion, not an error.
 */
export function MLNotConnectedBanner({ onConnect }: Props) {
  const { isCollaborator } = useCollaboratorAccess();

  if (isCollaborator) return null;

  return (
    <Card className="border border-border/60 bg-card shadow-sm">
      <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <BarChart3 className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm text-foreground font-medium">
            Conecte sua conta do Mercado Livre para liberar todas as funcionalidades do sistema.
          </p>
        </div>
        <Button
          size="sm"
          onClick={onConnect}
          className="gap-2 flex-shrink-0"
        >
          Conectar conta <ArrowRight className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
