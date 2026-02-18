import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import { useSiteContentContext } from "@/contexts/SiteContentContext";
import { EditableImage } from "@/components/admin/EditableImage";
import { EditableSocialLinks } from "@/components/admin/EditableSocialLinks";
import { EditableText } from "@/components/admin/EditableText";

export function LandingFooter() {
  const { t } = useTranslation('landing');
  const { getText } = useSiteContentContext();
  const navigate = useNavigate();
  const location = useLocation();

  const footerLinks = {
    produto: [
      { labelKey: "home.footer.col1.link1", label: t('footer.col1.link1'), href: "#recursos" },
      { labelKey: "home.footer.col1.link2", label: t('footer.col1.link2'), href: "#planos" },
      { labelKey: "home.footer.col1.link3", label: t('footer.col1.link3'), href: "#integracoes" },
      { labelKey: "home.footer.col1.link5", label: t('footer.col1.link5', 'Consultoria'), href: "/consultoria" },
      { labelKey: "home.footer.col1.link4", label: t('footer.col1.link4'), href: "/blog" }
    ],
    suporte: [
      { labelKey: "home.footer.col2.link1", label: t('footer.col2.link1'), href: "#faq" },
      { labelKey: "home.footer.col2.link2", label: t('footer.col2.link2'), href: "#" },
      { labelKey: "home.footer.col2.link3", label: t('footer.col2.link3'), href: "#" },
      { labelKey: "home.footer.col2.link4", label: t('footer.col2.link4'), href: "#faq" }
    ],
    legal: [
      { labelKey: "home.footer.col3.link1", label: t('footer.col3.link1'), href: "/termos-de-uso" },
      { labelKey: "home.footer.col3.link2", label: t('footer.col3.link2'), href: "/politica-de-privacidade" },
      { labelKey: "home.footer.col3.link3", label: t('footer.col3.link3'), href: "/politica-de-cookies" },
      { labelKey: "home.footer.col3.link4", label: t('footer.col3.link4'), href: "#" }
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

  const renderLink = (link: { labelKey: string; label: string; href: string }, index: number) => {
    const content = (
      <EditableText contentKey={link.labelKey} as="span">
        {link.label}
      </EditableText>
    );

    if (link.href.startsWith("#")) {
      return (
        <li key={index}>
          <button
            onClick={() => handleLinkClick(link.href)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {content}
          </button>
        </li>
      );
    }

    return (
      <li key={index}>
        <Link
          to={link.href}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {content}
        </Link>
      </li>
    );
  };

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
                <EditableText contentKey="home.footer.logo_name" as="span">
                  {t('footer.logo_name')}
                </EditableText>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground mb-6">
              <EditableText contentKey="home.footer.description" as="span" multiline>
                {t('footer.description')}
              </EditableText>
            </p>
            <EditableSocialLinks />
          </div>

          {/* Produto column */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">
              <EditableText contentKey="home.footer.col1.title" as="span">
                {t('footer.col1.title')}
              </EditableText>
            </h4>
            <ul className="space-y-3">
              {footerLinks.produto.map((link, index) => renderLink(link, index))}
            </ul>
          </div>

          {/* Suporte column */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">
              <EditableText contentKey="home.footer.col2.title" as="span">
                {t('footer.col2.title')}
              </EditableText>
            </h4>
            <ul className="space-y-3">
              {footerLinks.suporte.map((link, index) => renderLink(link, index))}
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">
              <EditableText contentKey="home.footer.col3.title" as="span">
                {t('footer.col3.title')}
              </EditableText>
            </h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link, index) => renderLink(link, index))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-border text-center">
          <p className="text-sm text-muted-foreground">
            <EditableText contentKey="home.footer.copyright" as="span">
              {t('footer.copyright')}
            </EditableText>
          </p>
        </div>
      </div>
    </footer>
  );
}
