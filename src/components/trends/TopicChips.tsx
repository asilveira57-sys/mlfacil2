import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag, Sparkles } from 'lucide-react';
import { useTrends } from '@/contexts/TrendsContext';
import { useMemo } from 'react';

// ============================================================
// TOPIC CHIPS
// Objetivo: Chips/Tags por tema extraídos das keywords
// ============================================================

// Common topic patterns to extract
const TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string; icon?: string }> = [
  { pattern: /festa|aniversário|comemoracao|party/i, topic: 'Festas' },
  { pattern: /natal|christmas|noel/i, topic: 'Natal' },
  { pattern: /bebê|bebe|baby|infantil|criança/i, topic: 'Infantil' },
  { pattern: /casamento|noiva|wedding/i, topic: 'Casamento' },
  { pattern: /presente|gift|lembrancinha/i, topic: 'Presentes' },
  { pattern: /decoração|decorar|enfeite/i, topic: 'Decoração' },
  { pattern: /organizador|organização|storage/i, topic: 'Organização' },
  { pattern: /pet|cachorro|gato|animal/i, topic: 'Pets' },
  { pattern: /fitness|academia|esporte|exercício/i, topic: 'Fitness' },
  { pattern: /cozinha|kitchen|culinária/i, topic: 'Cozinha' },
  { pattern: /jardim|garden|planta/i, topic: 'Jardim' },
  { pattern: /tecnologia|tech|eletrônico/i, topic: 'Tech' },
];

export function TopicChips() {
  const { state, hasCategory } = useTrends();
  const { data, ui } = state;
  
  const isLoading = ui.loadingFlags.keywords;
  
  // Extract topics from keywords
  const topics = useMemo(() => {
    if (data.keywords.length === 0) return [];
    
    const topicCounts = new Map<string, number>();
    
    data.keywords.forEach(k => {
      TOPIC_PATTERNS.forEach(({ pattern, topic }) => {
        if (pattern.test(k.keyword)) {
          topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        }
      });
    });
    
    // Sort by count and take top 8
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([topic, count]) => ({ topic, count }));
  }, [data.keywords]);
  
  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-primary" />
            Tópicos Identificados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-6 w-20 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // No category
  if (!hasCategory) {
    return (
      <Card className="opacity-60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-primary" />
            Tópicos Identificados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Selecione uma categoria para ver tópicos
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // Empty state
  if (topics.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-primary" />
            Tópicos Identificados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum tópico identificado</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="h-4 w-4 text-primary" />
          Tópicos Identificados
        </CardTitle>
        <CardDescription>
          Temas extraídos das palavras-chave em tendência
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {topics.map(({ topic, count }) => (
            <Badge 
              key={topic} 
              variant="secondary" 
              className="px-3 py-1 text-sm cursor-default hover:bg-secondary"
            >
              <Sparkles className="h-3 w-3 mr-1.5 text-primary" />
              {topic}
              <span className="ml-1.5 text-muted-foreground">({count})</span>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
