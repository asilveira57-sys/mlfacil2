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
  subcategories: string[];
  selectedCategory: string;
  selectedSubcategory: string;
  sortBy: 'popularity' | 'growth';
  onCategoryChange: (category: string) => void;
  onSubcategoryChange: (subcategory: string) => void;
  onSortChange: (sort: 'popularity' | 'growth') => void;
}

export function TrendsLiteFilters({
  categories,
  subcategories,
  selectedCategory,
  selectedSubcategory,
  sortBy,
  onCategoryChange,
  onSubcategoryChange,
  onSortChange,
}: TrendsLiteFiltersProps) {
  const { t } = useTranslation('tools');

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Category filter */}
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
      
      {/* Subcategory filter - only shown when a category is selected */}
      {subcategories.length > 0 && (
        <div className="flex-1 min-w-[150px]">
          <Select value={selectedSubcategory} onValueChange={onSubcategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder={t('trends.filter_subcategory')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('trends.filter_all_subcategories')}</SelectItem>
              {subcategories.map((subcategory) => (
                <SelectItem key={subcategory} value={subcategory}>
                  {subcategory}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      
      {/* Sort options */}
      <div className="flex-1 min-w-[150px]">
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as 'popularity' | 'growth')}>
          <SelectTrigger>
            <SelectValue placeholder={t('trends.sort_by')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popularity">{t('trends.sort_popularity')}</SelectItem>
            <SelectItem value="growth">{t('trends.sort_growth')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
