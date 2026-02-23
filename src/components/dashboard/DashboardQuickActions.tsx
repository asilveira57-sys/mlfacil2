import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanyCustomization } from "@/hooks/useCompanyCustomization";
import { LucideIcon } from "lucide-react";
import {
  CloudDownload, Megaphone, TrendingUp, DollarSign, Activity, Package,
  Tag, MessageCircle, BarChart3, CheckSquare, Clock, Eye, Box, Sprout
} from "lucide-react";

// Map of icon names to components
const ICON_MAP: Record<string, LucideIcon> = {
  CloudDownload, Megaphone, TrendingUp, DollarSign, Activity, Package,
  Tag, MessageCircle, BarChart3, CheckSquare, Clock, Eye, Box, Sprout
};

export function DashboardQuickActions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { enabledShortcuts, activeColor, loading } = useCompanyCustomization();

  const getIconComponent = (iconName: string): LucideIcon => {
    return ICON_MAP[iconName] || Box;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <Skeleton className="h-6 w-32 mb-1" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (enabledShortcuts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{t('dashboard:quick_access')}</h3>
          <p className="text-sm text-muted-foreground">{t('dashboard:quick_access_desc')}</p>
        </div>
      </div>
      
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {enabledShortcuts.slice(0, 5).map((shortcut) => {
          const IconComp = getIconComponent(shortcut.icon);
          
          return (
            <Card
              key={shortcut.key}
              className="p-3 cursor-pointer transition-all duration-200 hover:shadow-md border-2 border-transparent hover:border-primary/20"
              style={{ 
                backgroundColor: `${activeColor.hex}10`,
              }}
              onClick={() => navigate(shortcut.route)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${activeColor.hex}20`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = `${activeColor.hex}10`;
              }}
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-background/80"
                >
                  <IconComp 
                    className="h-5 w-5"
                    style={{ color: activeColor.hex }}
                  />
                </div>
                <div>
                  <h4 className="font-medium text-sm text-foreground">{t(shortcut.titleKey)}</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {t(shortcut.descriptionKey)}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
