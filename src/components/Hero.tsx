import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowRight, BarChart3, PieChart, LineChart } from "lucide-react";
import heroImage from "@/assets/hero-bi.jpg";
const Hero = () => {
  return <section className="min-h-screen flex items-center justify-center bg-gradient-hero pt-20">
      <div className="container mx-auto px-4 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-8 animate-fade-in">
            <div className="space-y-4">
              <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
                <TrendingUp className="h-4 w-4" />
                <span>TECHNOLOGY • DATA ANALYTICS</span>
              </div>
              
              <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
                <span className="bg-gradient-tech bg-clip-text text-transparent">
                  Business Intelligence
                </span>
                <br />
                que impulsa tu negocio
              </h1>
              
              <p className="text-xl text-muted-foreground max-w-lg">
                Convierte tus datos en insights accionables con nuestras soluciones 
                avanzadas de BI. Toma decisiones informadas y acelera el crecimiento 
                de tu empresa.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="gradient" size="lg" className="group">
                Empezar Ahora
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button variant="outline" size="lg">
                Ver Demo
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 pt-8 border-t border-border">
              <div>
                <div className="text-2xl font-bold text-primary">99%</div>
                <div className="text-sm text-muted-foreground">Precisión</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">24/7</div>
                <div className="text-sm text-muted-foreground">Monitoreo</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">150+</div>
                <div className="text-sm text-muted-foreground">Clientes</div>
              </div>
            </div>
          </div>

          {/* Visual */}
          <div className="relative">
            {/* Background decorative elements */}
            <div className="absolute inset-0 bg-gradient-tech opacity-10 rounded-3xl blur-3xl"></div>
            
            {/* Main image */}
            <div className="relative z-10 rounded-2xl overflow-hidden shadow-2xl">
              
            </div>

            {/* Static metrics panel */}
            <div className="absolute top-4 right-4 bg-card/95 backdrop-blur-md border border-border rounded-xl p-4 shadow-lg">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Revenue Growth</div>
                    <div className="text-lg font-bold text-primary">+24%</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-secondary-tech/10 rounded-lg">
                    <BarChart3 className="h-4 w-4 text-secondary-tech" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Market Share</div>
                    <div className="text-lg font-bold text-secondary-tech">68%</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-accent/10 rounded-lg">
                    <LineChart className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Efficiency</div>
                    <div className="text-lg font-bold text-accent">95%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>;
};
export default Hero;