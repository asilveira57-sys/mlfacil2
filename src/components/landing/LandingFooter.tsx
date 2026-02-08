import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import { useSiteContentContext } from "@/contexts/SiteContentContext";
import { EditableImage } from "@/components/admin/EditableImage";
import { EditableSocialLinks } from "@/components/admin/EditableSocialLinks";

export function LandingFooter() {
  const { t } = useTranslation('landing');
  const { getText } = useSiteContentContext();
  const navigate = useNavigate();
  const location = useLocation();

  const footerLinks = {
    produto: [
      { label: t('footer.col1.link1'), href: "#recursos" },
      { label: t('footer.col1.link2'), href: "#planos" },
      { label: t('footer.col1.link3'), href: "#integracoes" },
      { label: t('footer.col1.link5', 'Consultoria'), href: "/consultoria" },
      { label: t('footer.col1.link4'), href: "/blog" }
    ],
    suporte: [
      { label: t('footer.col2.link1'), href: "#faq" },
      { label: t('footer.col2.link2'), href: "#" },
      { label: t('footer.col2.link3'), href: "#" },
      { label: t('footer.col2.link4'), href: "#faq" }
    ],
    legal: [
      { label: t('footer.col3.link1'), href: "#" },
      { label: t('footer.col3.link2'), href: "#" },
      { label: t('footer.col3.link3'), href: "#" },
      { label: t('footer.col3.link4'), href: "#" }
    ]
  };

  const handleLinkClick = (href: string) => {
    if (href.startsWith("#")) {
      const isOnLandingPage = location.pathname === "/" || location.pathname === "/home";
      
      if (isOnLandingPage) {
        const element = document.querySelector(href);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        navigate(`/${href}`);
      }
    }
  };

  const logoImageUrl = getText('home.header.logo_image');
  const hasLogoImage = logoImageUrl && !logoImageUrl.startsWith('home.');

  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
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
              <span className="text-lg font-bold text-foreground">
                {t('footer.logo_name')}
              </span>
            </Link>
            <p className="text-sm text-muted-foreground mb-6">
              {t('footer.description')}
            </p>
            <EditableSocialLinks />
          </div>

          {/* Produto column */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">
              {t('footer.col1.title')}
            </h4>
            <ul className="space-y-3">
              {footerLinks.produto.map((link, index) => (
                <li key={index}>
                  {link.href.startsWith("#") ? (
                    <button
                      onClick={() => handleLinkClick(link.href)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </button>
                  ) : (
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Suporte column */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">
              {t('footer.col2.title')}
            </h4>
            <ul className="space-y-3">
              {footerLinks.suporte.map((link, index) => (
                <li key={index}>
                  {link.href.startsWith("#") ? (
                    <button
                      onClick={() => handleLinkClick(link.href)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </button>
                  ) : (
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">
              {t('footer.col3.title')}
            </h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link, index) => (
                <li key={index}>
                  <Link
                    to={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            {t('footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
