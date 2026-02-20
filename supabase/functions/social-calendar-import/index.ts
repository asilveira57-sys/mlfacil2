import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Datas temáticas da ONU (lista completa curada)
const UN_INTERNATIONAL_DAYS = [
  { month: 1, day: 1, title: 'Ano Novo', description: 'Celebração do início do novo ano', tags: ['ano-novo', 'celebração'] },
  { month: 1, day: 4, title: 'Dia Mundial do Braille', description: 'Conscientização sobre a importância do braille para pessoas cegas', tags: ['inclusão', 'acessibilidade'] },
  { month: 1, day: 11, title: 'Dia Internacional das Montanhas', description: 'Celebração das montanhas e seus ecossistemas', tags: ['natureza', 'meio-ambiente'] },
  { month: 1, day: 24, title: 'Dia Internacional da Educação', description: 'Reconhecimento do papel da educação para a paz e desenvolvimento', tags: ['educação', 'conhecimento'] },
  { month: 1, day: 27, title: 'Dia Internacional em Memória das Vítimas do Holocausto', description: 'Memória das vítimas do Holocausto', tags: ['história', 'memória'] },
  { month: 2, day: 2, title: 'Dia Mundial das Zonas Úmidas', description: 'Conscientização sobre os ecossistemas de zonas úmidas', tags: ['meio-ambiente', 'natureza'] },
  { month: 2, day: 4, title: 'Dia Mundial do Câncer', description: 'Conscientização e prevenção do câncer', tags: ['saúde', 'prevenção'] },
  { month: 2, day: 11, title: 'Dia Internacional das Mulheres e Meninas na Ciência', description: 'Promoção da igualdade de gênero na ciência', tags: ['ciência', 'mulheres', 'igualdade'] },
  { month: 2, day: 13, title: 'Dia Mundial do Rádio', description: 'Celebração do rádio como meio de comunicação', tags: ['comunicação', 'mídia'] },
  { month: 2, day: 14, title: 'Dia dos Namorados (Valentine\'s Day)', description: 'Celebração do amor e romantismo', tags: ['amor', 'relacionamentos', 'presentes'] },
  { month: 2, day: 20, title: 'Dia Mundial da Justiça Social', description: 'Promoção da justiça social e igualdade', tags: ['justiça', 'igualdade', 'social'] },
  { month: 2, day: 21, title: 'Dia Internacional da Língua Materna', description: 'Promoção da diversidade linguística e cultural', tags: ['língua', 'cultura', 'diversidade'] },
  { month: 3, day: 3, title: 'Dia Mundial da Vida Selvagem', description: 'Conscientização sobre a vida selvagem do planeta', tags: ['animais', 'natureza', 'meio-ambiente'] },
  { month: 3, day: 8, title: 'Dia Internacional da Mulher', description: 'Celebração das conquistas das mulheres', tags: ['mulheres', 'igualdade', 'empoderamento'] },
  { month: 3, day: 15, title: 'Dia Mundial do Consumidor', description: 'Conscientização sobre os direitos do consumidor', tags: ['consumidor', 'direitos', 'qualidade'] },
  { month: 3, day: 20, title: 'Dia Internacional da Felicidade', description: 'Reconhecimento da felicidade como objetivo universal', tags: ['felicidade', 'bem-estar'] },
  { month: 3, day: 21, title: 'Dia Internacional para a Eliminação da Discriminação Racial', description: 'Luta contra o racismo', tags: ['igualdade', 'diversidade', 'antirracismo'] },
  { month: 3, day: 22, title: 'Dia Mundial da Água', description: 'Conscientização sobre a importância da água', tags: ['água', 'meio-ambiente', 'sustentabilidade'] },
  { month: 3, day: 23, title: 'Dia Meteorológico Mundial', description: 'Conscientização sobre meteorologia e clima', tags: ['clima', 'meio-ambiente'] },
  { month: 3, day: 25, title: 'Dia Internacional da Solidariedade Humana', description: 'Promoção da solidariedade entre os povos', tags: ['solidariedade', 'humanidade'] },
  { month: 4, day: 2, title: 'Dia Mundial de Conscientização do Autismo', description: 'Conscientização sobre o espectro autista', tags: ['autismo', 'inclusão', 'saúde'] },
  { month: 4, day: 7, title: 'Dia Mundial da Saúde', description: 'Promoção da saúde global', tags: ['saúde', 'bem-estar'] },
  { month: 4, day: 22, title: 'Dia da Terra', description: 'Conscientização ambiental e proteção da Terra', tags: ['meio-ambiente', 'sustentabilidade', 'natureza'] },
  { month: 4, day: 23, title: 'Dia Mundial do Livro e dos Direitos de Autor', description: 'Promoção da leitura e direitos autorais', tags: ['livros', 'leitura', 'cultura'] },
  { month: 5, day: 1, title: 'Dia Internacional do Trabalhador', description: 'Celebração dos trabalhadores e suas conquistas', tags: ['trabalho', 'trabalhadores', 'direitos'] },
  { month: 5, day: 3, title: 'Dia Mundial da Liberdade de Imprensa', description: 'Defesa da liberdade de imprensa', tags: ['comunicação', 'liberdade', 'imprensa'] },
  { month: 5, day: 12, title: 'Dia Internacional das Enfermeiras', description: 'Homenagem às enfermeiras e profissionais de saúde', tags: ['saúde', 'enfermagem', 'cuidado'] },
  { month: 5, day: 15, title: 'Dia Internacional da Família', description: 'Celebração da família como unidade fundamental', tags: ['família', 'relacionamentos'] },
  { month: 5, day: 17, title: 'Dia Mundial das Telecomunicações e da Sociedade da Informação', description: 'Conscientização sobre TIC', tags: ['tecnologia', 'comunicação'] },
  { month: 5, day: 22, title: 'Dia Internacional da Biodiversidade', description: 'Conscientização sobre a biodiversidade', tags: ['natureza', 'biodiversidade', 'meio-ambiente'] },
  { month: 5, day: 31, title: 'Dia Mundial sem Tabaco', description: 'Conscientização sobre os malefícios do tabagismo', tags: ['saúde', 'tabaco', 'prevenção'] },
  { month: 6, day: 1, title: 'Dia Internacional das Crianças', description: 'Celebração e proteção dos direitos das crianças', tags: ['crianças', 'infância', 'direitos'] },
  { month: 6, day: 5, title: 'Dia Mundial do Meio Ambiente', description: 'Conscientização ambiental global', tags: ['meio-ambiente', 'sustentabilidade', 'natureza'] },
  { month: 6, day: 8, title: 'Dia Mundial dos Oceanos', description: 'Proteção e conscientização dos oceanos', tags: ['oceanos', 'natureza', 'sustentabilidade'] },
  { month: 6, day: 12, title: 'Dia Mundial contra o Trabalho Infantil', description: 'Combate ao trabalho infantil', tags: ['crianças', 'direitos', 'trabalho'] },
  { month: 6, day: 13, title: 'Dia dos Namorados (Brasil)', description: 'Celebração do amor no Brasil', tags: ['amor', 'namorados', 'presentes', 'relacionamentos'] },
  { month: 6, day: 17, title: 'Dia Mundial de Combate à Desertificação e Seca', description: 'Luta contra a desertificação', tags: ['meio-ambiente', 'natureza'] },
  { month: 6, day: 20, title: 'Dia Mundial dos Refugiados', description: 'Conscientização sobre refugiados', tags: ['refugiados', 'humanidade', 'solidariedade'] },
  { month: 6, day: 21, title: 'Dia Internacional do Yoga', description: 'Promoção dos benefícios do yoga', tags: ['yoga', 'saúde', 'bem-estar'] },
  { month: 6, day: 23, title: 'Dia Olímpico', description: 'Celebração do esporte olímpico', tags: ['esporte', 'olimpíadas', 'saúde'] },
  { month: 7, day: 11, title: 'Dia Mundial da População', description: 'Conscientização sobre questões populacionais', tags: ['população', 'social'] },
  { month: 7, day: 18, title: 'Dia Internacional de Nelson Mandela', description: 'Homenagem a Nelson Mandela', tags: ['paz', 'igualdade', 'direitos'] },
  { month: 7, day: 30, title: 'Dia Mundial contra o Tráfico de Pessoas', description: 'Combate ao tráfico humano', tags: ['direitos', 'humanidade'] },
  { month: 8, day: 9, title: 'Dia Internacional dos Povos Indígenas', description: 'Reconhecimento dos povos indígenas', tags: ['cultura', 'diversidade', 'direitos'] },
  { month: 8, day: 12, title: 'Dia Internacional da Juventude', description: 'Celebração e empoderamento da juventude', tags: ['juventude', 'futuro', 'educação'] },
  { month: 8, day: 19, title: 'Dia Mundial da Fotografia', description: 'Celebração da arte da fotografia', tags: ['fotografia', 'arte', 'criatividade'] },
  { month: 9, day: 8, title: 'Dia Internacional da Alfabetização', description: 'Promoção da alfabetização global', tags: ['educação', 'leitura', 'conhecimento'] },
  { month: 9, day: 15, title: 'Dia Internacional da Democracia', description: 'Promoção e defesa da democracia', tags: ['democracia', 'política', 'direitos'] },
  { month: 9, day: 16, title: 'Dia Internacional para a Preservação da Camada de Ozônio', description: 'Proteção da camada de ozônio', tags: ['meio-ambiente', 'clima', 'sustentabilidade'] },
  { month: 9, day: 21, title: 'Dia Internacional da Paz', description: 'Promoção da paz mundial', tags: ['paz', 'humanidade', 'solidariedade'] },
  { month: 9, day: 27, title: 'Dia Mundial do Turismo', description: 'Promoção do turismo sustentável', tags: ['turismo', 'viagens', 'cultura'] },
  { month: 10, day: 1, title: 'Dia Internacional das Pessoas Idosas', description: 'Reconhecimento e valorização dos idosos', tags: ['idosos', 'saúde', 'respeito'] },
  { month: 10, day: 2, title: 'Dia Internacional da Não-Violência', description: 'Promoção da paz e não-violência', tags: ['paz', 'não-violência'] },
  { month: 10, day: 5, title: 'Dia Mundial dos Professores', description: 'Homenagem e valorização dos professores', tags: ['educação', 'professores', 'escola'] },
  { month: 10, day: 10, title: 'Dia Mundial da Saúde Mental', description: 'Conscientização sobre saúde mental', tags: ['saúde-mental', 'bem-estar', 'saúde'] },
  { month: 10, day: 11, title: 'Dia Internacional da Menina', description: 'Empoderamento e direitos das meninas', tags: ['meninas', 'igualdade', 'educação'] },
  { month: 10, day: 12, title: 'Dia das Crianças (Brasil)', description: 'Celebração das crianças no Brasil', tags: ['crianças', 'infância', 'brinquedos', 'presentes'] },
  { month: 10, day: 13, title: 'Dia Internacional para a Redução de Desastres', description: 'Conscientização sobre prevenção de desastres', tags: ['segurança', 'prevenção'] },
  { month: 10, day: 15, title: 'Dia Internacional das Mulheres Rurais', description: 'Reconhecimento das mulheres rurais', tags: ['mulheres', 'agricultura', 'rural'] },
  { month: 10, day: 16, title: 'Dia Mundial da Alimentação', description: 'Combate à fome e promoção da alimentação saudável', tags: ['alimentação', 'saúde', 'fome'] },
  { month: 10, day: 17, title: 'Dia Internacional para a Erradicação da Pobreza', description: 'Combate à pobreza global', tags: ['pobreza', 'igualdade', 'social'] },
  { month: 10, day: 20, title: 'Dia Mundial da Estatística', description: 'Promoção da importância das estatísticas', tags: ['dados', 'ciência'] },
  { month: 10, day: 31, title: 'Halloween', description: 'Festividade do Halloween', tags: ['halloween', 'festas', 'fantasias'] },
  { month: 11, day: 2, title: 'Dia dos Finados', description: 'Dia de remembrança dos falecidos', tags: ['finados', 'memória', 'família'] },
  { month: 11, day: 5, title: 'Dia Mundial dos Tsumamis', description: 'Conscientização sobre tsunamis', tags: ['segurança', 'natureza'] },
  { month: 11, day: 11, title: 'Dia do Solteiro (Singles Day)', description: 'Data de grandes promoções e compras', tags: ['promoção', 'vendas', 'desconto', 'e-commerce'] },
  { month: 11, day: 15, title: 'Dia da Proclamação da República (Brasil)', description: 'Aniversário da proclamação da república brasileira', tags: ['brasil', 'história', 'feriado'] },
  { month: 11, day: 19, title: 'Dia Internacional dos Homens', description: 'Conscientização sobre saúde e bem-estar masculino', tags: ['homens', 'saúde', 'bem-estar'] },
  { month: 11, day: 20, title: 'Dia da Consciência Negra (Brasil)', description: 'Celebração e conscientização da cultura afro-brasileira', tags: ['consciência-negra', 'cultura', 'diversidade', 'brasil'] },
  { month: 11, day: 25, title: 'Dia Internacional para a Eliminação da Violência contra a Mulher', description: 'Combate à violência de gênero', tags: ['mulheres', 'violência', 'direitos'] },
  { month: 11, day: 29, title: 'Black Friday', description: 'A maior data de promoções do varejo', tags: ['black-friday', 'promoção', 'desconto', 'vendas', 'e-commerce'] },
  { month: 12, day: 1, title: 'Dia Mundial de Combate ao HIV/AIDS', description: 'Conscientização sobre HIV/AIDS', tags: ['saúde', 'prevenção', 'aids'] },
  { month: 12, day: 3, title: 'Dia Internacional das Pessoas com Deficiência', description: 'Inclusão e direitos das pessoas com deficiência', tags: ['inclusão', 'acessibilidade', 'deficiência'] },
  { month: 12, day: 5, title: 'Dia Internacional do Voluntariado', description: 'Promoção do voluntariado global', tags: ['voluntariado', 'solidariedade'] },
  { month: 12, day: 10, title: 'Dia dos Direitos Humanos', description: 'Celebração dos direitos humanos universais', tags: ['direitos', 'humanidade', 'igualdade'] },
  { month: 12, day: 11, title: 'Dia Internacional das Montanhas', description: 'Celebração das montanhas', tags: ['natureza', 'montanhas'] },
  { month: 12, day: 18, title: 'Dia Internacional dos Migrantes', description: 'Conscientização sobre migração', tags: ['migrantes', 'humanidade', 'direitos'] },
  { month: 12, day: 25, title: 'Natal', description: 'Celebração do Natal', tags: ['natal', 'presentes', 'família', 'celebração', 'vendas'] },
  { month: 12, day: 31, title: 'Réveillon', description: 'Virada do ano', tags: ['réveillon', 'ano-novo', 'celebração'] },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? 'import_un'; // 'import_un' | 'import_holidays' | 'import_all'
    const year = body.year ?? new Date().getFullYear();
    const countryCode = body.country_code ?? 'BR';

    const results: Record<string, unknown> = {};

    // ── A) Importar datas ONU ──
    if (action === 'import_un' || action === 'import_all') {
      const rows = [];
      for (const d of UN_INTERNATIONAL_DAYS) {
        // Para cada ano (atual e próximo)
        const years = action === 'import_all'
          ? [year, year + 1]
          : [year];

        for (const y of years) {
          rows.push({
            source: 'un',
            country_code: null,
            event_date: `${y}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
            title: d.title,
            description: d.description,
            tags: d.tags,
            category: categorizeUnEvent(d.tags),
            is_active: true,
          });
        }
      }

      // Upsert em lotes de 100
      let unInserted = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase
          .from('social_calendar_events')
          .upsert(batch, {
            onConflict: 'source,event_date,title',
            ignoreDuplicates: true,
          });
        if (!error) unInserted += batch.length;
      }
      results.un_imported = unInserted;
    }

    // ── B) Importar feriados Nager.Date ──
    if (action === 'import_holidays' || action === 'import_all') {
      const years = action === 'import_all' ? [year, year + 1] : [year];
      let holidayCount = 0;

      for (const y of years) {
        const url = `https://date.nager.at/api/v3/PublicHolidays/${y}/${countryCode}`;
        const resp = await fetch(url);
        if (!resp.ok) {
          console.error(`Nager API error: ${resp.status}`);
          continue;
        }
        const holidays = await resp.json() as Array<{
          date: string;
          localName: string;
          name: string;
          countryCode: string;
          types: string[];
        }>;

        const rows = holidays.map((h) => ({
          source: 'holiday_api',
          country_code: h.countryCode,
          event_date: h.date,
          title: h.localName,
          description: h.name,
          tags: ['feriado', 'oficial'],
          category: 'feriado',
          is_active: true,
        }));

        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100);
          const { error } = await supabase
            .from('social_calendar_events')
            .upsert(batch, {
              onConflict: 'source,event_date,title',
              ignoreDuplicates: true,
            });
          if (!error) holidayCount += batch.length;
        }
      }
      results.holidays_imported = holidayCount;
    }

    // ── Log de sucesso ──
    await supabase.from('system_logs').insert({
      module: 'SOCIAL_CALENDAR',
      action: `IMPORT_${action.toUpperCase()}`,
      success: true,
      meta_json: { ...results, duration_ms: Date.now() - startTime },
    }).then(() => {});

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('system_logs').insert({
      module: 'SOCIAL_CALENDAR',
      action: 'IMPORT_ERROR',
      success: false,
      meta_json: { error: message, duration_ms: Date.now() - startTime },
    }).then(() => {});

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function categorizeUnEvent(tags: string[]): string {
  const commercial = ['black-friday', 'natal', 'presentes', 'promoção', 'vendas', 'desconto', 'e-commerce', 'halloween', 'namorados', 'crianças'];
  const seasonal = ['ano-novo', 'réveillon', 'celebração'];
  if (tags.some((t) => commercial.includes(t))) return 'comercial';
  if (tags.some((t) => seasonal.includes(t))) return 'sazonal';
  return 'tematica';
}
