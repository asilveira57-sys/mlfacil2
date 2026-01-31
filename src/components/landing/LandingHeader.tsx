import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { BarChart3, Menu } from "lucide-react";
import { useSiteContentContext } from "@/contexts/SiteContentContext";
import { EditableText } from "@/components/admin/EditableText";
import { EditableImage } from "@/components/admin/EditableImage";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export function LandingHeader() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { getText } = useSiteContentContext();

  const navItems = [
    { label: getText('home.header.menu_recursos'), href: "#recursos" },
    { label: getText('home.header.menu_como_funciona'), href: "#como-funciona" },
    { label: getText('home.header.menu_integracoes'), href: "#integracoes" },
    { label: getText('home.header.menu_planos'), href: "#planos" },
    { label: getText('home.header.menu_blog'), href: "/blog" },
    { label: getText('home.header.menu_suporte'), href: "#faq" },
  ];

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    if (href.startsWith("#")) {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      navigate(href);
    }
  };

  const logoImageUrl = getText('home.header.logo_image');
  const hasLogoImage = logoImageUrl && !logoImageUrl.startsWith('home.');

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            {hasLogoImage ? (
              <EditableImage
                contentKey="home.header.logo_image"
                className="w-10 h-10 rounded-xl"
                alt="Logo"
              />
            ) : (
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-primary-foreground" />
              </div>
            )}
            <EditableText 
              contentKey="home.header.logo_name" 
              as="span"
              className="text-xl font-bold text-foreground hidden sm:block"
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => handleNavClick(item.href)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageSwitcher variant="compact" />
            <Button 
              variant="ghost" 
              onClick={() => navigate("/auth")}
            >
              {getText('home.header.btn_entrar')}
            </Button>
            <Button onClick={() => navigate("/auth")}>
              {getText('home.header.btn_criar_conta')}
            </Button>
          </div>

          {/* Mobile Menu Trigger */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[350px]">
              <div className="flex flex-col gap-6 mt-8">
                <nav className="flex flex-col gap-2">
                  {navItems.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => handleNavClick(item.href)}
                      className="px-4 py-3 text-left text-foreground hover:bg-muted rounded-lg transition-colors"
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
                <div className="flex flex-col gap-3 pt-4 border-t">
                  <div className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
                    <span>Idioma</span>
                    <LanguageSwitcher variant="full" />
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => { navigate("/auth"); setMobileMenuOpen(false); }}
                  >
                    {getText('home.header.btn_entrar')}
                  </Button>
                  <Button 
                    onClick={() => { navigate("/auth"); setMobileMenuOpen(false); }}
                  >
                    {getText('home.header.btn_criar_conta')}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
