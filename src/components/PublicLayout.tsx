import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Menu, X, ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import WhatsAppFloatingButton from "@/components/WhatsAppFloatingButton";

const NAV_ITEMS = [
  { label: "Início", href: "/" },
  { label: "Central de Ajuda", href: "/central-de-ajuda" },
  { label: "Status", href: "/status" },
  { label: "Contato", href: "/contato" },
];

const PAGE_NAMES: Record<string, string> = {
  "/central-de-ajuda": "Central de Ajuda",
  "/status": "Status do Sistema",
  "/contato": "Contato",
};

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      setIsLoggedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Build breadcrumb from path
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const pageName = PAGE_NAMES[`/${pathSegments[0]}`] || pathSegments[0];
  const isSubPage = pathSegments.length > 1;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Topbar */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">MKTP Fácil</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} to={item.href}>
                <Button
                  variant={location.pathname.startsWith(item.href) && item.href !== "/" ? "secondary" : "ghost"}
                  size="sm"
                  className="text-sm"
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="hidden md:flex items-center gap-2">
            {isLoggedIn ? (
              <>
                <Link to="/dashboard">
                  <Button size="sm" variant="outline">Painel</Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await supabase.auth.signOut();
                  }}
                >
                  Sair
                </Button>
              </>
            ) : (
              <Link to="/auth">
                <Button size="sm">Entrar</Button>
              </Link>
            )}
          </div>

          {/* Mobile Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden border-t bg-background px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors"
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-2 border-t mt-2">
              {isLoggedIn ? (
                <>
                  <Link to="/dashboard" onClick={() => setMenuOpen(false)}>
                    <Button size="sm" variant="outline" className="w-full mb-1">Painel</Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setMenuOpen(false);
                    }}
                  >
                    Sair
                  </Button>
                </>
              ) : (
                <Link to="/auth" onClick={() => setMenuOpen(false)}>
                  <Button size="sm" className="w-full">Entrar</Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Breadcrumb Bar */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-2 flex items-center gap-2 text-sm">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <Home className="h-3.5 w-3.5" /> Início
          </Link>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          {isSubPage ? (
            <>
              <Link to={`/${pathSegments[0]}`} className="text-muted-foreground hover:text-foreground transition-colors">
                {pageName}
              </Link>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-foreground font-medium truncate max-w-[200px]">
                Artigo
              </span>
            </>
          ) : (
            <span className="text-foreground font-medium">{pageName}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/20 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              © {currentYear} MKTP Fácil.
            </p>
            <div className="flex items-center gap-4">
              <Link to="/central-de-ajuda" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Central de Ajuda
              </Link>
              <Link to="/status" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Status
              </Link>
              <Link to="/contato" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Contato
              </Link>
              <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Início
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
