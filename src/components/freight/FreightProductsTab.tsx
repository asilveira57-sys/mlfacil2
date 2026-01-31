import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package, Search, RefreshCw, Calculator, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Temporary mock data - will be replaced with real data
const mockProducts = [
  {
    id: '1',
    item_id: 'MLB123456789',
    title: 'Produto Exemplo 1',
    sku: 'SKU-001',
    weight_kg: 0.5,
    height_cm: 10,
    width_cm: 15,
    length_cm: 20,
    dimensions_source: 'api',
    freight_profile: 'A' as const,
    expected_freight_cost: 15.90,
    logistic_type: 'fulfillment',
    price: 99.90,
  },
  {
    id: '2',
    item_id: 'MLB987654321',
    title: 'Produto Exemplo 2',
    sku: 'SKU-002',
    weight_kg: null,
    height_cm: null,
    width_cm: null,
    length_cm: null,
    dimensions_source: 'none',
    freight_profile: 'B' as const,
    expected_freight_cost: null,
    logistic_type: 'drop_off',
    price: 149.90,
  },
];

export function FreightProductsTab() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const loading = false;

  const getStatusBadge = (product: typeof mockProducts[0]) => {
    if (product.dimensions_source === 'none') {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Sem dados
        </Badge>
      );
    }
    if (product.dimensions_source === 'estimated') {
      return (
        <Badge variant="secondary" className="gap-1">
          Estimado
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 text-success border-success/30">
        <CheckCircle2 className="h-3 w-3" />
        OK
      </Badge>
    );
  };

  const getDimensionsDisplay = (product: typeof mockProducts[0]) => {
    if (product.height_cm && product.width_cm && product.length_cm) {
      return `${product.height_cm}×${product.width_cm}×${product.length_cm} cm`;
    }
    return '-';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Produtos e Frete Esperado</h2>
          <p className="text-sm text-muted-foreground">
            Visualize e gerencie peso, dimensões e custo de frete esperado dos produtos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar via ML
          </Button>
          <Button className="gap-2">
            <Calculator className="h-4 w-4" />
            Recalcular em Massa
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, SKU ou ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="no_data">Sem dados</SelectItem>
                <SelectItem value="estimated">Estimados</SelectItem>
                <SelectItem value="complete">Completos</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="B">
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Perfis</SelectItem>
                <SelectItem value="A">Perfil A</SelectItem>
                <SelectItem value="B">Perfil B</SelectItem>
                <SelectItem value="C">Perfil C</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Produtos ({mockProducts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">Peso (kg)</TableHead>
                <TableHead className="text-center">Dimensões</TableHead>
                <TableHead className="text-center">Perfil</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Frete Esperado</TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm line-clamp-1">{product.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.item_id} • {product.sku}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {product.weight_kg ? `${product.weight_kg} kg` : '-'}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {getDimensionsDisplay(product)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{product.freight_profile}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {getStatusBadge(product)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {product.expected_freight_cost 
                      ? `R$ ${product.expected_freight_cost.toFixed(2)}`
                      : '-'
                    }
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="sm">
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm">
                        Calcular
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
