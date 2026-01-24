import { Link } from "react-router-dom";
import { BarChart3, Twitter, Linkedin, Instagram, Youtube } from "lucide-react";
import { useSiteContentContext } from "@/contexts/SiteContentContext";

const socialLinks = [
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Instagram, href: "#", label: "Instagram" },
  { icon: Youtube, href: "#", label: "YouTube" }
];

export function LandingFooter() {
  const { getText } = useSiteContentContext();

  const footerLinks = {
    produto: [
      { label: getText('home.footer.col1.link1'), href: "#recursos" },
      { label: getText('home.footer.col1.link2'), href: "#planos" },
      { label: getText('home.footer.col1.link3'), href: "#integracoes" },
      { label: getText('home.footer.col1.link4'), href: "/blog" }
    ],
    suporte: [
      { label: getText('home.footer.col2.link1'), href: "#faq" },
      { label: getText('home.footer.col2.link2'), href: "#" },
      { label: getText('home.footer.col2.link3'), href: "#" },
      { label: getText('home.footer.col2.link4'), href: "#faq" }
    ],
    legal: [
      { label: getText('home.footer.col3.link1'), href: "#" },
      { label: getText('home.footer.col3.link2'), href: "#" },
      { label: getText('home.footer.col3.link3'), href: "#" },
      { label: getText('home.footer.col3.link4'), href: "#" }
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

  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-foreground">
                {getText('home.footer.logo_name')}
              </span>
            </Link>
            <p className="text-sm text-muted-foreground mb-6">
              {getText('home.footer.description')}
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social, index) => (
                <a
                  key={index}
                  href={social.href}
                  aria-label={social.label}
                  className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <social.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Produto column */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">
              {getText('home.footer.col1.title')}
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
              {getText('home.footer.col2.title')}
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
              {getText('home.footer.col3.title')}
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
            {getText('home.footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}
