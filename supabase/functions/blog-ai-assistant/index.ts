// Blog AI Assistant — gera meta tags, alt, revisão e auditoria SEO via Lovable AI Gateway
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;
const MODEL = 'google/gemini-2.5-flash';

type Action = 'generate_meta' | 'improve_content' | 'generate_alt' | 'seo_audit';

interface RequestBody {
  action: Action;
  titulo?: string;
  resumo?: string;
  conteudo?: string;
  imagem_url?: string;
  contexto?: string;
}

async function callAI(systemPrompt: string, userPrompt: string, jsonMode = true): Promise<any> {
  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Lovable-API-Key': LOVABLE_API_KEY,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error('Limite de uso da IA atingido. Tente novamente em alguns instantes.');
    if (res.status === 402) throw new Error('Créditos da IA esgotados. Adicione créditos no workspace.');
    throw new Error(`AI Gateway erro ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  if (jsonMode) {
    try { return JSON.parse(content); } catch { return { raw: content }; }
  }
  return content;
}

function htmlToText(html: string): string {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();
    const { action } = body;

    let result: any;

    if (action === 'generate_meta') {
      const texto = htmlToText(body.conteudo || '').slice(0, 4000);
      result = await callAI(
        'Você é um especialista em SEO em português brasileiro. Responda sempre em JSON.',
        `Para o artigo abaixo, gere:
- meta_title: máximo 60 caracteres, atrativo, com palavra-chave principal
- meta_description: máximo 160 caracteres, com call-to-action
- meta_keywords: 8 a 12 palavras-chave separadas por vírgula

Título: ${body.titulo || ''}
Resumo: ${body.resumo || ''}
Conteúdo: ${texto}

Retorne JSON: {"meta_title": "...", "meta_description": "...", "meta_keywords": "..."}`,
      );
    } else if (action === 'generate_alt') {
      result = await callAI(
        'Você gera textos alternativos (alt) para imagens, em português, otimizados para SEO e acessibilidade. Máximo 125 caracteres.',
        `Imagem: ${body.imagem_url || ''}
Contexto do artigo: ${body.contexto || body.titulo || ''}

Gere um alt descritivo e contextual. Retorne JSON: {"alt": "..."}`,
      );
    } else if (action === 'improve_content') {
      const texto = htmlToText(body.conteudo || '').slice(0, 6000);
      result = await callAI(
        'Você é editor sênior em português brasileiro. Sugere melhorias sem reescrever o texto inteiro.',
        `Analise o conteúdo e sugira melhorias.
Conteúdo: ${texto}

Retorne JSON:
{
  "sugestoes_gramatica": ["..."],
  "estrutura_recomendada": ["Adicionar H2 sobre...", "Quebrar parágrafo em..."],
  "palavras_repetidas": ["..."],
  "score_legibilidade": 0-100
}`,
      );
    } else if (action === 'seo_audit') {
      const texto = htmlToText(body.conteudo || '');
      const wordCount = texto.split(/\s+/).filter(Boolean).length;
      result = await callAI(
        'Você audita SEO on-page. Responda sempre em JSON em português.',
        `Audite este post:
Título: ${body.titulo || ''}
Meta título: ${body.contexto || ''}
Resumo: ${body.resumo || ''}
Palavras no conteúdo: ${wordCount}
Conteúdo (truncado): ${texto.slice(0, 4000)}

Retorne JSON:
{
  "score": 0-100,
  "problemas": ["..."],
  "sugestoes": ["..."],
  "pontos_fortes": ["..."]
}`,
      );
    } else {
      return new Response(JSON.stringify({ error: 'Ação inválida' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
