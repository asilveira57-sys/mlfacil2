import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Verificar = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const token = searchParams.get("t");

  useEffect(() => {
    if (!token) {
      setError("Link inválido.");
      return;
    }

    const resolve = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          `resolve-verification-link?t=${encodeURIComponent(token)}`,
          { method: "GET" },
        );

        if (fnError || !data?.url) {
          const code = (data as { error?: string } | null)?.error;
          if (code === "already_used") setError("Este link já foi utilizado.");
          else if (code === "expired") setError("Este link expirou. Solicite um novo ao suporte.");
          else setError("Link não encontrado ou já expirado.");
          return;
        }

        window.location.href = data.url as string;
      } catch {
        setError("Não foi possível validar o link. Tente novamente.");
      }
    };

    resolve();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-foreground">Verificação</h1>
            <p className="text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Redirecionando...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default Verificar;
