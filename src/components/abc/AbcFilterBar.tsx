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
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AbcFilters } from "@/pages/AbcAnalysis";

interface AbcFilterBarProps {
  filters: AbcFilters;
  onFiltersChange: (filters: AbcFilters) => void;
}

const QUICK_PERIODS = [
  { label: "Hoje", days: 0 },
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

const CANCELLATION_OPTIONS = [
  { value: "exclude", label: "Excluir cancelados" },
  { value: "include", label: "Incluir cancelados" },
  { value: "only", label: "Somente cancelados" },
];

export function AbcFilterBar({ filters, onFiltersChange }: AbcFilterBarProps) {
  const [customRangeOpen, setCustomRangeOpen] = useState(false);
  const [tempRange, setTempRange] = useState<{ from?: Date; to?: Date }>({});

  // Generate last 12 months options
  const monthOptions = useMemo(() => {
    const months = [];
    for (let i = 0; i < 12; i++) {
      const date = subMonths(new Date(), i);
      months.push({
        value: format(date, "yyyy-MM"),
        label: format(date, "MMMM yyyy", { locale: ptBR }),
      });
    }
    return months;
  }, []);

  const handleQuickPeriod = (days: number) => {
    const today = new Date();
    const dateFrom = days === 0 ? today : subDays(today, days);
    onFiltersChange({
      ...filters,
      dateFrom: format(dateFrom, "yyyy-MM-dd"),
      dateTo: format(today, "yyyy-MM-dd"),
      selectedMonth: null,
    });
  };

  const handleMonthSelect = (value: string) => {
    if (value === "custom") {
      setCustomRangeOpen(true);
      return;
    }

    const [year, month] = value.split("-").map(Number);
    const monthDate = new Date(year, month - 1, 1);
    
    onFiltersChange({
      ...filters,
      dateFrom: format(startOfMonth(monthDate), "yyyy-MM-dd"),
      dateTo: format(endOfMonth(monthDate), "yyyy-MM-dd"),
      selectedMonth: value,
    });
  };

  const handleCustomRangeApply = () => {
    if (tempRange.from) {
      onFiltersChange({
        ...filters,
        dateFrom: format(tempRange.from, "yyyy-MM-dd"),
        dateTo: tempRange.to 
          ? format(tempRange.to, "yyyy-MM-dd") 
          : format(tempRange.from, "yyyy-MM-dd"),
        selectedMonth: null,
      });
      setCustomRangeOpen(false);
      setTempRange({});
    }
  };

  const clearFilters = () => {
    onFiltersChange({
      dateFrom: null,
      dateTo: null,
      selectedMonth: null,
      orderStatus: ["paid"],
      cancellationFilter: "exclude",
    });
  };

  const hasActiveFilters = filters.dateFrom || filters.selectedMonth;

  const getDisplayValue = () => {
    if (filters.selectedMonth) {
      const option = monthOptions.find(m => m.value === filters.selectedMonth);
      return option?.label || filters.selectedMonth;
    }
    if (filters.dateFrom && filters.dateTo) {
      return `${format(new Date(filters.dateFrom), "dd/MM")} - ${format(new Date(filters.dateTo), "dd/MM")}`;
    }
    return "Selecionar período";
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Quick period buttons */}
      <div className="flex gap-1">
        {QUICK_PERIODS.map((period) => (
          <Button
            key={period.days}
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => handleQuickPeriod(period.days)}
          >
            {period.label}
          </Button>
        ))}
      </div>

      {/* Month/Custom date selector */}
      <Select
        value={filters.selectedMonth || ""}
        onValueChange={handleMonthSelect}
      >
        <SelectTrigger className="w-[180px] h-8">
          <SelectValue placeholder={getDisplayValue()}>
            {getDisplayValue()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((month) => (
            <SelectItem key={month.value} value={month.value}>
              {month.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Personalizado...</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom date range popover */}
      <Popover open={customRangeOpen} onOpenChange={setCustomRangeOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 hidden">
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={{ from: tempRange.from, to: tempRange.to }}
            onSelect={(range) => setTempRange({ from: range?.from, to: range?.to })}
            locale={ptBR}
            numberOfMonths={2}
          />
          <div className="flex justify-end gap-2 p-3 border-t">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setCustomRangeOpen(false);
                setTempRange({});
              }}
            >
              Cancelar
            </Button>
            <Button 
              size="sm"
              onClick={handleCustomRangeApply}
              disabled={!tempRange.from}
            >
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Cancellation filter */}
      <Select
        value={filters.cancellationFilter}
        onValueChange={(value: "exclude" | "include" | "only") =>
          onFiltersChange({ ...filters, cancellationFilter: value })
        }
      >
        <SelectTrigger className="w-[180px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CANCELLATION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground"
          onClick={clearFilters}
        >
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  );
}
