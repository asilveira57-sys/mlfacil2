import { useState } from 'react';
import { Lock, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CriteriaModal } from './CriteriaModal';
import { ELIGIBILITY_TEXTS } from '@/hooks/useCategoryEligibility';

interface BlockedCardProps {
  title: string;
  icon?: React.ReactNode;
  className?: string;
}

export function BlockedCard({ 
  title, 
  icon,
  className = '' 
}: BlockedCardProps) {
  const [showCriteria, setShowCriteria] = useState(false);

  return (
    <>
      <Card className={`relative overflow-hidden opacity-70 ${className}`}>
        {/* Overlay de bloqueio */}
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] z-10" />
        
        <CardHeader className="relative z-20">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg text-muted-foreground">
              {icon}
              {title}
            </CardTitle>
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" />
              Bloqueado
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="relative z-20">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Lock className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground max-w-xs">
              {ELIGIBILITY_TEXTS.blocked.description}
            </p>
            <Button 
              variant="link" 
              size="sm" 
              className="mt-3 text-primary"
              onClick={() => setShowCriteria(true)}
            >
              <HelpCircle className="h-3 w-3 mr-1" />
              {ELIGIBILITY_TEXTS.blocked.link}
            </Button>
          </div>
        </CardContent>
      </Card>

      <CriteriaModal 
        open={showCriteria} 
        onOpenChange={setShowCriteria} 
      />
    </>
  );
}
