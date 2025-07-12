import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart3, Mail, Phone, MapPin, Linkedin, Twitter, Facebook } from "lucide-react";

const Footer = () => {
  const footerSections = [
    {
      title: "Servicios",
      links: [
        "Análisis de Datos",
        "Data Warehousing", 
        "Dashboards Ejecutivos",
        "Consultoría BI",
        "Capacitación"
      ]
    },
    {
      title: "Recursos",
      links: [
        "Blog",
        "Casos de Estudio",
        "Whitepapers",
        "Webinars",
        "Centro de Ayuda"
      ]
    },
    {
      title: "Empresa",
      links: [
        "Acerca de Nosotros",
        "Equipo",
        "Carreras",
        "Contacto",
        "Privacidad"
      ]
    }
  ];

  return (
    <footer id="contacto" className="bg-background border-t border-border">
      {/* CTA Section */}
      <div className="bg-gradient-primary py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            ¿Listo para transformar tus datos?
          </h2>
          <p className="text-xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
            Agenda una consulta gratuita y descubre cómo nuestras soluciones 
            pueden impulsar el crecimiento de tu empresa.
          </p>
          <Button variant="secondary" size="lg" className="bg-white text-primary hover:bg-white/90">
            Consulta Gratuita
          </Button>
        </div>
      </div>

      {/* Main Footer */}
      <div className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-8">
            {/* Company Info */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-gradient-primary rounded-lg">
                  <BarChart3 className="h-6 w-6 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold text-foreground">DataInsights</span>
              </div>
              
              <p className="text-muted-foreground max-w-md">
                Transformamos datos en decisiones inteligentes. Somos especialistas 
                en Business Intelligence con más de 10 años de experiencia ayudando 
                a empresas a maximizar el valor de sus datos.
              </p>

              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Mail className="h-5 w-5 text-primary" />
                  <span className="text-muted-foreground">contacto@datainsights.com</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Phone className="h-5 w-5 text-primary" />
                  <span className="text-muted-foreground">+1 (555) 123-4567</span>
                </div>
                <div className="flex items-center space-x-3">
                  <MapPin className="h-5 w-5 text-primary" />
                  <span className="text-muted-foreground">123 Business Ave, Suite 100</span>
                </div>
              </div>

              <div className="flex space-x-4">
                <Button variant="outline" size="icon">
                  <Linkedin className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Twitter className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Facebook className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Footer Sections */}
            {footerSections.map((section, index) => (
              <div key={index}>
                <h3 className="font-semibold text-foreground mb-4">{section.title}</h3>
                <ul className="space-y-3">
                  {section.links.map((link, linkIndex) => (
                    <li key={linkIndex}>
                      <a 
                        href="#" 
                        className="text-muted-foreground hover:text-primary transition-colors duration-300"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Newsletter */}
          <div className="mt-12 pt-8 border-t border-border">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  Mantente actualizado
                </h3>
                <p className="text-muted-foreground">
                  Recibe las últimas tendencias en Business Intelligence y análisis de datos.
                </p>
              </div>
              <div className="flex space-x-3">
                <Input 
                  placeholder="Tu email" 
                  className="flex-1"
                />
                <Button variant="default">
                  Suscribirse
                </Button>
              </div>
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-8 pt-8 border-t border-border text-center">
            <p className="text-muted-foreground">
              © 2024 DataInsights. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;