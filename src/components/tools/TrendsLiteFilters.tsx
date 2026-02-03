import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TrendsLiteFiltersProps {
  categories: string[];
  selectedCategory: string;
  sortBy: 'popularity' | 'relevance' | 'name';
  onCategoryChange: (category: string) => void;
  onSortChange: (sort: 'popularity' | 'relevance' | 'name') => void;
}

export function TrendsLiteFilters({
  categories,
  selectedCategory,
  sortBy,
  onCategoryChange,
  onSortChange,
}: TrendsLiteFiltersProps) {
  const { t } = useTranslation('tools');

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1 min-w-[150px]">
        <Select value={selectedCategory} onValueChange={onCategoryChange}>
          <SelectTrigger>
            <SelectValue placeholder={t('trends.filter_category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('trends.filter_all')}</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex-1 min-w-[150px]">
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as 'popularity' | 'relevance' | 'name')}>
          <SelectTrigger>
            <SelectValue placeholder={t('trends.sort_by')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popularity">{t('trends.sort_popularity')}</SelectItem>
            <SelectItem value="relevance">{t('trends.sort_relevance')}</SelectItem>
            <SelectItem value="name">{t('trends.sort_name')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
