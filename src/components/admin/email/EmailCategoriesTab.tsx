import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, Unlock } from 'lucide-react';
import { useEmailCategories } from '@/hooks/useEmailAdmin';

export function EmailCategoriesTab() {
  const { data: categories, isLoading } = useEmailCategories();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias de E-mail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {categories?.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">{cat.name}</p>
                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                  <code className="text-[10px] text-muted-foreground">{cat.key}</code>
                </div>
                <div className="flex items-center gap-2">
                  {cat.default_opt_in && <Badge variant="secondary" className="text-[10px]">Opt-in padrão</Badge>}
                  {!cat.can_user_opt_out ? (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                      <Lock className="h-3 w-3" /> Obrigatório
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Unlock className="h-3 w-3" /> Opt-out
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
