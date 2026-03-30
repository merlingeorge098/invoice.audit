import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppLayout";
import { Upload, ShieldCheck, AlertTriangle, FileDown, Lock, Target, CheckCircle } from "lucide-react";

const features = [
  { icon: Upload, title: "Easy Upload", description: "Drag & drop your invoices or Excel files for instant processing." },
  { icon: ShieldCheck, title: "Data Verification", description: "Cross-check invoice details against your records automatically." },
  { icon: AlertTriangle, title: "Error Detection", description: "Identify discrepancies, missing fields, and GSTIN mismatches." },
  { icon: FileDown, title: "Download Reports", description: "Export comprehensive verification reports in Excel format." },
];

const trustItems = [
  { icon: Lock, title: "Secure Processing", description: "Your data is encrypted and processed securely." },
  { icon: Target, title: "Accurate Results", description: "99.9% accuracy in invoice verification." },
  { icon: CheckCircle, title: "Trusted by 500+ Businesses", description: "Relied upon by companies across industries." },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-subtle opacity-60" />
        <div className="container relative py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="animate-fade-in-up text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Smarter Invoice Verification for{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Businesses
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
              Check, verify, and manage your invoices with ease. Detect errors before they cost you money.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
              <Button asChild variant="hero" size="lg">
                <Link to="/upload">Get Started</Link>
              </Button>
              <Button asChild variant="hero-outline" size="lg">
                <Link to="/dashboard">View Demo</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-20">
        <h2 className="text-center text-3xl font-bold text-foreground">How It Works</h2>
        <p className="mt-3 text-center text-muted-foreground">Four simple steps to verified invoices</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-6 shadow-card transition-all duration-300 hover:shadow-elevated hover:-translate-y-1"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-card-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="gradient-subtle">
        <div className="container py-20">
          <h2 className="text-center text-3xl font-bold text-foreground">Why Trust Us</h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {trustItems.map((t) => (
              <div key={t.title} className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-primary">
                  <t.icon className="h-7 w-7 text-primary-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{t.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="container flex flex-col items-center gap-4 py-10 md:flex-row md:justify-between">
          <p className="text-sm text-muted-foreground">© 2026 Invoice Auditor. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
