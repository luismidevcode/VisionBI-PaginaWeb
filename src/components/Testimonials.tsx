import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, Quote } from "lucide-react";

const Testimonials = () => {
  const testimonials = [
    {
      name: "María González",
      position: "CEO",
      company: "TechCorp",
      avatar: "/placeholder.svg",
      rating: 5,
      quote: "DataInsights transformó completamente nuestra toma de decisiones. Ahora tenemos visibilidad total de nuestro negocio y hemos incrementado nuestra rentabilidad en un 40%.",
      results: "40% incremento en rentabilidad"
    },
    {
      name: "Carlos Rodríguez",
      position: "Director de Operaciones",
      company: "RetailMax",
      avatar: "/placeholder.svg",
      rating: 5,
      quote: "La implementación fue más rápida de lo esperado y el equipo de soporte es excepcional. Los dashboards nos permiten detectar problemas antes de que impacten el negocio.",
      results: "60% reducción en tiempo de análisis"
    },
    {
      name: "Ana Martínez",
      position: "CFO",
      company: "FinanceGroup",
      avatar: "/placeholder.svg",
      rating: 5,
      quote: "Los reportes automatizados nos ahorran 20 horas semanales. La precisión de los análisis nos ha permitido optimizar nuestros presupuestos y mejorar la planificación financiera.",
      results: "20 horas ahorradas por semana"
    }
  ];

  const metrics = [
    { value: "150+", label: "Clientes Satisfechos" },
    { value: "99%", label: "Satisfacción Cliente" },
    { value: "300%", label: "ROI Promedio" },
    { value: "24/7", label: "Soporte Técnico" }
  ];

  return (
    <section id="testimonios" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="inline-flex items-center space-x-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Star className="h-4 w-4" />
            <span>Casos de Éxito</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Lo que dicen nuestros
            <span className="bg-gradient-tech bg-clip-text text-transparent"> clientes</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Empresas de todos los tamaños confían en nuestras soluciones para impulsar 
            su crecimiento y optimizar sus operaciones.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="group hover:shadow-xl transition-all duration-300 border-border bg-card">
              <CardHeader>
                <div className="flex items-center space-x-4">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={testimonial.avatar} alt={testimonial.name} />
                    <AvatarFallback className="bg-gradient-primary text-primary-foreground">
                      {testimonial.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold text-foreground">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {testimonial.position} en {testimonial.company}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 mt-2">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                  ))}
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="relative">
                  <Quote className="h-8 w-8 text-primary/20 absolute -top-2 -left-2" />
                  <p className="text-muted-foreground mb-4 pl-6">
                    {testimonial.quote}
                  </p>
                </div>
                
                <div className="bg-primary/10 text-primary px-3 py-2 rounded-lg text-sm font-medium text-center">
                  {testimonial.results}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Metrics */}
        <div className="bg-gradient-tech rounded-3xl p-8 md:p-12 text-center">
          <h3 className="text-2xl md:text-3xl font-bold text-secondary-tech-foreground mb-8">
            Resultados que hablan por sí solos
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {metrics.map((metric, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-secondary-tech-foreground mb-2">
                  {metric.value}
                </div>
                <div className="text-secondary-tech-foreground/80 text-sm">
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;