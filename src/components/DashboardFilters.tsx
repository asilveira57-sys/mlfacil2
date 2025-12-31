import { useState, useMemo } from "react";
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
import { format, startOfMonth, endOfMonth, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
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

export function DashboardFilters({
  availableMonths,
  onFilterChange,
  isLoading,
}: DashboardFiltersProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [customRange, setCustomRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });
  const [isCustomRangeOpen, setIsCustomRangeOpen] = useState(false);

  // Sort months descending and format labels properly
  const sortedMonths = useMemo(() => {
    if (!availableMonths?.length) return [];
    
    return [...availableMonths]
      .sort((a, b) => b.key.localeCompare(a.key))
      .map((m) => ({
        key: m.key,
        label: format(parse(m.key, "yyyy-MM", new Date()), "MMMM yyyy", { locale: ptBR }),
      }));
  }, [availableMonths]);

  const handleMonthChange = (monthKey: string) => {
    if (monthKey === "custom") {
      setSelectedMonth("");
      setIsCustomRangeOpen(true);
      return;
    }

    if (monthKey === "all") {
      setSelectedMonth("all");
      setCustomRange({ from: undefined, to: undefined });
      onFilterChange({ dateFrom: null, dateTo: null });
      return;
    }

    setSelectedMonth(monthKey);
    setCustomRange({ from: undefined, to: undefined });

    const monthDate = parse(monthKey, "yyyy-MM", new Date());
    const dateFrom = format(startOfMonth(monthDate), "yyyy-MM-dd");
    const dateTo = format(endOfMonth(monthDate), "yyyy-MM-dd");

    onFilterChange({ dateFrom, dateTo });
  };

  const handleCustomRangeSelect = () => {
    if (customRange.from && customRange.to) {
      setSelectedMonth("");
      setIsCustomRangeOpen(false);
      onFilterChange({
        dateFrom: format(customRange.from, "yyyy-MM-dd"),
        dateTo: format(customRange.to, "yyyy-MM-dd"),
      });
    }
  };

  const clearFilters = () => {
    setSelectedMonth("");
    setCustomRange({ from: undefined, to: undefined });
    onFilterChange({ dateFrom: null, dateTo: null });
  };

  const hasActiveFilter = selectedMonth || customRange.from;

  const displayValue = useMemo(() => {
    if (selectedMonth === "all") return "Todos os meses";
    if (selectedMonth) {
      const month = sortedMonths.find((m) => m.key === selectedMonth);
      return month?.label || selectedMonth;
    }
    if (customRange.from && customRange.to) {
      return `${format(customRange.from, "dd/MM/yy")} - ${format(customRange.to, "dd/MM/yy")}`;
    }
    return "Últimos 30 dias";
  }, [selectedMonth, customRange, sortedMonths]);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={selectedMonth || (customRange.from ? "custom-active" : "")}
        onValueChange={handleMonthChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Últimos 30 dias">
            {displayValue}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os meses</SelectItem>
          {sortedMonths.map((month) => (
            <SelectItem key={month.key} value={month.key}>
              {month.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Período personalizado...</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom Range Popover */}
      <Popover open={isCustomRangeOpen} onOpenChange={setIsCustomRangeOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "shrink-0",
              customRange.from && "border-primary"
            )}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="p-3 border-b">
            <p className="text-sm font-medium">Selecione o período</p>
            <p className="text-xs text-muted-foreground">
              Clique para selecionar início e fim
            </p>
          </div>
          <Calendar
            mode="range"
            selected={{ from: customRange.from, to: customRange.to }}
            onSelect={(range) => setCustomRange({ from: range?.from, to: range?.to })}
            numberOfMonths={2}
            locale={ptBR}
            className="p-3 pointer-events-auto"
          />
          <div className="p-3 border-t flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCustomRangeOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCustomRangeSelect}
              disabled={!customRange.from || !customRange.to}
            >
              Aplicar
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
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
