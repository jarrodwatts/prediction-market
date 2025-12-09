import { SparklesText } from "@/components/ui/sparkles-text";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Shield, Globe } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Fast Settlement",
    description: "Markets resolve quickly with on-chain verification and automated payouts.",
  },
  {
    icon: Shield,
    title: "Trustless",
    description: "No intermediaries. Smart contracts handle all market logic and funds.",
  },
  {
    icon: Globe,
    title: "Permissionless",
    description: "Anyone can create markets, provide liquidity, or place predictions.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-16">
      <div className="max-w-5xl mx-auto text-center space-y-8">
        {/* Headline */}
        <h1 className="text-black dark:text-white relative mx-auto max-w-[43.5rem] pt-5 md:px-4 md:py-2 text-center font-semibold tracking-tighter text-balance text-5xl sm:text-7xl lg:text-7xl">
          Predict the{" "}
          <SparklesText
            className="inline text-5xl sm:text-7xl lg:text-7xl font-semibold"
            sparklesCount={3}
          >
            future
          </SparklesText>
        </h1>

        {/* Description */}
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          An open source prediction market platform. Create markets, trade outcomes, and earn rewards.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Button size="lg" className="gap-2">
            Explore Markets
            <ArrowRight className="size-4" />
          </Button>
          <Button size="lg" variant="outline">
            Create a Market
          </Button>
        </div>

        {/* Features Section */}
        <div className="pt-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="flex flex-col items-center text-center p-6 rounded-2xl border border-border bg-background/50 backdrop-blur-sm"
              >
                <div className="p-3 rounded-xl bg-primary/10 mb-4">
                  <feature.icon className="size-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
