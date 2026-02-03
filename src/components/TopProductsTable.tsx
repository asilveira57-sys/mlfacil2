import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { useMemo } from "react";

interface Product {
  id: string;
  title: string;
  quantity: number;
  revenue: number;
}

interface TopProductsTableProps {
  products: Product[];
  isLoading?: boolean;
}

export function TopProductsTable({ products, isLoading }: TopProductsTableProps) {
  const { t, i18n } = useTranslation('sales');

  const formatCurrency = useMemo(() => {
    const locale = i18n.language === 'en' ? 'en-US' : i18n.language === 'es' ? 'es-AR' : 'pt-BR';
    return (value: number) => {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "BRL",
      }).format(value);
    };
  }, [i18n.language]);

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="h-[300px] flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Card>
    );
  }

  if (!products.length) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{t('top_products.title')}</h3>
        <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground">
          <Package className="w-12 h-12 mb-4 opacity-50" />
          <p>{t('charts.no_data')}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">{t('top_products.title')}</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>{t('top_products.product')}</TableHead>
              <TableHead className="text-center">{t('top_products.sold')}</TableHead>
              <TableHead className="text-right">{t('charts.revenue')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product, index) => (
              <TableRow key={product.id}>
                <TableCell>
                  <Badge 
                    variant={index < 3 ? "default" : "secondary"}
                    className="w-6 h-6 flex items-center justify-center rounded-full p-0"
                  >
                    {index + 1}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[300px]">
                  <span className="line-clamp-2 text-sm">{product.title}</span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="font-medium">{product.quantity}</span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold text-primary">
                    {formatCurrency(product.revenue)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
