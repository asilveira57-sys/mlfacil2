import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ArticleInput {
  tema: string;
  categoria_id: string;
  palavra_chave_principal: string;
  palavras_chave_secundarias: string[];
  tipo_artigo: 'educacional' | 'tecnico' | 'comparativo' | 'guia';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth header for user context
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const input: ArticleInput = await req.json();
    
    // Validate required fields
    if (!input.tema || !input.categoria_id || !input.palavra_chave_principal) {
      return new Response(JSON.stringify({ 
        error: 'Campos obrigatórios: tema, categoria_id, palavra_chave_principal' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[blog-generate-article] Generating article for:', input.tema);

    // Build the prompt for article generation
    const systemPrompt = `Você é um redator especialista em conteúdo para blogs profissionais. Seu objetivo é criar artigos de alta qualidade, otimizados para SEO, com linguagem natural e profundidade técnica adequada.

REGRAS OBRIGATÓRIAS:
- NÃO use frases genéricas de marketing
- NÃO prometa resultados
- NÃO use linguagem sensacionalista
- NÃO repita estruturas entre artigos
- NÃO use clichês de introdução como "No mundo atual..." ou "Você já se perguntou..."
- Priorize clareza, profundidade e utilidade
- O texto deve parecer escrito sob medida para o tema

ESTRUTURA DO ARTIGO:
1. Introdução contextual (2-3 parágrafos, sem clichês)
2. Subtítulos claros e hierárquicos (H2 e H3 em Markdown)
3. Desenvolvimento profundo do tema
4. Exemplos práticos ou explicações aplicáveis
5. Conclusão com direcionamento lógico

FORMATO DE RESPOSTA (JSON):
{
  "titulo": "Título atrativo e otimizado (máx 70 caracteres)",
  "resumo": "Resumo do artigo em 2-3 frases",
  "conteudo_principal": "Conteúdo completo em Markdown",
  "meta_title": "Título SEO (máx 60 caracteres, inclui palavra-chave)",
  "meta_description": "Descrição SEO (máx 155 caracteres)",
  "slug_sugerido": "slug-otimizado-baseado-na-palavra-chave",
  "tags": ["tag1", "tag2", "tag3"]
}`;

    const userPrompt = `Crie um artigo completo sobre o seguinte tema:

TEMA: ${input.tema}

PALAVRA-CHAVE PRINCIPAL: ${input.palavra_chave_principal}
${input.palavras_chave_secundarias?.length ? `PALAVRAS-CHAVE SECUNDÁRIAS: ${input.palavras_chave_secundarias.join(', ')}` : ''}

TIPO DE ARTIGO: ${input.tipo_artigo}

INSTRUÇÕES ESPECÍFICAS POR TIPO:
${input.tipo_artigo === 'educacional' ? '- Foco em ensinar conceitos de forma clara e progressiva\n- Use analogias quando apropriado\n- Estruture o conteúdo do básico ao avançado' : ''}
${input.tipo_artigo === 'tecnico' ? '- Aprofunde detalhes técnicos\n- Inclua exemplos de código ou processos quando relevante\n- Seja preciso nos termos técnicos' : ''}
${input.tipo_artigo === 'comparativo' ? '- Compare diferentes opções de forma objetiva\n- Liste prós e contras claramente\n- Ajude o leitor a tomar decisões informadas' : ''}
${input.tipo_artigo === 'guia' ? '- Estruture como passo-a-passo\n- Seja prático e acionável\n- Inclua dicas e cuidados importantes' : ''}

Use a palavra-chave principal naturalmente ao longo do texto. Retorne APENAS o JSON no formato especificado.`;

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Limite de requisições excedido. Tente novamente em alguns minutos.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Créditos insuficientes. Adicione créditos ao workspace.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await aiResponse.text();
      console.error('[blog-generate-article] AI gateway error:', status, errorText);
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content returned from AI');
    }

    console.log('[blog-generate-article] AI response received, parsing...');

    // Parse the JSON response from AI
    let articleData;
    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      articleData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('[blog-generate-article] Failed to parse AI response:', content);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Validate required fields in AI response
    if (!articleData.titulo || !articleData.conteudo_principal) {
      throw new Error('AI response missing required fields');
    }

    // Ensure SEO fields are within limits
    const meta_title = (articleData.meta_title || articleData.titulo).substring(0, 60);
    const meta_description = (articleData.meta_description || articleData.resumo || '').substring(0, 155);

    // Create the blog post in draft status
    const postData = {
      titulo: articleData.titulo,
      resumo: articleData.resumo || null,
      conteudo_principal: articleData.conteudo_principal,
      status: 'rascunho',
      categoria_id: input.categoria_id,
      tags: articleData.tags || [input.palavra_chave_principal, ...(input.palavras_chave_secundarias || [])],
      meta_title,
      meta_description,
      meta_keywords: [input.palavra_chave_principal, ...(input.palavras_chave_secundarias || [])].join(', '),
      origem: 'automatico',
      autor: 'Gerado por IA',
    };

    console.log('[blog-generate-article] Saving post to database...');

    const { data: post, error: insertError } = await supabase
      .from('blog_posts')
      .insert([postData] as any)
      .select('*')
      .single();

    if (insertError) {
      console.error('[blog-generate-article] Insert error:', insertError);
      throw new Error(`Failed to save article: ${insertError.message}`);
    }

    console.log('[blog-generate-article] Article saved successfully:', post.id);

    return new Response(JSON.stringify({
      success: true,
      post: {
        id: post.id,
        titulo: post.titulo,
        slug: post.slug,
        status: post.status
      },
      message: 'Artigo gerado com sucesso e salvo como rascunho.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[blog-generate-article] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro desconhecido ao gerar artigo' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
