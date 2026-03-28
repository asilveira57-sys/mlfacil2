import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, User, Building, UserCheck, AlertCircle, CheckCircle2, Star, Receipt, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { BillingPaymentHistory } from "./BillingPaymentHistory";
import { BillingInvoices } from "./BillingInvoices";

interface BillingData {
  billingPreference: "pf" | "pj";
  cpf: string;
  pfCep: string;
  pfCity: string;
  pfState: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  inscricaoEstadual: string;
  isento: boolean;
  pjCep: string;
  pjCity: string;
  pjState: string;
}

interface ProfileData {
  cpf: string | null;
  address_cep: string | null;
  address_city: string | null;
  address_state: string | null;
}

const BillingFiscalForm = () => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [hasExistingData, setHasExistingData] = useState(false);
  const [billing, setBilling] = useState<BillingData>({
    billingPreference: "pf",
    cpf: "",
    pfCep: "",
    pfCity: "",
    pfState: "",
    cnpj: "",
    razaoSocial: "",
    nomeFantasia: "",
    inscricaoEstadual: "",
    isento: false,
    pjCep: "",
    pjCity: "",
    pjState: "",
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: profile } = await supabase
          .from("profiles")
          .select("cpf, address_cep, address_city, address_state")
          .eq("user_id", user.id)
          .maybeSingle();

        setProfileData(profile);

        const { data: billingInfo } = await supabase
          .from("billing_info")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (billingInfo) {
          setHasExistingData(true);
          setBilling({
            billingPreference: (billingInfo.person_type as "pf" | "pj") || "pf",
            cpf: billingInfo.cpf || "",
            pfCep: billingInfo.pf_cep || "",
            pfCity: billingInfo.pf_city || "",
            pfState: billingInfo.pf_state || "",
            cnpj: billingInfo.cnpj || "",
            razaoSocial: billingInfo.razao_social || "",
            nomeFantasia: billingInfo.nome_fantasia || "",
            inscricaoEstadual: billingInfo.inscricao_estadual || "",
            isento: billingInfo.is_ie_exempt || false,
            pjCep: billingInfo.pj_cep || "",
            pjCity: billingInfo.pj_city || "",
            pjState: billingInfo.pj_state || "",
          });
        }
      } catch (err) {
        console.error("Error loading billing data:", err);
        toast.error("Erro ao carregar dados de faturamento");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const hasProfileData = profileData && (profileData.cpf || profileData.address_cep);

  const handleAutoFillFromProfile = (type: "pf" | "pj") => {
    if (!profileData) return;
    if (type === "pf") {
      setBilling((prev) => ({
        ...prev,
        cpf: profileData.cpf || prev.cpf,
        pfCep: profileData.address_cep || prev.pfCep,
        pfCity: profileData.address_city || prev.pfCity,
        pfState: profileData.address_state || prev.pfState,
      }));
    } else {
      setBilling((prev) => ({
        ...prev,
        pjCep: profileData.address_cep || prev.pjCep,
        pjCity: profileData.address_city || prev.pjCity,
        pjState: profileData.address_state || prev.pjState,
      }));
    }
    toast.success("Dados do perfil aplicados!");
  };

  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11);
    return numbers.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };
  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 14);
    return numbers.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  };
  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 8);
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5)}`;
  };

  const handleCepBlur = async (field: "pfCep" | "pjCep") => {
    const cep = billing[field].replace(/\D/g, "");
    if (cep.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        if (field === "pfCep") {
          setBilling((prev) => ({ ...prev, pfCity: data.localidade || "", pfState: data.uf || "" }));
        } else {
          setBilling((prev) => ({ ...prev, pjCity: data.localidade || "", pjState: data.uf || "" }));
        }
      }
    } catch { toast.error("Erro ao buscar CEP"); }
    finally { setLoadingCep(false); }
  };

  const validateCNPJ = (cnpj: string) => cnpj.replace(/\D/g, "").length === 14;
  const validateCPF = (cpf: string) => cpf.replace(/\D/g, "").length === 11;
  const isPfComplete = billing.cpf && validateCPF(billing.cpf);
  const isPjComplete = billing.cnpj && validateCNPJ(billing.cnpj) && billing.razaoSocial;

  const handleSave = async () => {
    if (billing.billingPreference === "pf") {
      if (!billing.cpf || !validateCPF(billing.cpf)) { toast.error("CPF inválido."); return; }
    } else {
      if (!billing.cnpj || !validateCNPJ(billing.cnpj)) { toast.error("CNPJ inválido."); return; }
      if (!billing.razaoSocial) { toast.error("Razão Social é obrigatória."); return; }
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Usuário não autenticado"); return; }
      const billingData = {
        user_id: user.id, person_type: billing.billingPreference, is_preferred: true,
        cpf: billing.cpf || null, pf_cep: billing.pfCep || null, pf_city: billing.pfCity || null, pf_state: billing.pfState || null,
        cnpj: billing.cnpj || null, razao_social: billing.razaoSocial || null, nome_fantasia: billing.nomeFantasia || null,
        inscricao_estadual: billing.inscricaoEstadual || null, is_ie_exempt: billing.isento,
        pj_cep: billing.pjCep || null, pj_city: billing.pjCity || null, pj_state: billing.pjState || null,
      };
      if (hasExistingData) {
        const { error } = await supabase.from("billing_info").update(billingData).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("billing_info").insert(billingData);
        if (error) throw error;
        setHasExistingData(true);
      }
      toast.success("Dados fiscais salvos com sucesso!");
    } catch (err) {
      console.error("Error saving billing data:", err);
      toast.error("Erro ao salvar dados fiscais");
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const isCurrentPreferenceComplete = billing.billingPreference === "pf" ? isPfComplete : isPjComplete;

  return (
    <div className="space-y-6">
      {hasExistingData && isCurrentPreferenceComplete && (
        <Alert className="border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="flex items-center gap-2">
            <span>Faturamento configurado para{" "}<strong>{billing.billingPreference === "pf" ? "Pessoa Física (CPF)" : "Pessoa Jurídica (CNPJ)"}</strong></span>
            <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-400"><Star className="mr-1 h-3 w-3" />Ativo</Badge>
          </AlertDescription>
        </Alert>
      )}
      {!hasExistingData && (
        <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription><strong>Dados de faturamento obrigatórios:</strong> Configure seus dados fiscais para poder contratar um plano e receber notas fiscais.</AlertDescription>
        </Alert>
      )}

      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2"><Star className="h-5 w-5 text-primary" />Faturar para</CardTitle>
          <CardDescription>Selecione como deseja receber suas notas fiscais.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <button type="button" onClick={() => setBilling((p) => ({ ...p, billingPreference: "pf" }))} className={cn("relative flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-all hover:bg-accent/50", billing.billingPreference === "pf" ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/50")}>
              {billing.billingPreference === "pf" && <div className="absolute -top-2 -right-2"><Badge className="bg-primary text-primary-foreground"><CheckCircle2 className="mr-1 h-3 w-3" />Selecionado</Badge></div>}
              <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", billing.billingPreference === "pf" ? "bg-primary text-primary-foreground" : "bg-muted")}><User className="h-7 w-7" /></div>
              <div className="text-center"><h3 className="font-semibold text-lg">Pessoa Física</h3><p className="text-sm text-muted-foreground">Faturar no CPF</p></div>
              {isPfComplete ? <Badge variant="outline" className="mt-1 border-green-500/50 text-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Dados preenchidos</Badge> : <Badge variant="outline" className="mt-1 border-amber-500/50 text-amber-600"><AlertCircle className="mr-1 h-3 w-3" />Preencher dados</Badge>}
            </button>
            <button type="button" onClick={() => setBilling((p) => ({ ...p, billingPreference: "pj" }))} className={cn("relative flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-all hover:bg-accent/50", billing.billingPreference === "pj" ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/50")}>
              {billing.billingPreference === "pj" && <div className="absolute -top-2 -right-2"><Badge className="bg-primary text-primary-foreground"><CheckCircle2 className="mr-1 h-3 w-3" />Selecionado</Badge></div>}
              <div className={cn("flex h-14 w-14 items-center justify-center rounded-full", billing.billingPreference === "pj" ? "bg-primary text-primary-foreground" : "bg-muted")}><Building className="h-7 w-7" /></div>
              <div className="text-center"><h3 className="font-semibold text-lg">Pessoa Jurídica</h3><p className="text-sm text-muted-foreground">Faturar no CNPJ</p></div>
              {isPjComplete ? <Badge variant="outline" className="mt-1 border-green-500/50 text-green-600"><CheckCircle2 className="mr-1 h-3 w-3" />Dados preenchidos</Badge> : <Badge variant="outline" className="mt-1 border-amber-500/50 text-amber-600"><AlertCircle className="mr-1 h-3 w-3" />Preencher dados</Badge>}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* PF Form */}
      <Card className={cn("transition-all", billing.billingPreference === "pf" ? "ring-2 ring-primary/30" : "opacity-75")}>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Dados Pessoa Física{billing.billingPreference === "pf" && <Badge variant="default" className="ml-2">Ativo</Badge>}</CardTitle>
            <CardDescription>Dados para emissão de nota fiscal como pessoa física</CardDescription>
          </div>
          {hasProfileData && <Button variant="outline" size="sm" onClick={() => handleAutoFillFromProfile("pf")} disabled={loadingProfile} className="shrink-0"><UserCheck className="mr-2 h-4 w-4" />Preencher com Perfil</Button>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="pf-cpf">CPF *</Label><Input id="pf-cpf" value={billing.cpf} onChange={(e) => setBilling((p) => ({ ...p, cpf: formatCPF(e.target.value) }))} placeholder="000.000.000-00" /></div>
          </div>
          <Separator />
          <h4 className="font-medium text-sm text-muted-foreground">Endereço de Faturamento</h4>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="pf-cep">CEP</Label><div className="relative"><Input id="pf-cep" value={billing.pfCep} onChange={(e) => setBilling((p) => ({ ...p, pfCep: formatCEP(e.target.value) }))} onBlur={() => handleCepBlur("pfCep")} placeholder="00000-000" />{loadingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}</div></div>
            <div className="space-y-2"><Label htmlFor="pf-city">Município</Label><Input id="pf-city" value={billing.pfCity} onChange={(e) => setBilling((p) => ({ ...p, pfCity: e.target.value }))} placeholder="Cidade" /></div>
            <div className="space-y-2"><Label htmlFor="pf-state">UF</Label><Input id="pf-state" value={billing.pfState} onChange={(e) => setBilling((p) => ({ ...p, pfState: e.target.value }))} placeholder="UF" maxLength={2} /></div>
          </div>
        </CardContent>
      </Card>

      {/* PJ Form */}
      <Card className={cn("transition-all", billing.billingPreference === "pj" ? "ring-2 ring-primary/30" : "opacity-75")}>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" />Dados Pessoa Jurídica{billing.billingPreference === "pj" && <Badge variant="default" className="ml-2">Ativo</Badge>}</CardTitle>
            <CardDescription>Dados empresariais para emissão de nota fiscal</CardDescription>
          </div>
          {hasProfileData && <Button variant="outline" size="sm" onClick={() => handleAutoFillFromProfile("pj")} disabled={loadingProfile} className="shrink-0"><UserCheck className="mr-2 h-4 w-4" />Preencher Endereço com Perfil</Button>}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="pj-cnpj">CNPJ *</Label><Input id="pj-cnpj" value={billing.cnpj} onChange={(e) => setBilling((p) => ({ ...p, cnpj: formatCNPJ(e.target.value) }))} placeholder="00.000.000/0000-00" /></div>
            <div className="space-y-2"><Label htmlFor="razao-social">Razão Social *</Label><Input id="razao-social" value={billing.razaoSocial} onChange={(e) => setBilling((p) => ({ ...p, razaoSocial: e.target.value }))} placeholder="Razão Social da Empresa" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="nome-fantasia">Nome Fantasia</Label><Input id="nome-fantasia" value={billing.nomeFantasia} onChange={(e) => setBilling((p) => ({ ...p, nomeFantasia: e.target.value }))} placeholder="Nome Fantasia" /></div>
            <div className="space-y-2">
              <Label htmlFor="ie">Inscrição Estadual</Label>
              <div className="flex gap-2">
                <Input id="ie" value={billing.inscricaoEstadual} onChange={(e) => setBilling((p) => ({ ...p, inscricaoEstadual: e.target.value }))} placeholder="Inscrição Estadual" disabled={billing.isento} className="flex-1" />
                <div className="flex items-center gap-2 px-3 bg-muted rounded-md">
                  <Checkbox id="isento" checked={billing.isento} onCheckedChange={(checked) => setBilling((p) => ({ ...p, isento: !!checked, inscricaoEstadual: checked ? "" : p.inscricaoEstadual }))} />
                  <Label htmlFor="isento" className="text-sm cursor-pointer">Isento</Label>
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <h4 className="font-medium text-sm text-muted-foreground">Endereço da Empresa</h4>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="pj-cep">CEP</Label><div className="relative"><Input id="pj-cep" value={billing.pjCep} onChange={(e) => setBilling((p) => ({ ...p, pjCep: formatCEP(e.target.value) }))} onBlur={() => handleCepBlur("pjCep")} placeholder="00000-000" />{loadingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}</div></div>
            <div className="space-y-2"><Label htmlFor="pj-city">Município</Label><Input id="pj-city" value={billing.pjCity} onChange={(e) => setBilling((p) => ({ ...p, pjCity: e.target.value }))} placeholder="Cidade" /></div>
            <div className="space-y-2"><Label htmlFor="pj-state">UF</Label><Input id="pj-state" value={billing.pjState} onChange={(e) => setBilling((p) => ({ ...p, pjState: e.target.value }))} placeholder="UF" maxLength={2} /></div>
          </div>
        </CardContent>
      </Card>

      <Separator />
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar Dados Fiscais</Button>
      </div>
    </div>
  );
};

const SettingsBilling = () => {
  return (
    <Tabs defaultValue="fiscal" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="fiscal" className="flex items-center gap-2">
          <Star className="h-4 w-4" />
          Dados Fiscais
        </TabsTrigger>
        <TabsTrigger value="history" className="flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Pagamentos
        </TabsTrigger>
        <TabsTrigger value="invoices" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Notas Fiscais
        </TabsTrigger>
      </TabsList>

      <TabsContent value="fiscal">
        <BillingFiscalForm />
      </TabsContent>

      <TabsContent value="history">
        <BillingPaymentHistory />
      </TabsContent>

      <TabsContent value="invoices">
        <BillingInvoices />
      </TabsContent>
    </Tabs>
  );
};

export default SettingsBilling;
