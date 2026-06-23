import { SignedOut, SignInButton, SignedIn, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import React from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

const Navbar = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-background/60 backdrop-blur-md">
      <div className="flex justify-between items-center p-4 gap-4 h-16 max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2 group">
          <ShieldCheck className="w-8 h-8 text-primary transition-transform group-hover:scale-110" />
          <span className="text-xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            AI SECURITY LINTER
          </span>
        </Link>
        <nav className="hidden md:flex gap-8 items-center text-sm font-medium text-muted-foreground">
          <Link href="/" className="hover:text-primary transition-colors">Home</Link>
          <Link href="/subscription" className="hover:text-primary transition-colors">Pricing</Link>
        </nav>
        <div className="flex gap-4 items-center">
          <SignedOut>
            <SignInButton>
              <Button variant="outline" className="rounded-full px-6">
                Sign In
              </Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton appearance={{ elements: { userButtonAvatarBox: "w-9 h-9" } }} />
          </SignedIn>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
