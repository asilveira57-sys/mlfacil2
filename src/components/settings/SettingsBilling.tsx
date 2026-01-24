import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, User, Building, UserCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface BillingData {
  personType: "pf" | "pj";
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
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [billing, setBilling] = useState<BillingData>({
    personType: "pf",
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
    const loadProfileData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from("profiles")
          .select("cpf, address_cep, address_city, address_state")
          .eq("user_id", user.id)
          .maybeSingle();

        setProfileData(data);
      } catch (err) {
        console.error("Error loading profile for autofill:", err);
      }
    };

    loadProfileData();
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

  const handleSave = async () => {
    if (billing.personType === "pf") {
      if (!billing.cpf) {
        toast.error("CPF é obrigatório");
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
      await new Promise((r) => setTimeout(r, 1000));
      toast.success("Dados fiscais salvos com sucesso!");
    } catch {
      toast.error("Erro ao salvar dados fiscais");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
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

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Dados Fiscais
        </Button>
      </div>
    </div>
  );
};

export default SettingsBilling;
