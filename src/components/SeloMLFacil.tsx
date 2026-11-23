/**
 * Selo "Desenvolvido por ML Fácil Consultoria e Sistemas".
 * Componente sem dependências (só estilos inline), para copiar em qualquer projeto React/Lovable:
 *   <SeloMLFacil />                    -> no rodapé, tema escuro
 *   <SeloMLFacil tema="claro" />       -> para rodapés claros
 *   <SeloMLFacil projeto="aleball" />  -> leva direto para a página do projeto no AleHub
 * Link com rel="nofollow" de propósito: é um crédito repetido em vários sites.
 */
type Props = { tema?: "escuro" | "claro"; origem?: string; projeto?: string };

export function SeloMLFacil({ tema = "escuro", origem, projeto }: Props) {
  const escuro = tema === "escuro";
  const campanha = origem ?? (typeof window !== "undefined" ? window.location.hostname.replace(/^www\./, "") : "site");
  return (
    <a
      href={`https://www.alehub.com.br/${projeto ? `projetos/${projeto}` : ""}?utm_source=selo&utm_medium=site&utm_campaign=${encodeURIComponent(campanha)}`}
      target="_blank"
      rel="nofollow noopener"
      aria-label="Desenvolvido por ML Fácil Consultoria e Sistemas"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px 7px 8px",
        borderRadius: 999,
        font: "500 12px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        textDecoration: "none",
        background: escuro ? "#16204f" : "#ffffff",
        color: escuro ? "#e9ecf6" : "#16204f",
        border: `1px solid ${escuro ? "#2b3a85" : "#dfe3ef"}`,
        boxShadow: escuro ? "0 6px 20px -6px rgba(10,16,48,.55)" : "0 6px 20px -8px rgba(22,32,79,.35)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#ffd21f",
          color: "#16204f",
          font: "800 10px/1 system-ui, sans-serif",
        }}
      >
        ML
      </span>
      <span>
        Desenvolvido por <b style={{ fontWeight: 700, color: escuro ? "#ffd21f" : "#2340c8" }}>ML Fácil</b> Consultoria
      </span>
    </a>
  );
}
