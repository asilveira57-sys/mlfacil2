import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function LandingCTA() {
  const navigate = useNavigate();

  return (
    <section className="py-20 md:py-28 bg-primary">
      <div className="container mx-auto px-4 md:px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
          Pronto para escalar suas vendas?
        </h2>
        <p className="text-lg text-primary-foreground/80 max-w-2xl mx-auto mb-10">
          Junte-se a milhares de sellers que já estão usando nossa plataforma para vender mais e com mais inteligência.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            variant="secondary"
            className="text-base px-8 py-6 gap-2"
            onClick={() => navigate("/auth")}
          >
            Criar conta grátis
            <ArrowRight className="w-5 h-5" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="text-base px-8 py-6 bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => {
              const el = document.querySelector("#planos");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Ver planos
          </Button>
        </div>
      </div>
    </section>
  );
}
