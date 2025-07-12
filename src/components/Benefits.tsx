import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Target, 
  Clock, 
  DollarSign, 
  Shield, 
  Users, 
  Lightbulb,
  CheckCircle
} from "lucide-react";

const Benefits = () => {
  const benefits = [
    {
      icon: Target,
      title: "Decisiones Precisas",
      description: "Toma decisiones basadas en datos reales, no en intuiciones.",
      stats: "95% de precisión en predicciones"
    },
    {
      icon: Clock,
      title: "Ahorro de Tiempo",
      description: "Automatiza reportes y análisis para enfocarte en estrategia.",
      stats: "80% menos tiempo en reportes"
    },
    {
      icon: DollarSign,
      title: "ROI Comprobado",
      description: "Incrementa ingresos identificando oportunidades ocultas.",
      stats: "Promedio 300% ROI en 12 meses"
    },
    {
      icon: Shield,
      title: "Datos Seguros",
      description: "Protección empresarial con estándares de seguridad avanzados.",
      stats: "99.9% de disponibilidad"
    },
    {
      icon: Users,
      title: "Colaboración Mejorada",
      description: "Unifica equipos con acceso a información consistente.",
      stats: "100% de equipos sincronizados"
    },
    {
      icon: Lightbulb,
      title: "Insights Accionables",
      description: "Descubre patrones y tendencias que impulsan crecimiento.",
      stats: "Detecta 95% de oportunidades"
    }
  ];

  const whyChooseUs = [
    "Más de 10 años de experiencia en BI",
    "Equipo certificado en las principales plataformas",
    "Soporte 24/7 con tiempo de respuesta < 2 horas",
    "Metodología probada en 150+ proyectos exitosos",
    "Integración con más de 200 fuentes de datos",
    "Cumplimiento con estándares internacionales"
  ];

  return (
    <section id="beneficios" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Benefits Grid */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 bg-secondary-tech/10 text-secondary-tech px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Target className="h-4 w-4" />
            <span>¿Por Qué Elegirnos?</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Beneficios que 
            <span className="bg-gradient-tech bg-clip-text text-transparent"> Transforman</span> tu Negocio
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Nuestras soluciones de Business Intelligence entregan resultados medibles 
            que impactan directamente en el crecimiento y rentabilidad de tu empresa.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {benefits.map((benefit, index) => (
            <Card 
              key={index} 
              className="group hover:shadow-lg transition-all duration-300 border-border hover:border-secondary-tech/20 bg-card"
            >
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-gradient-tech rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                  <benefit.icon className="h-8 w-8 text-secondary-tech-foreground" />
                </div>
                <CardTitle className="text-xl font-bold text-foreground">
                  {benefit.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground mb-4">
                  {benefit.description}
                </p>
                <div className="text-sm font-semibold text-secondary-tech bg-secondary-tech/10 rounded-full px-3 py-1 inline-block">
                  {benefit.stats}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Why Choose Us */}
        <div className="bg-gradient-hero rounded-3xl p-8 md:p-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
                La experiencia que necesitas para
                <span className="bg-gradient-primary bg-clip-text text-transparent"> triunfar</span>
              </h3>
              <p className="text-muted-foreground mb-8">
                No solo implementamos tecnología, construimos soluciones que se adaptan 
                a tus procesos y crecen con tu negocio. Nuestro enfoque integral garantiza 
                el éxito a largo plazo.
              </p>
              
              <div className="grid gap-4">
                {whyChooseUs.map((item, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
                <div className="text-center mb-6">
                  <div className="text-4xl font-bold text-primary mb-2">150+</div>
                  <div className="text-muted-foreground">Proyectos Exitosos</div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Satisfacción del Cliente</span>
                    <span className="font-semibold text-primary">98%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className="bg-gradient-primary h-2 rounded-full" style={{ width: '98%' }}></div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Tiempo de Implementación</span>
                    <span className="font-semibold text-secondary-tech">4-8 semanas</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className="bg-gradient-tech h-2 rounded-full" style={{ width: '85%' }}></div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">ROI Promedio</span>
                    <span className="font-semibold text-accent">300%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className="bg-accent h-2 rounded-full" style={{ width: '95%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Benefits;