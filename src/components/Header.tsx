import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import visionbiLogo from "@/assets/logo-vision-BI--sin-fondo.png";

interface HeaderProps {
  onOpenBooking: (type?: string) => void;
}

const menuItems = [
  { label: "Servicios",     href: "#servicios",   id: "servicios"   },
  { label: "Beneficios",    href: "#beneficios",  id: "beneficios"  },
  { label: "Casos de Éxito", href: "#testimonios", id: "testimonios" },
  { label: "Contacto",      href: "#contacto",    id: "contacto"    },
];

const Header = ({ onOpenBooking }: HeaderProps) => {
  const navigate = useNavigate();
  const [isMenuOpen,    setIsMenuOpen]    = useState(false);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    menuItems.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(id); },
        { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const handleNavClick = (href: string) => {
    setIsMenuOpen(false);
    const el = document.getElementById(href.replace("#", ""));
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-primary/20 to-secondary/20 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center space-x-3">
            <img src={visionbiLogo} alt="VisionBI Logo" className="h-13 w-auto max-w-[55px]" />
          </div>

          {/* Navegación escritorio */}
          <nav className="hidden md:flex items-center space-x-8">
            {menuItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => { e.preventDefault(); handleNavClick(item.href); }}
                className={`transition-colors duration-300 font-medium ${
                  activeSection === item.id ? "text-primary" : "text-foreground hover:text-primary"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* CTA escritorio */}
          <div className="hidden md:flex items-center gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate("/portal")}
              className="border-[#1a3461] text-[#1a3461] hover:bg-[#1a3461] hover:text-white"
            >
              Portal Clientes
            </Button>
            <Button variant="gradient" size="lg" onClick={() => onOpenBooking("Diagnóstico Gratis")}>
              Diagnóstico Gratis
            </Button>
          </div>

          {/* Botón menú móvil */}
          <button className="md:hidden p-2" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen
              ? <X    className="h-6 w-6 text-foreground" />
              : <Menu className="h-6 w-6 text-foreground" />}
          </button>
        </div>

        {/* Menú móvil */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-border pt-4">
            <nav className="flex flex-col space-y-4">
              {menuItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={(e) => { e.preventDefault(); handleNavClick(item.href); }}
                  className={`transition-colors duration-300 font-medium ${
                    activeSection === item.id ? "text-primary" : "text-foreground hover:text-primary"
                  }`}
                >
                  {item.label}
                </a>
              ))}
              <Button
                variant="outline"
                size="lg"
                className="border-[#1a3461] text-[#1a3461] hover:bg-[#1a3461] hover:text-white"
                onClick={() => { setIsMenuOpen(false); navigate("/portal"); }}
              >
                Portal Clientes
              </Button>
              <Button
                variant="gradient"
                size="lg"
                className="mt-2"
                onClick={() => { setIsMenuOpen(false); onOpenBooking("Diagnóstico Gratis"); }}
              >
                Diagnóstico Gratis
              </Button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
