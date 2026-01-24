import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { useSiteContentContext } from "@/contexts/SiteContentContext";
import { EditableText } from "@/components/admin/EditableText";
import { EditableImage } from "@/components/admin/EditableImage";
import { EditableSocialLinks } from "@/components/admin/EditableSocialLinks";

export function LandingFooter() {
  const { getText } = useSiteContentContext();

  const footerLinks = {
    produto: [
      { labelKey: 'home.footer.col1.link1', href: "#recursos" },
      { labelKey: 'home.footer.col1.link2', href: "#planos" },
      { labelKey: 'home.footer.col1.link3', href: "#integracoes" },
      { labelKey: 'home.footer.col1.link4', href: "/blog" }
    ],
    suporte: [
      { labelKey: 'home.footer.col2.link1', href: "#faq" },
      { labelKey: 'home.footer.col2.link2', href: "#" },
      { labelKey: 'home.footer.col2.link3', href: "#" },
      { labelKey: 'home.footer.col2.link4', href: "#faq" }
    ],
    legal: [
      { labelKey: 'home.footer.col3.link1', href: "#" },
      { labelKey: 'home.footer.col3.link2', href: "#" },
      { labelKey: 'home.footer.col3.link3', href: "#" },
      { labelKey: 'home.footer.col3.link4', href: "#" }
    ]
  };

  const handleLinkClick = (href: string) => {
    if (href.startsWith("#")) {
      const element = document.querySelector(href);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
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
              <EditableText 
                contentKey="home.footer.logo_name" 
                as="span"
                className="text-lg font-bold text-foreground"
              />
            </Link>
            <EditableText 
              contentKey="home.footer.description" 
              as="p"
              className="text-sm text-muted-foreground mb-6"
              multiline
            />
            <EditableSocialLinks />
          </div>

          {/* Produto column */}
          <div>
            <EditableText 
              contentKey="home.footer.col1.title" 
              as="h4"
              className="font-semibold text-foreground mb-4"
            />
            <ul className="space-y-3">
              {footerLinks.produto.map((link, index) => (
                <li key={index}>
                  {link.href.startsWith("#") ? (
                    <button
                      onClick={() => handleLinkClick(link.href)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <EditableText contentKey={link.labelKey} as="span" />
                    </button>
                  ) : (
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <EditableText contentKey={link.labelKey} as="span" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Suporte column */}
          <div>
            <EditableText 
              contentKey="home.footer.col2.title" 
              as="h4"
              className="font-semibold text-foreground mb-4"
            />
            <ul className="space-y-3">
              {footerLinks.suporte.map((link, index) => (
                <li key={index}>
                  {link.href.startsWith("#") ? (
                    <button
                      onClick={() => handleLinkClick(link.href)}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <EditableText contentKey={link.labelKey} as="span" />
                    </button>
                  ) : (
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <EditableText contentKey={link.labelKey} as="span" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <EditableText 
              contentKey="home.footer.col3.title" 
              as="h4"
              className="font-semibold text-foreground mb-4"
            />
            <ul className="space-y-3">
              {footerLinks.legal.map((link, index) => (
                <li key={index}>
                  <Link
                    to={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <EditableText contentKey={link.labelKey} as="span" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-border text-center">
          <EditableText 
            contentKey="home.footer.copyright" 
            as="p"
            className="text-sm text-muted-foreground"
          />
        </div>
      </div>
    </footer>
  );
}
