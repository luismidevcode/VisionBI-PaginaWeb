import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  Database,
  TrendingUp,
  PieChart,
  Activity,
  Zap,
  ArrowRight,
} from "lucide-react";

interface ServicesProps {
  onOpenBooking: (type?: string) => void;
}

const Services = ({ onOpenBooking }: ServicesProps) => {
  const services = [
    {
      icon: BarChart3,
      title: "Análisis de Datos",
      description: "Transformamos datos complejos en insights claros y accionables para tu negocio.",
      features: ["Reportes interactivos", "Visualizaciones avanzadas", "Análisis predictivo"],
    },
    {
      icon: Database,
      title: "Data Warehousing",
      description: "Centralizamos y organizamos todos tus datos en una sola fuente de verdad.",
      features: ["Integración de fuentes", "Limpieza de datos", "Optimización de consultas"],
    },
    {
      icon: TrendingUp,
      title: "Dashboards Ejecutivos",
      description: "Paneles de control personalizados para monitorear KPIs críticos en tiempo real.",
      features: ["KPIs personalizados", "Alertas automáticas", "Acceso móvil"],
    },
    {
      icon: PieChart,
      title: "Segmentación Avanzada",
      description: "Analiza comportamientos y patrones para identificar oportunidades de negocio.",
      features: ["Análisis de cohortes", "Segmentación de clientes", "Predicción de churn"],
    },
    {
      icon: Activity,
      title: "Monitoreo en Tiempo Real",
      description: "Supervisa métricas críticas con alertas instantáneas y notificaciones.",
      features: ["Alertas inteligentes", "Monitoreo 24/7", "Respuesta automática"],
    },
    {
      icon: Zap,
      title: "Automatización de Reportes",
      description: "Genera y distribuye reportes automáticamente según tu programación.",
      features: ["Reportes programados", "Distribución automática", "Formatos múltiples"],
    },
  ];

  return (
    <section id="servicios" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
            <BarChart3 className="h-4 w-4" />
            <span>Nuestros Servicios</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Soluciones Completas de{" "}
            <span className="bg-gradient-tech bg-clip-text text-transparent">Business Intelligence</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Ofrecemos un conjunto completo de servicios diseñados para transformar
            la forma en que tu empresa utiliza los datos para tomar decisiones estratégicas.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <Card
              key={index}
              className="group hover:shadow-xl transition-all duration-300 border-border hover:border-primary/20 bg-card"
            >
              <CardHeader>
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <service.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <CardTitle className="text-xl font-bold text-foreground">{service.title}</CardTitle>
                <CardDescription className="text-muted-foreground">{service.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {service.features.map((feature, i) => (
                    <li key={i} className="flex items-center text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mr-3" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  variant="outline"
                  className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                  onClick={() => onOpenBooking("Consultoría")}
                >
                  Saber Más
                  <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-16">
          <Button variant="gradient" size="lg" onClick={() => onOpenBooking("Diagnóstico Gratis")}>
            Consulta Personalizada Gratis
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Services;
