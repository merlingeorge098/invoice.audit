import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const steps = [
  "Reading files...",
  "Checking details...",
  "Verifying records...",
  "Generating results...",
];

export default function ProcessingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(interval);
          setTimeout(() => navigate("/dashboard"), 800);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8">
        {/* Animated loader */}
        <div className="relative">
          <div className="h-20 w-20 rounded-full gradient-primary animate-spin" style={{ animationDuration: "3s" }}>
            <div className="absolute inset-1 rounded-full bg-background" />
          </div>
          <Loader2 className="absolute inset-0 m-auto h-8 w-8 text-primary animate-spin" />
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Processing Your Invoices</h2>
          <p className="mt-2 text-muted-foreground">Please wait while we verify your documents</p>
        </div>

        {/* Steps */}
        <div className="w-64 space-y-3">
          {steps.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
                  i <= currentStep ? "gradient-primary scale-100" : "bg-muted scale-75"
                }`}
              />
              <span
                className={`text-sm transition-colors duration-300 ${
                  i <= currentStep ? "text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                {step}
              </span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full gradient-primary transition-all duration-700 ease-out"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
