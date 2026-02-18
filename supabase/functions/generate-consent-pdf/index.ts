import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple text-based PDF generator (no external deps)
function generatePdfBytes(lines: string[]): Uint8Array {
  const objects: string[] = [];
  let objCount = 0;
  const offsets: number[] = [];

  const addObj = (content: string) => {
    objCount++;
    objects.push(content);
    return objCount;
  };

  // Catalog
  addObj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");
  // Pages
  addObj("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj");

  // Build content stream
  const fontSize = 10;
  const lineHeight = 14;
  const marginLeft = 50;
  const pageHeight = 842; // A4
  const pageWidth = 595;
  let y = pageHeight - 60;

  let streamContent = "BT\n";
  streamContent += `/F1 14 Tf\n${marginLeft} ${y} Td\n`;
  streamContent += `(COMPROVANTE DE CONSENTIMENTO) Tj\n`;
  y -= 30;
  streamContent += `0 -30 Td\n/F1 ${fontSize} Tf\n`;

  for (const line of lines) {
    if (y < 50) break; // Don't overflow page
    const safeLine = line
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      // Remove accented chars for PDF compatibility (simple ASCII fallback)
      .replace(/[áàâã]/g, "a")
      .replace(/[éèê]/g, "e")
      .replace(/[íìî]/g, "i")
      .replace(/[óòôõ]/g, "o")
      .replace(/[úùû]/g, "u")
      .replace(/[ç]/g, "c")
      .replace(/[ÁÀÂÃ]/g, "A")
      .replace(/[ÉÈÊ]/g, "E")
      .replace(/[ÍÌÎ]/g, "I")
      .replace(/[ÓÒÔÕ]/g, "O")
      .replace(/[ÚÙÛ]/g, "U")
      .replace(/[Ç]/g, "C");
    streamContent += `0 -${lineHeight} Td\n(${safeLine}) Tj\n`;
    y -= lineHeight;
  }
  streamContent += "ET";

  const streamBytes = new TextEncoder().encode(streamContent);
  // Stream object
  addObj(
    `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream\nendobj`
  );
  // Font
  addObj(
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj"
  );
  // Page
  // Insert page before stream (reorder)
  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`;
  // Replace obj 3 placeholder
  const pageObj = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj`;
  // Re-build objects in correct order
  const finalObjects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    pageObj,
    `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream\nendobj`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj",
  ];

  let pdf = "%PDF-1.4\n";
  const objOffsets: number[] = [];
  for (let i = 0; i < finalObjects.length; i++) {
    objOffsets.push(pdf.length);
    pdf += finalObjects[i] + "\n";
  }

  const xrefOffset = pdf.length;
  pdf += "xref\n";
  pdf += `0 ${finalObjects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of objOffsets) {
    pdf += off.toString().padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n";
  pdf += `<< /Size ${finalObjects.length + 1} /Root 1 0 R >>\n`;
  pdf += "startxref\n";
  pdf += xrefOffset + "\n";
  pdf += "%%EOF";

  return new TextEncoder().encode(pdf);
}

function formatDateBR(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return isoDate;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const userEmail = user.email || "N/A";

    const body = await req.json();
    const { consent_id } = body;

    if (!consent_id) {
      return new Response(
        JSON.stringify({ error: "Missing consent_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch consent record (user can only see their own via RLS)
    const { data: consent, error: consentError } = await supabase
      .from("user_consents")
      .select("*")
      .eq("id", consent_id)
      .eq("user_id", userId)
      .single();

    if (consentError || !consent) {
      return new Response(
        JSON.stringify({ error: "Consent record not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build PDF content lines
    const lines: string[] = [
      "",
      "MLFACIL CONSULTORIA E SISTEMAS LTDA",
      "CNPJ: 52.833.264/0001-20",
      "",
      "-------------------------------------------",
      "",
      `Escopo: ${consent.consent_scope === "cookies" ? "Politica de Cookies" : "Termos de Uso"}`,
      `Tipo: ${consent.consent_type}`,
      "",
    ];

    if (consent.consent_scope === "cookies") {
      lines.push(`Cookies Essenciais: Sim`);
      lines.push(`Cookies de Desempenho: ${consent.performance ? "Sim" : "Nao"}`);
      lines.push(`Cookies de Analise: ${consent.analytics ? "Sim" : "Nao"}`);
      lines.push("");
    }

    lines.push(`Documento: ${consent.document_type}`);
    lines.push(`Versao do Documento: ${consent.document_version}`);
    lines.push(`Hash do Documento: ${consent.document_hash}`);
    lines.push("");
    lines.push(`Data/Hora do Aceite: ${formatDateBR(consent.accepted_at)}`);
    lines.push(`Origem: ${consent.source}`);
    lines.push("");
    lines.push(`Usuario: ${userEmail}`);
    lines.push(`IP: ${consent.ip_address || "N/A"}`);
    lines.push(`User-Agent: ${(consent.user_agent || "N/A").substring(0, 80)}`);
    lines.push("");
    lines.push(`ID do Consentimento: ${consent.id}`);
    lines.push("");
    lines.push("-------------------------------------------");
    lines.push("Este documento serve como comprovante legal");
    lines.push("do consentimento registrado na plataforma.");

    const pdfBytes = generatePdfBytes(lines);

    // Upload to storage
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const filePath = `consents/${userId}/${consent_id}.pdf`;

    const { error: uploadError } = await adminClient.storage
      .from("legal_consents")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload PDF", details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update consent record with pdf_path
    await adminClient
      .from("user_consents")
      .update({ pdf_path: filePath })
      .eq("id", consent_id);

    // Generate signed URL (60 seconds)
    const { data: signedData, error: signedError } = await adminClient.storage
      .from("legal_consents")
      .createSignedUrl(filePath, 60);

    if (signedError) {
      return new Response(
        JSON.stringify({ error: "Failed to generate download URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ pdf_url: signedData.signedUrl, pdf_path: filePath }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
