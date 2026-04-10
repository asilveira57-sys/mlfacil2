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
      const { data, error: fetchError } = await supabase
        .from("verification_links")
        .select("verification_url, expires_at, used")
        .eq("id", token)
        .maybeSingle();

      if (fetchError || !data) {
        setError("Link não encontrado ou já expirado.");
        return;
      }

      if (data.used) {
        setError("Este link já foi utilizado.");
        return;
      }

      if (new Date(data.expires_at) < new Date()) {
        setError("Este link expirou. Solicite um novo ao suporte.");
        return;
      }

      // Redirect to the real verification URL
      window.location.href = data.verification_url;
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
