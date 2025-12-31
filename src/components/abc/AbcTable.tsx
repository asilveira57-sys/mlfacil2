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
import { cn } from "@/lib/utils";

export interface AbcItem {
  id: string;
  rank: number;
  name: string;
  subtitle?: string;
  value: number;
  secondaryValue?: number;
  tertiaryValue?: number;
  percentage: number;
  cumulative: number;
  classification: "A" | "B" | "C";
}

interface AbcTableColumn {
  key: string;
  label: string;
  format?: "number" | "currency" | "percent";
  align?: "left" | "center" | "right";
}

interface AbcTableProps {
  items: AbcItem[];
  columns: AbcTableColumn[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: AbcItem) => void;
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
}: AbcTableProps) {
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
                  col.align === "center" && "text-center"
                )}
              >
                {col.label}
              </TableHead>
            ))}
            <TableHead className="text-right">% Part.</TableHead>
            <TableHead className="text-right">% Acum.</TableHead>
            <TableHead className="w-20 text-center">Classe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
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
                {item.rank}
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
                let value: number;
                if (col.key === "value") value = item.value;
                else if (col.key === "secondaryValue") value = item.secondaryValue || 0;
                else if (col.key === "tertiaryValue") value = item.tertiaryValue || 0;
                else value = 0;

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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
