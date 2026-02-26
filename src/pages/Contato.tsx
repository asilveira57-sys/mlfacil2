import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Instagram, Mail, Phone, MapPin, Send, ExternalLink } from "lucide-react";
import alexandrePhoto from "@/assets/alexandre-silveira.png";

const SUBJECTS = [
  "Parceria",
  "Consultoria",
  "Suporte técnico",
  "Instrução / Treinamento",
  "Reclamação",
  "Convite para evento",
  "Imprensa / Reportagem",
  "Outro",
];

export default function Contato() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    subject: "",
    message: "",
  });

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.subject || !form.message) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("contact_messages").insert({
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      subject: form.subject,
      message: form.message.trim(),
      source: "web",
    });
    setLoading(false);

    if (error) {
      toast.error("Erro ao enviar mensagem. Tente novamente.");
      console.error(error);
      return;
    }

    toast.success("Mensagem enviada com sucesso! Retornaremos em breve.");
    setForm({ name: "", email: "", phone: "", company: "", subject: "", message: "" });
  };

  return (
    <div className="py-8">
      <div className="container mx-auto px-4 text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground">Contato</h1>
        <p className="text-sm text-muted-foreground">
          Entre em contato para parcerias, consultoria ou suporte.
        </p>
      </div>

      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mx-auto">
          {/* COLUNA 1 — Perfil */}
          <div className="space-y-6">
            {/* Foto */}
            <div className="flex justify-center lg:justify-start">
              <img
                src={alexandrePhoto}
                alt="Alexandre Silveira"
                className="w-56 h-56 rounded-2xl object-cover object-top shadow-lg border border-border"
              />
            </div>

            {/* Identificação */}
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-foreground">Alexandre Silveira</h2>
              <p className="text-base font-medium text-primary">
                Consultor de Ecommerce e Marketplace
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Empreendedor com atuação prática em Mercado Livre, Amazon e Shopee. Criador do Mktpfacil e CEO da Adeconex Etiquetas. Especialista em estratégias de crescimento, automação, precificação e organização de operações digitais. Desenvolve soluções voltadas para performance e escalabilidade.
              </p>
            </div>

            {/* Redes e Contato */}
            <Card>
              <CardContent className="py-5 space-y-3">
                <a
                  href="https://www.instagram.com/mlfacil"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                >
                  <Instagram className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">Instagram</span>
                    <p className="text-xs text-muted-foreground">@mlfacil</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>

                <a
                  href="mailto:contato@mlfacil.com"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                >
                  <Mail className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">Email</span>
                    <p className="text-xs text-muted-foreground">contato@mlfacil.com</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>

                <a
                  href="https://wa.me/5527997622425"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                >
                  <Phone className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">WhatsApp</span>
                    <p className="text-xs text-muted-foreground">(27) 99762-2425</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>

                <div className="flex items-center gap-3 p-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Atendimento nacional</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* COLUNA 2 — Formulário */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Envie sua mensagem</CardTitle>
              <p className="text-sm text-muted-foreground">
                Selecione o assunto para direcionamento correto.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={e => handleChange("name", e.target.value)}
                    required
                    maxLength={100}
                    placeholder="Seu nome completo"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={e => handleChange("email", e.target.value)}
                    required
                    maxLength={255}
                    placeholder="seu@email.com"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={e => handleChange("phone", e.target.value)}
                      maxLength={20}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Empresa</Label>
                    <Input
                      id="company"
                      value={form.company}
                      onChange={e => handleChange("company", e.target.value)}
                      maxLength={100}
                      placeholder="Nome da empresa"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Assunto *</Label>
                  <Select value={form.subject} onValueChange={v => handleChange("subject", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o assunto" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Mensagem *</Label>
                  <Textarea
                    id="message"
                    value={form.message}
                    onChange={e => handleChange("message", e.target.value)}
                    required
                    maxLength={2000}
                    rows={5}
                    placeholder="Descreva como podemos ajudar..."
                  />
                </div>

                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  <Send className="h-4 w-4" />
                  {loading ? "Enviando..." : "Enviar mensagem"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Secondary links */}
      <div className="container mx-auto px-4 py-6 text-center">
        <p className="text-xs text-muted-foreground mb-2">Suas informações são tratadas com sigilo e segurança.</p>
        <Link to="/central-de-ajuda" className="text-xs text-primary hover:underline">
          Consultar Central de Ajuda
        </Link>
      </div>
    </div>
  );
}
