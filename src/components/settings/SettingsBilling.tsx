import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, User, Building, UserCheck, AlertCircle, CheckCircle2, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface BillingData {
  personType: "pf" | "pj";
  isPreferred: boolean;
  // PF
  cpf: string;
  pfCep: string;
  pfCity: string;
  pfState: string;
  // PJ
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

const SettingsBilling = () => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [hasExistingData, setHasExistingData] = useState(false);
  const [billing, setBilling] = useState<BillingData>({
    personType: "pf",
    isPreferred: true,
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

  // Carrega dados do perfil para verificar se podem ser usados
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Load profile data
        const { data: profile } = await supabase
          .from("profiles")
          .select("cpf, address_cep, address_city, address_state")
          .eq("user_id", user.id)
          .maybeSingle();

        setProfileData(profile);

        // Load existing billing info
        const { data: billingInfo } = await supabase
          .from("billing_info")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (billingInfo) {
          setHasExistingData(true);
          setBilling({
            personType: (billingInfo.person_type as "pf" | "pj") || "pf",
            isPreferred: billingInfo.is_preferred ?? true,
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

  const handleAutoFillFromProfile = () => {
    if (!profileData) return;

    if (billing.personType === "pf") {
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
    return numbers
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };

  const formatCNPJ = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 14);
    return numbers
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
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
          setBilling((prev) => ({
            ...prev,
            pfCity: data.localidade || "",
            pfState: data.uf || "",
          }));
        } else {
          setBilling((prev) => ({
            ...prev,
            pjCity: data.localidade || "",
            pjState: data.uf || "",
          }));
        }
      }
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  };

  const validateCNPJ = (cnpj: string) => {
    const numbers = cnpj.replace(/\D/g, "");
    return numbers.length === 14;
  };

  const validateCPF = (cpf: string) => {
    const numbers = cpf.replace(/\D/g, "");
    return numbers.length === 11;
  };

  const handleSave = async () => {
    if (billing.personType === "pf") {
      if (!billing.cpf || !validateCPF(billing.cpf)) {
        toast.error("CPF inválido");
        return;
      }
    } else {
      if (!billing.cnpj || !validateCNPJ(billing.cnpj)) {
        toast.error("CNPJ inválido");
        return;
      }
      if (!billing.razaoSocial) {
        toast.error("Razão Social é obrigatória");
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      const billingData = {
        user_id: user.id,
        person_type: billing.personType,
        is_preferred: billing.isPreferred,
        cpf: billing.cpf || null,
        pf_cep: billing.pfCep || null,
        pf_city: billing.pfCity || null,
        pf_state: billing.pfState || null,
        cnpj: billing.cnpj || null,
        razao_social: billing.razaoSocial || null,
        nome_fantasia: billing.nomeFantasia || null,
        inscricao_estadual: billing.inscricaoEstadual || null,
        is_ie_exempt: billing.isento,
        pj_cep: billing.pjCep || null,
        pj_city: billing.pjCity || null,
        pj_state: billing.pjState || null,
      };

      if (hasExistingData) {
        const { error } = await supabase
          .from("billing_info")
          .update(billingData)
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("billing_info")
          .insert(billingData);

        if (error) throw error;
        setHasExistingData(true);
      }

      toast.success("Dados fiscais salvos com sucesso!");
    } catch (err) {
      console.error("Error saving billing data:", err);
      toast.error("Erro ao salvar dados fiscais");
    } finally {
      setSaving(false);
    }
  };

  const handleSetAsPreferred = async () => {
    setBilling((prev) => ({ ...prev, isPreferred: true }));
    
    // If already has existing data, update immediately
    if (hasExistingData) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase
          .from("billing_info")
          .update({ is_preferred: true })
          .eq("user_id", user.id);

        toast.success("Preferência de faturamento definida!");
      } catch (err) {
        console.error("Error updating preference:", err);
        toast.error("Erro ao atualizar preferência");
      }
    } else {
      toast.info("Salve os dados para definir a preferência");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isDataComplete = billing.personType === "pf" 
    ? (billing.cpf && validateCPF(billing.cpf))
    : (billing.cnpj && validateCNPJ(billing.cnpj) && billing.razaoSocial);

  return (
    <div className="space-y-6">
      {/* Status Card */}
      {hasExistingData && isDataComplete && (
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              Dados de faturamento configurados como{" "}
              <strong>{billing.personType === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}</strong>
              {billing.isPreferred && (
                <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">
                  <Star className="mr-1 h-3 w-3" />
                  Preferência Ativa
                </Badge>
              )}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {!hasExistingData && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Dados de faturamento obrigatórios:</strong> Configure seus dados fiscais para poder contratar um plano e receber notas fiscais.
          </AlertDescription>
        </Alert>
      )}

      {/* Person Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Tipo de Pessoa</CardTitle>
          <CardDescription>
            Selecione o tipo de pessoa para faturamento e emissão de notas fiscais
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={billing.personType}
            onValueChange={(v) => setBilling((p) => ({ ...p, personType: v as "pf" | "pj" }))}
            className="flex gap-6"
          >
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="pf" id="pf" />
              <Label htmlFor="pf" className="flex items-center gap-2 cursor-pointer">
                <User className="h-4 w-4" />
                Pessoa Física
              </Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="pj" id="pj" />
              <Label htmlFor="pj" className="flex items-center gap-2 cursor-pointer">
                <Building className="h-4 w-4" />
                Pessoa Jurídica
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* PF Form */}
      {billing.personType === "pf" && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle>Dados Pessoa Física</CardTitle>
              <CardDescription>Dados para emissão de nota fiscal como pessoa física</CardDescription>
            </div>
            {hasProfileData ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoFillFromProfile}
                disabled={loadingProfile}
                className="shrink-0"
              >
                <UserCheck className="mr-2 h-4 w-4" />
                Preencher com Perfil
              </Button>
            ) : (
              <Alert variant="default" className="w-auto border-amber-200 bg-amber-50 text-amber-800 py-2 px-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Preencha seus dados no <strong>Perfil</strong> primeiro
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pf-cpf">CPF *</Label>
                <Input
                  id="pf-cpf"
                  value={billing.cpf}
                  onChange={(e) => setBilling((p) => ({ ...p, cpf: formatCPF(e.target.value) }))}
                  placeholder="000.000.000-00"
                />
              </div>
            </div>

            <Separator />

            <h4 className="font-medium text-sm text-muted-foreground">Endereço de Faturamento</h4>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pf-cep">CEP</Label>
                <div className="relative">
                  <Input
                    id="pf-cep"
                    value={billing.pfCep}
                    onChange={(e) => setBilling((p) => ({ ...p, pfCep: formatCEP(e.target.value) }))}
                    onBlur={() => handleCepBlur("pfCep")}
                    placeholder="00000-000"
                  />
                  {loadingCep && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-city">Município</Label>
                <Input
                  id="pf-city"
                  value={billing.pfCity}
                  onChange={(e) => setBilling((p) => ({ ...p, pfCity: e.target.value }))}
                  placeholder="Cidade"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-state">UF</Label>
                <Input
                  id="pf-state"
                  value={billing.pfState}
                  onChange={(e) => setBilling((p) => ({ ...p, pfState: e.target.value }))}
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PJ Form */}
      {billing.personType === "pj" && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle>Dados Pessoa Jurídica</CardTitle>
              <CardDescription>Dados empresariais para emissão de nota fiscal</CardDescription>
            </div>
            {hasProfileData ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoFillFromProfile}
                disabled={loadingProfile}
                className="shrink-0"
              >
                <UserCheck className="mr-2 h-4 w-4" />
                Preencher Endereço com Perfil
              </Button>
            ) : (
              <Alert variant="default" className="w-auto border-amber-200 bg-amber-50 text-amber-800 py-2 px-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Preencha o endereço no <strong>Perfil</strong> primeiro
                </AlertDescription>
              </Alert>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pj-cnpj">CNPJ *</Label>
                <Input
                  id="pj-cnpj"
                  value={billing.cnpj}
                  onChange={(e) => setBilling((p) => ({ ...p, cnpj: formatCNPJ(e.target.value) }))}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="razao-social">Razão Social *</Label>
                <Input
                  id="razao-social"
                  value={billing.razaoSocial}
                  onChange={(e) => setBilling((p) => ({ ...p, razaoSocial: e.target.value }))}
                  placeholder="Razão Social da Empresa"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nome-fantasia">Nome Fantasia</Label>
                <Input
                  id="nome-fantasia"
                  value={billing.nomeFantasia}
                  onChange={(e) => setBilling((p) => ({ ...p, nomeFantasia: e.target.value }))}
                  placeholder="Nome Fantasia"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ie">Inscrição Estadual</Label>
                <div className="flex gap-2">
                  <Input
                    id="ie"
                    value={billing.inscricaoEstadual}
                    onChange={(e) => setBilling((p) => ({ ...p, inscricaoEstadual: e.target.value }))}
                    placeholder="Inscrição Estadual"
                    disabled={billing.isento}
                    className="flex-1"
                  />
                  <div className="flex items-center gap-2 px-3 bg-muted rounded-md">
                    <Checkbox
                      id="isento"
                      checked={billing.isento}
                      onCheckedChange={(checked) =>
                        setBilling((p) => ({
                          ...p,
                          isento: !!checked,
                          inscricaoEstadual: checked ? "" : p.inscricaoEstadual,
                        }))
                      }
                    />
                    <Label htmlFor="isento" className="text-sm cursor-pointer">
                      Isento
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <h4 className="font-medium text-sm text-muted-foreground">Endereço da Empresa</h4>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pj-cep">CEP</Label>
                <div className="relative">
                  <Input
                    id="pj-cep"
                    value={billing.pjCep}
                    onChange={(e) => setBilling((p) => ({ ...p, pjCep: formatCEP(e.target.value) }))}
                    onBlur={() => handleCepBlur("pjCep")}
                    placeholder="00000-000"
                  />
                  {loadingCep && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pj-city">Município</Label>
                <Input
                  id="pj-city"
                  value={billing.pjCity}
                  onChange={(e) => setBilling((p) => ({ ...p, pjCity: e.target.value }))}
                  placeholder="Cidade"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pj-state">UF</Label>
                <Input
                  id="pj-state"
                  value={billing.pjState}
                  onChange={(e) => setBilling((p) => ({ ...p, pjState: e.target.value }))}
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        {hasExistingData && !billing.isPreferred && (
          <Button 
            variant="outline" 
            onClick={handleSetAsPreferred}
            disabled={!isDataComplete}
          >
            <Star className="mr-2 h-4 w-4" />
            Definir como Preferência de Faturamento
          </Button>
        )}
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Dados Fiscais
        </Button>
      </div>
    </div>
  );
};

export default SettingsBilling;
