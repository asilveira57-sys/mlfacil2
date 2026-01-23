import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  Sparkles,
  Zap,
  Crown,
  ExternalLink,
  Download,
  AlertTriangle,
} from "lucide-react";

interface Payment {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: "paid" | "pending" | "failed";
}

interface PlanFeature {
  name: string;
  included: boolean;
  limit?: string;
}

const SettingsSubscription = () => {
  const [currentPlan] = useState({
    name: "Profissional",
    type: "subscription" as const,
    price: 97,
    interval: "mensal",
    nextBilling: "2025-02-23",
    status: "active" as const,
    usage: {
      orders: 850,
      ordersLimit: 1000,
      companies: 2,
      companiesLimit: 3,
      accounts: 4,
      accountsLimit: 5,
    },
  });

  const [payments] = useState<Payment[]>([
    {
      id: "1",
      date: "2025-01-23",
      description: "Plano Profissional - Janeiro/2025",
      amount: 97,
      status: "paid",
    },
    {
      id: "2",
      date: "2024-12-23",
      description: "Plano Profissional - Dezembro/2024",
      amount: 97,
      status: "paid",
    },
    {
      id: "3",
      date: "2024-11-23",
      description: "Plano Profissional - Novembro/2024",
      amount: 97,
      status: "paid",
    },
    {
      id: "4",
      date: "2024-10-23",
      description: "Créditos extras - Análise ABC",
      amount: 29.9,
      status: "paid",
    },
  ]);

  const plans = [
    {
      name: "Starter",
      icon: Zap,
      price: 47,
      description: "Para quem está começando",
      features: [
        { name: "Até 300 pedidos/mês", included: true },
        { name: "1 empresa", included: true },
        { name: "2 contas de marketplace", included: true },
        { name: "Análise ABC básica", included: true },
        { name: "Integrações ERP", included: false },
        { name: "Relatórios avançados", included: false },
      ],
      current: false,
    },
    {
      name: "Profissional",
      icon: Sparkles,
      price: 97,
      description: "Mais popular",
      features: [
        { name: "Até 1.000 pedidos/mês", included: true },
        { name: "3 empresas", included: true },
        { name: "5 contas de marketplace", included: true },
        { name: "Análise ABC completa", included: true },
        { name: "Integrações ERP", included: true },
        { name: "Relatórios avançados", included: true },
      ],
      current: true,
      popular: true,
    },
    {
      name: "Enterprise",
      icon: Crown,
      price: 197,
      description: "Para grandes operações",
      features: [
        { name: "Pedidos ilimitados", included: true },
        { name: "Empresas ilimitadas", included: true },
        { name: "Contas ilimitadas", included: true },
        { name: "Análise ABC + IA", included: true },
        { name: "Integrações ERP + API", included: true },
        { name: "Suporte prioritário", included: true },
      ],
      current: false,
    },
  ];

  const getStatusBadge = (status: Payment["status"]) => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Pago
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">
            <Clock className="h-3 w-3 mr-1" />
            Pendente
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Falhou
          </Badge>
        );
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const getUsagePercent = (used: number, limit: number) => {
    return Math.min((used / limit) * 100, 100);
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return "bg-red-500";
    if (percent >= 70) return "bg-amber-500";
    return "bg-primary";
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Plano {currentPlan.name}
              </CardTitle>
              <CardDescription>
                {currentPlan.type === "subscription" ? "Assinatura mensal" : "Compra avulsa"}
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">
                {formatCurrency(currentPlan.price)}
                <span className="text-sm font-normal text-muted-foreground">/{currentPlan.interval}</span>
              </div>
              <Badge
                variant="outline"
                className={
                  currentPlan.status === "active"
                    ? "bg-green-500/10 text-green-600 border-green-200 mt-1"
                    : "bg-red-500/10 text-red-600 border-red-200 mt-1"
                }
              >
                {currentPlan.status === "active" ? "Ativa" : "Inativa"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Next Billing */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Próxima cobrança</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(currentPlan.nextBilling)}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              Gerenciar pagamento
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          </div>

          <Separator />

          {/* Usage */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Uso do plano</h4>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Pedidos processados</span>
                  <span className="font-medium">
                    {currentPlan.usage.orders.toLocaleString()} /{" "}
                    {currentPlan.usage.ordersLimit.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={getUsagePercent(currentPlan.usage.orders, currentPlan.usage.ordersLimit)}
                  className="h-2"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Empresas</span>
                    <span className="font-medium">
                      {currentPlan.usage.companies} / {currentPlan.usage.companiesLimit}
                    </span>
                  </div>
                  <Progress
                    value={getUsagePercent(
                      currentPlan.usage.companies,
                      currentPlan.usage.companiesLimit
                    )}
                    className="h-2"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Contas de marketplace</span>
                    <span className="font-medium">
                      {currentPlan.usage.accounts} / {currentPlan.usage.accountsLimit}
                    </span>
                  </div>
                  <Progress
                    value={getUsagePercent(
                      currentPlan.usage.accounts,
                      currentPlan.usage.accountsLimit
                    )}
                    className="h-2"
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h3 className="text-lg font-medium mb-4">Planos disponíveis</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative ${plan.current ? "border-primary ring-1 ring-primary" : ""} ${
                plan.popular ? "shadow-lg" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Mais popular</Badge>
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <plan.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="pt-2">
                  <span className="text-3xl font-bold">{formatCurrency(plan.price)}</span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      {feature.included ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className={feature.included ? "" : "text-muted-foreground"}>
                        {feature.name}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  variant={plan.current ? "outline" : "default"}
                  disabled={plan.current}
                >
                  {plan.current ? "Plano atual" : "Escolher plano"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de pagamentos</CardTitle>
          <CardDescription>Todos os pagamentos realizados na sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{formatDate(payment.date)}</TableCell>
                  <TableCell>{payment.description}</TableCell>
                  <TableCell>{formatCurrency(payment.amount)}</TableCell>
                  <TableCell>{getStatusBadge(payment.status)}</TableCell>
                  <TableCell className="text-right">
                    {payment.status === "paid" && (
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cancel Subscription Warning */}
      <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-red-800 dark:text-red-200">Cancelar assinatura</h4>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                Ao cancelar, você perderá acesso a todas as funcionalidades do plano no final do
                período atual.
              </p>
              <Button variant="outline" size="sm" className="mt-3 text-red-600 border-red-300">
                Cancelar assinatura
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsSubscription;
