import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COMPANY_NAME = "MLFACIL CONSULTORIA E SISTEMAS LTDA";
const COMPANY_CNPJ = "52.833.264/0001-20";
const FOOTER_LINE1 = "Emitido pelo sistema MKTP Facil";
const FOOTER_LINE2 = "contato@mktpfacil.com";

// ─── ASCII-safe text helper ───
function ascii(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[áàâãä]/g, "a").replace(/[ÁÀÂÃÄ]/g, "A")
    .replace(/[éèêë]/g, "e").replace(/[ÉÈÊË]/g, "E")
    .replace(/[íìîï]/g, "i").replace(/[ÍÌÎÏ]/g, "I")
    .replace(/[óòôõö]/g, "o").replace(/[ÓÒÔÕÖ]/g, "O")
    .replace(/[úùûü]/g, "u").replace(/[ÚÙÛÜ]/g, "U")
    .replace(/[ç]/g, "c").replace(/[Ç]/g, "C")
    .replace(/[ñ]/g, "n").replace(/[Ñ]/g, "N")
    .replace(/[–—]/g, "-")
    .replace(/[""'']/g, "'")
    .replace(/…/g, "...");
}

// ─── Word-wrap a line to fit within maxChars ───
function wrapLine(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Multi-page PDF generator ───
function generateMultiPagePdf(pages: string[][]): Uint8Array {
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN_L = 50;
  const MARGIN_TOP = 60;
  const MARGIN_BOTTOM = 60;
  const LINE_H = 13;
  const FONT_SIZE = 9;
  const TITLE_SIZE = 13;
  const MAX_CHARS = 90;

  // Pre-process: split all lines into wrapped segments and paginate
  const paginatedPages: string[][] = [];

  for (const pageLines of pages) {
    let currentPage: string[] = [];
    let y = PAGE_H - MARGIN_TOP;

    for (const rawLine of pageLines) {
      const wrapped = rawLine === "" ? [""] : wrapLine(ascii(rawLine), MAX_CHARS);
      for (const seg of wrapped) {
        if (y - LINE_H < MARGIN_BOTTOM) {
          // overflow → new page
          paginatedPages.push(currentPage);
          currentPage = [];
          y = PAGE_H - MARGIN_TOP;
        }
        currentPage.push(seg);
        y -= LINE_H;
      }
    }
    if (currentPage.length > 0) paginatedPages.push(currentPage);
  }

  if (paginatedPages.length === 0) paginatedPages.push([""]);

  const totalPages = paginatedPages.length;

  // Build PDF objects
  // obj 1: Catalog, obj 2: Pages, obj 3: Font
  // then pairs of (Page, Stream) for each page
  const objs: string[] = [];
  const pageObjNums: number[] = [];

  // Placeholder for Catalog (1) and Pages (2) and Font (3)
  objs.push(""); // index 0 → obj 1
  objs.push(""); // index 1 → obj 2
  objs.push("3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj");

  let nextObj = 4;

  for (let p = 0; p < totalPages; p++) {
    const pageObjNum = nextObj++;
    const streamObjNum = nextObj++;
    pageObjNums.push(pageObjNum);

    let y = PAGE_H - MARGIN_TOP;
    let stream = "BT\n";

    // Title line (first segment of first page, or continuation)
    const isFirstPage = p === 0;
    const lines = paginatedPages[p];

    // Position
    stream += `${MARGIN_L} ${y} Td\n`;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Detect title lines (all caps, short)
      const isTitle = isFirstPage && i <= 1 && line === line.toUpperCase() && line.length > 5;
      const fs = isTitle ? TITLE_SIZE : FONT_SIZE;

      if (i === 0) {
        stream += `/F1 ${fs} Tf\n`;
      } else {
        stream += `0 -${LINE_H} Td\n`;
        if (isTitle) stream += `/F1 ${fs} Tf\n`;
        else stream += `/F1 ${FONT_SIZE} Tf\n`;
      }
      stream += `(${line}) Tj\n`;
      y -= LINE_H;
    }

    // Footer
    const footerY = 35;
    stream += `ET\nBT\n/F1 7 Tf\n${MARGIN_L} ${footerY} Td\n(${FOOTER_LINE1} | ${FOOTER_LINE2} | Pagina ${p + 1}/${totalPages}) Tj\nET`;

    const streamLen = new TextEncoder().encode(stream).length;

    // Page object
    objs.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${streamObjNum} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj`
    );
    // Stream object
    objs.push(
      `${streamObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj`
    );
  }

  // Now fill Catalog and Pages
  const kidsStr = pageObjNums.map((n) => `${n} 0 R`).join(" ");
  objs[0] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj";
  objs[1] = `2 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${totalPages} >>\nendobj`;

  // Serialize
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (let i = 0; i < objs.length; i++) {
    offsets.push(pdf.length);
    pdf += objs[i] + "\n";
  }

  const xrefOff = pdf.length;
  const totalObjs = objs.length + 1; // +1 for free entry
  pdf += "xref\n";
  pdf += `0 ${totalObjs}\n`;
  pdf += "0000000000 65535 f \n";
  for (const off of offsets) {
    pdf += off.toString().padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n";
  pdf += `<< /Size ${totalObjs} /Root 1 0 R >>\n`;
  pdf += "startxref\n";
  pdf += xrefOff + "\n";
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

// ─── Build PDF content for COOKIES consent ───
function buildCookiesPdfPages(
  consent: Record<string, unknown>,
  userEmail: string,
  userName: string,
  userId: string
): string[][] {
  const lines: string[] = [
    "COMPROVANTE DE CONSENTIMENTO DE COOKIES",
    "",
    "---------------------------------------------------",
    "",
    `Empresa: ${COMPANY_NAME}`,
    `CNPJ: ${COMPANY_CNPJ}`,
    "",
    "---------------------------------------------------",
    "DADOS DO USUARIO",
    "---------------------------------------------------",
    "",
    `Nome: ${userName}`,
    `E-mail: ${userEmail}`,
    `ID do usuario: ${userId}`,
    "",
    "---------------------------------------------------",
    "CONSENTIMENTO",
    "---------------------------------------------------",
    "",
    `Tipo de consentimento: ${consent.consent_type === "all" ? "Aceitar todos" : "Personalizado"}`,
    "",
    `  Cookies Essenciais: Sim (obrigatorio)`,
    `  Cookies de Desempenho: ${consent.performance ? "Aceito" : "Recusado"}`,
    `  Cookies de Analise: ${consent.analytics ? "Aceito" : "Recusado"}`,
    "",
    "---------------------------------------------------",
    "DOCUMENTO DE REFERENCIA",
    "---------------------------------------------------",
    "",
    `Documento: Politica de Cookies`,
    `Versao: ${consent.document_version}`,
    `Hash (SHA-256): ${consent.document_hash}`,
    "",
    "---------------------------------------------------",
    "REGISTRO DO ACEITE",
    "---------------------------------------------------",
    "",
    `Data/Hora: ${formatDateBR(consent.accepted_at as string)}`,
    `Origem: ${consent.source}`,
    `IP: ${consent.ip_address || "Nao registrado"}`,
    `User-Agent: ${((consent.user_agent as string) || "Nao registrado").substring(0, 120)}`,
    "",
    `ID do Consentimento: ${consent.id}`,
    "",
    "---------------------------------------------------",
    "",
    "Este documento serve como comprovante legal do",
    "consentimento registrado na plataforma MKTP Facil.",
    "O registro e imutavel e pode ser auditado a",
    "qualquer momento.",
    "",
  ];
  return [lines];
}

// ─── Build PDF content for TERMS consent (stamp + full text) ───
function buildTermsPdfPages(
  consent: Record<string, unknown>,
  userEmail: string,
  userName: string,
  userId: string,
  termsContent: string
): string[][] {
  // Page 1: acceptance stamp
  const stampPage: string[] = [
    "COMPROVANTE DE ACEITE - TERMOS DE USO",
    "",
    "---------------------------------------------------",
    "",
    `Empresa: ${COMPANY_NAME}`,
    `CNPJ: ${COMPANY_CNPJ}`,
    "",
    "---------------------------------------------------",
    "CARIMBO DE ACEITE",
    "---------------------------------------------------",
    "",
    `Nome: ${userName}`,
    `E-mail: ${userEmail}`,
    `ID do usuario: ${userId}`,
    "",
    `Versao do documento: ${consent.document_version}`,
    `Hash (SHA-256): ${consent.document_hash}`,
    "",
    `Data/Hora do aceite: ${formatDateBR(consent.accepted_at as string)}`,
    `Origem: ${consent.source}`,
    `IP: ${consent.ip_address || "Nao registrado"}`,
    `User-Agent: ${((consent.user_agent as string) || "Nao registrado").substring(0, 120)}`,
    "",
    `ID do Consentimento: ${consent.id}`,
    "",
    "---------------------------------------------------",
    "",
    "O usuario acima declarou ter lido e aceito os",
    "Termos de Uso na versao indicada. O texto completo",
    "do documento aceito segue nas paginas seguintes.",
    "",
    "---------------------------------------------------",
    "",
  ];

  // Page 2+: full terms text
  const termsLines: string[] = [
    "TERMOS DE USO - TEXTO COMPLETO",
    `Versao: ${consent.document_version}`,
    "",
    "---------------------------------------------------",
    "",
  ];

  // Split terms content into lines
  const rawLines = termsContent.split("\n");
  for (const rl of rawLines) {
    const trimmed = rl.trim();
    termsLines.push(trimmed === "" ? "" : trimmed);
  }

  termsLines.push("");
  termsLines.push("--- FIM DO DOCUMENTO ---");

  return [stampPage, termsLines];
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const userEmail = user.email || "N/A";
    const userName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      userEmail;

    const body = await req.json();
    const { consent_id } = body;

    if (!consent_id) {
      return new Response(
        JSON.stringify({ error: "Missing consent_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch consent record (RLS ensures ownership)
    const { data: consent, error: consentError } = await supabase
      .from("user_consents")
      .select("*")
      .eq("id", consent_id)
      .eq("user_id", userId)
      .single();

    if (consentError || !consent) {
      return new Response(
        JSON.stringify({ error: "Consent record not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If PDF already exists, just return a signed URL
    if (consent.pdf_path) {
      const { data: signedData, error: signedError } = await adminClient.storage
        .from("legal_consents")
        .createSignedUrl(consent.pdf_path, 120);

      if (!signedError && signedData?.signedUrl) {
        return new Response(
          JSON.stringify({
            pdf_url: signedData.signedUrl,
            pdf_path: consent.pdf_path,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      // If signed URL fails, regenerate below
    }

    // Fetch the corresponding legal document for this consent
    const { data: legalDoc } = await adminClient
      .from("legal_documents")
      .select("content, version, content_hash, doc_type")
      .eq("doc_type", consent.document_type)
      .eq("version", consent.document_version)
      .single();

    // Build PDF pages based on scope
    let pdfPages: string[][];

    if (consent.consent_scope === "cookies") {
      pdfPages = buildCookiesPdfPages(consent, userEmail, userName, userId);
    } else {
      // Terms – include full document text
      const termsText =
        legalDoc?.content ||
        "[Texto do documento nao disponivel para esta versao]";
      pdfPages = buildTermsPdfPages(
        consent,
        userEmail,
        userName,
        userId,
        termsText
      );
    }

    const pdfBytes = generateMultiPagePdf(pdfPages);

    // Upload to storage
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
        JSON.stringify({
          error: "Failed to upload PDF",
          details: uploadError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update consent record with pdf_path
    await adminClient
      .from("user_consents")
      .update({ pdf_path: filePath })
      .eq("id", consent_id);

    // Generate signed URL (120 seconds)
    const { data: signedData, error: signedError } = await adminClient.storage
      .from("legal_consents")
      .createSignedUrl(filePath, 120);

    if (signedError) {
      return new Response(
        JSON.stringify({ error: "Failed to generate download URL" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        pdf_url: signedData.signedUrl,
        pdf_path: filePath,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
