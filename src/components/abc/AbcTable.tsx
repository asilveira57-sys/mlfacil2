import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown, Eye, Map as MapIcon } from "lucide-react";

export interface AbcItem {
  id: string;
  rank: number;
  name: string;
  subtitle?: string;
  value: number;
  orders: number;
  units: number;
  revenue: number;
  percentage: number;
  cumulative: number;
  classification: "A" | "B" | "C";
}

interface AbcTableColumn {
  key: "units" | "orders" | "revenue";
  label: string;
  format?: "number" | "currency" | "percent";
  align?: "left" | "center" | "right";
  sortable?: boolean;
}

type SortDirection = "asc" | "desc" | null;
type SortKey = "units" | "orders" | "revenue" | null;

interface AbcTableProps {
  items: AbcItem[];
  columns: AbcTableColumn[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: AbcItem) => void;
  onDetailClick?: (item: AbcItem) => void;
  onMapClick?: (item: AbcItem) => void;
}

const formatValue = (value: number, format?: string): string => {
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "number":
    default:
      return new Intl.NumberFormat("pt-BR").format(value);
  }
};

const getClassBadge = (classification: "A" | "B" | "C") => {
  const variants = {
    A: "bg-success/20 text-success border-success/30",
    B: "bg-warning/20 text-warning border-warning/30",
    C: "bg-destructive/20 text-destructive border-destructive/30",
  };

  return (
    <Badge variant="outline" className={cn("font-bold", variants[classification])}>
      {classification}
    </Badge>
  );
};

export function AbcTable({
  items,
  columns,
  loading,
  emptyMessage = "Nenhum dado encontrado",
  onRowClick,
  onDetailClick,
  onMapClick,
}: AbcTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === "desc") {
        setSortDirection("asc");
      } else if (sortDirection === "asc") {
        setSortKey(null);
        setSortDirection(null);
      }
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const sortedItems = [...items].sort((a, b) => {
    if (!sortKey || !sortDirection) {
      return a.rank - b.rank;
    }
    
    const aValue = a[sortKey];
    const bValue = b[sortKey];
    
    if (sortDirection === "desc") {
      return bValue - aValue;
    }
    return aValue - bValue;
  });

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "desc" 
      ? <ArrowDown className="h-4 w-4 ml-1" />
      : <ArrowUp className="h-4 w-4 ml-1" />;
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-16 text-center">#</TableHead>
            <TableHead>Nome</TableHead>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.sortable !== false && "cursor-pointer select-none hover:bg-muted/80"
                )}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <div className={cn(
                  "flex items-center",
                  col.align === "right" && "justify-end"
                )}>
                  {col.label}
                  {col.sortable !== false && <SortIcon columnKey={col.key} />}
                </div>
              </TableHead>
            ))}
            <TableHead className="text-right">% Part.</TableHead>
            <TableHead className="text-right">% Acum.</TableHead>
            <TableHead className="w-20 text-center">Classe</TableHead>
            {(onDetailClick || onMapClick) && <TableHead className="w-24 text-center">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.map((item, index) => (
            <TableRow
              key={item.id}
              className={cn(
                onRowClick && "cursor-pointer hover:bg-muted/50",
                item.classification === "A" && "bg-success/5",
                item.classification === "B" && "bg-warning/5",
                item.classification === "C" && "bg-destructive/5"
              )}
              onClick={() => onRowClick?.(item)}
            >
              <TableCell className="text-center font-medium text-muted-foreground">
                {sortKey ? index + 1 : item.rank}
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{item.name}</div>
                  {item.subtitle && (
                    <div className="text-sm text-muted-foreground">{item.subtitle}</div>
                  )}
                </div>
              </TableCell>
              {columns.map((col) => {
                const value = item[col.key];

                return (
                  <TableCell
                    key={col.key}
                    className={cn(
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center"
                    )}
                  >
                    {formatValue(value, col.format)}
                  </TableCell>
                );
              })}
              <TableCell className="text-right font-medium">
                {item.percentage.toFixed(1)}%
              </TableCell>
              <TableCell className="text-right">
                {item.cumulative.toFixed(1)}%
              </TableCell>
              <TableCell className="text-center">
                {getClassBadge(item.classification)}
              </TableCell>
              {(onDetailClick || onMapClick) && (
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {onMapClick && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMapClick(item);
                        }}
                        title="Ver no mapa"
                      >
                        <MapIcon className="h-4 w-4" />
                      </Button>
                    )}
                    {onDetailClick && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDetailClick(item);
                        }}
                        title="Ver detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}