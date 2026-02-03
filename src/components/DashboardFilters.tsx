import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, parse, subDays, startOfDay } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AvailableMonth {
  key: string; // YYYY-MM
  label: string;
}

interface DateFilter {
  dateFrom: string | null;
  dateTo: string | null;
}

interface DashboardFiltersProps {
  availableMonths: AvailableMonth[];
  onFilterChange: (filter: DateFilter) => void;
  isLoading?: boolean;
}

type QuickPeriod = "today" | "7d" | "15d" | "30d" | null;

export function DashboardFilters({
  availableMonths,
  onFilterChange,
  isLoading,
}: DashboardFiltersProps) {
  const { t, i18n } = useTranslation('sales');
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedPeriod, setSelectedPeriod] = useState<QuickPeriod>("30d");
  const [customRange, setCustomRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  const [isCustomRangeOpen, setIsCustomRangeOpen] = useState(false);

  // Get the appropriate locale for date-fns
  const dateLocale = useMemo(() => {
    switch (i18n.language) {
      case 'en': return enUS;
      case 'es': return es;
      default: return ptBR;
    }
  }, [i18n.language]);

  // Memoized period options with translations
  const PERIOD_OPTIONS = useMemo(() => [
    { value: "today" as QuickPeriod, label: t('filters.today'), days: 0 },
    { value: "7d" as QuickPeriod, label: t('filters.7d'), days: 7 },
    { value: "15d" as QuickPeriod, label: t('filters.15d'), days: 15 },
    { value: "30d" as QuickPeriod, label: t('filters.30d'), days: 30 },
  ], [t]);

  // Sort months descending and format labels properly
  const sortedMonths = useMemo(() => {
    if (!availableMonths?.length) return [];
    
    return [...availableMonths]
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((m) => ({
        key: m.key,
        label: format(parse(m.key, "yyyy-MM", new Date()), "MMMM yyyy", { locale: dateLocale }),
      }));
  }, [availableMonths, dateLocale]);

  const handleQuickPeriod = (period: QuickPeriod) => {
    if (!period) return;
    
    setSelectedPeriod(period);
    setSelectedMonth("");
    setCustomRange({ from: undefined, to: undefined });

    const today = startOfDay(new Date());
    const option = PERIOD_OPTIONS.find((o) => o.value === period);
    if (!option) return;

    const dateFrom = option.days === 0 ? today : subDays(today, option.days);
    
    onFilterChange({
      dateFrom: format(dateFrom, "yyyy-MM-dd"),
      dateTo: format(today, "yyyy-MM-dd"),
    });
  };

  const handleMonthChange = (monthKey: string) => {
    if (monthKey === "custom") {
      setSelectedMonth("");
      setSelectedPeriod(null);
      setIsCustomRangeOpen(true);
      return;
    }

    if (monthKey === "all") {
      setSelectedMonth("all");
      setSelectedPeriod(null);
      setCustomRange({ from: undefined, to: undefined });
      onFilterChange({ dateFrom: null, dateTo: null });
      return;
    }

    setSelectedMonth(monthKey);
    setSelectedPeriod(null);
    setCustomRange({ from: undefined, to: undefined });

    const monthDate = parse(monthKey, "yyyy-MM", new Date());
    const dateFrom = format(startOfMonth(monthDate), "yyyy-MM-dd");
    const dateTo = format(endOfMonth(monthDate), "yyyy-MM-dd");

    onFilterChange({ dateFrom, dateTo });
  };

  const handleCustomRangeSelect = () => {
    if (customRange.from && customRange.to) {
      setSelectedMonth("");
      setSelectedPeriod(null);
      setIsCustomRangeOpen(false);
      onFilterChange({
        dateFrom: format(customRange.from, "yyyy-MM-dd"),
        dateTo: format(customRange.to, "yyyy-MM-dd"),
      });
    }
  };

  const clearFilters = () => {
    setSelectedMonth("");
    setSelectedPeriod("30d");
    setCustomRange({ from: undefined, to: undefined });
    
    // Default to last 30 days
    const today = startOfDay(new Date());
    onFilterChange({
      dateFrom: format(subDays(today, 30), "yyyy-MM-dd"),
      dateTo: format(today, "yyyy-MM-dd"),
    });
  };

  const hasActiveFilter = selectedMonth || customRange.from || (selectedPeriod && selectedPeriod !== "30d");

  const displayValue = useMemo(() => {
    if (selectedMonth === "all") return t('filters.select_month');
    if (selectedMonth) {
      const month = sortedMonths.find((m) => m.key === selectedMonth);
      return month?.label || selectedMonth;
    }
    if (customRange.from && customRange.to) {
      return `${format(customRange.from, "dd/MM/yy")} - ${format(customRange.to, "dd/MM/yy")}`;
    }
    return t('filters.select_month');
  }, [selectedMonth, customRange, sortedMonths, t]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Quick Period Buttons */}
      <div className="flex items-center gap-1">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={selectedPeriod === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickPeriod(option.value)}
            disabled={isLoading}
            className="h-8 px-3 text-xs"
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Month/Custom Range Selector */}
      <Select
        value={selectedMonth || (customRange.from ? "custom-active" : "")}
        onValueChange={handleMonthChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[160px] h-8">
          <SelectValue placeholder={t('filters.select_month')}>
            {displayValue}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {sortedMonths.map((month) => (
            <SelectItem key={month.key} value={month.key}>
              {month.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">{t('filters.custom')}</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom Range Popover */}
      <Popover open={isCustomRangeOpen} onOpenChange={setIsCustomRangeOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "shrink-0 h-8 w-8",
              customRange.from && "border-primary"
            )}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="p-3 border-b">
            <p className="text-sm font-medium">{t('filters.custom')}</p>
          </div>
          <Calendar
            mode="range"
            selected={{ from: customRange.from, to: customRange.to }}
            onSelect={(range) => setCustomRange({ from: range?.from, to: range?.to })}
            numberOfMonths={2}
            locale={dateLocale}
            className="p-3 pointer-events-auto"
          />
          <div className="p-3 border-t flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCustomRangeOpen(false)}
            >
              {t('common:cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button
              size="sm"
              onClick={handleCustomRangeSelect}
              disabled={!customRange.from || !customRange.to}
            >
              {t('common:apply', { defaultValue: 'Apply' })}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Clear Filter Button */}
      {hasActiveFilter && (
        <Button
          variant="ghost"
          size="icon"
          onClick={clearFilters}
          className="shrink-0 h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
