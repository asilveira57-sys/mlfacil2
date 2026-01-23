import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Camera, CheckCircle2, AlertCircle, Instagram, Linkedin, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ProfileData {
  fullName: string;
  cpf: string;
  email: string;
  emailVerified: boolean;
  whatsapp: string;
  instagram: string;
  linkedin: string;
  otherLink: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  avatarUrl: string;
}

const SettingsProfile = () => {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingCep, setLoadingCep] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    fullName: "",
    cpf: "",
    email: "",
    emailVerified: false,
    whatsapp: "",
    instagram: "",
    linkedin: "",
    otherLink: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    avatarUrl: "",
  });

  // Load profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Load from profiles table
        const { data: profileData, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Error loading profile:", error);
          toast.error("Erro ao carregar perfil");
          setLoading(false);
          return;
        }

        if (profileData) {
          setProfile({
            fullName: profileData.full_name || "",
            cpf: profileData.cpf || "",
            email: profileData.email || user.email || "",
            emailVerified: !!user.email_confirmed_at,
            whatsapp: profileData.whatsapp || "",
            instagram: profileData.instagram_url || "",
            linkedin: profileData.linkedin_url || "",
            otherLink: profileData.other_url || "",
            cep: profileData.address_cep || "",
            street: profileData.address_street || "",
            number: profileData.address_number || "",
            complement: profileData.address_complement || "",
            neighborhood: profileData.address_district || "",
            city: profileData.address_city || "",
            state: profileData.address_state || "",
            avatarUrl: profileData.photo_url || "",
          });
        } else {
          // If no profile exists, at least set email from auth
          setProfile(prev => ({
            ...prev,
            email: user.email || "",
            emailVerified: !!user.email_confirmed_at,
          }));
        }
      } catch (err) {
        console.error("Error loading profile:", err);
        toast.error("Erro ao carregar perfil");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const formatCPF = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11);
    return numbers
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };

  const formatWhatsApp = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11);
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
  };

  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 8);
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5)}`;
  };

  const handleCepBlur = async () => {
    const cep = profile.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;

    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setProfile((prev) => ({
          ...prev,
          street: data.logradouro || "",
          neighborhood: data.bairro || "",
          city: data.localidade || "",
          state: data.uf || "",
        }));
      }
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile((prev) => ({ ...prev, avatarUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const validateCPF = (cpf: string) => {
    const numbers = cpf.replace(/\D/g, "");
    if (numbers.length !== 11) return false;
    if (/^(\d)\1+$/.test(numbers)) return false;
    return true;
  };

  const handleSave = async () => {
    if (!profile.fullName.trim()) {
      toast.error("Nome completo é obrigatório");
      return;
    }
    if (profile.cpf && !validateCPF(profile.cpf)) {
      toast.error("CPF inválido");
      return;
    }
    if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
      toast.error("E-mail inválido");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const profileData = {
        full_name: profile.fullName,
        cpf: profile.cpf || null,
        email: profile.email || null,
        whatsapp: profile.whatsapp || null,
        instagram_url: profile.instagram || null,
        linkedin_url: profile.linkedin || null,
        other_url: profile.otherLink || null,
        address_cep: profile.cep || null,
        address_street: profile.street || null,
        address_number: profile.number || null,
        address_complement: profile.complement || null,
        address_district: profile.neighborhood || null,
        address_city: profile.city || null,
        address_state: profile.state || null,
        photo_url: profile.avatarUrl || null,
      };

      let error;
      if (existingProfile) {
        // Update existing
        const result = await supabase
          .from("profiles")
          .update(profileData)
          .eq("user_id", user.id);
        error = result.error;
      } else {
        // Insert new - cast to any to bypass strict type checking for user_id
        const insertData = { ...profileData, user_id: user.id } as any;
        const result = await supabase
          .from("profiles")
          .insert(insertData);
        error = result.error;
      }

      if (error) {
        console.error("Error saving profile:", error);
        toast.error("Erro ao salvar perfil");
        return;
      }

      toast.success("Perfil salvo com sucesso!");
    } catch (err) {
      console.error("Error saving profile:", err);
      toast.error("Erro ao salvar perfil");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Header Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group">
              <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                <AvatarImage src={profile.avatarUrl} />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {profile.fullName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="h-6 w-6 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>
            <div className="text-center sm:text-left flex-1">
              <h2 className="text-2xl font-semibold text-foreground">
                {profile.fullName || "Seu Nome"}
              </h2>
              <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
                {profile.emailVerified ? (
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    E-mail verificado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    E-mail não verificado
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Personal Data */}
      <Card>
        <CardHeader>
          <CardTitle>Dados Pessoais</CardTitle>
          <CardDescription>Informações básicas do seu perfil</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo *</Label>
              <Input
                id="fullName"
                value={profile.fullName}
                onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                placeholder="Seu nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                value={profile.cpf}
                onChange={(e) => setProfile((p) => ({ ...p, cpf: formatCPF(e.target.value) }))}
                placeholder="000.000.000-00"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                placeholder="seu@email.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                value={profile.whatsapp}
                onChange={(e) => setProfile((p) => ({ ...p, whatsapp: formatWhatsApp(e.target.value) }))}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <Card>
        <CardHeader>
          <CardTitle>Redes Sociais</CardTitle>
          <CardDescription>Links para suas redes sociais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="instagram" className="flex items-center gap-2">
                <Instagram className="h-4 w-4" />
                Instagram
              </Label>
              <Input
                id="instagram"
                value={profile.instagram}
                onChange={(e) => setProfile((p) => ({ ...p, instagram: e.target.value }))}
                placeholder="https://instagram.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin" className="flex items-center gap-2">
                <Linkedin className="h-4 w-4" />
                LinkedIn
              </Label>
              <Input
                id="linkedin"
                value={profile.linkedin}
                onChange={(e) => setProfile((p) => ({ ...p, linkedin: e.target.value }))}
                placeholder="https://linkedin.com/in/..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="otherLink" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Outro link
              </Label>
              <Input
                id="otherLink"
                value={profile.otherLink}
                onChange={(e) => setProfile((p) => ({ ...p, otherLink: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle>Endereço Pessoal</CardTitle>
          <CardDescription>Seu endereço de residência</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="cep">CEP</Label>
              <div className="relative">
                <Input
                  id="cep"
                  value={profile.cep}
                  onChange={(e) => setProfile((p) => ({ ...p, cep: formatCEP(e.target.value) }))}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                />
                {loadingCep && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="street">Rua</Label>
              <Input
                id="street"
                value={profile.street}
                onChange={(e) => setProfile((p) => ({ ...p, street: e.target.value }))}
                placeholder="Nome da rua"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="number">Número</Label>
              <Input
                id="number"
                value={profile.number}
                onChange={(e) => setProfile((p) => ({ ...p, number: e.target.value }))}
                placeholder="123"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="complement">Complemento</Label>
              <Input
                id="complement"
                value={profile.complement}
                onChange={(e) => setProfile((p) => ({ ...p, complement: e.target.value }))}
                placeholder="Apto, Bloco..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="neighborhood">Bairro</Label>
              <Input
                id="neighborhood"
                value={profile.neighborhood}
                onChange={(e) => setProfile((p) => ({ ...p, neighborhood: e.target.value }))}
                placeholder="Bairro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
              <Input
                id="city"
                value={profile.city}
                onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
                placeholder="Cidade"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="state">Estado</Label>
              <Input
                id="state"
                value={profile.state}
                onChange={(e) => setProfile((p) => ({ ...p, state: e.target.value }))}
                placeholder="UF"
                maxLength={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar Perfil
        </Button>
      </div>
    </div>
  );
};

export default SettingsProfile;
