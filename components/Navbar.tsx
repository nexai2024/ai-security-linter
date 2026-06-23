import { SignedOut, SignInButton, SignedIn, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import React from "react";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";

const Navbar = () => {
  return (
    <header className="flex justify-between items-center p-4 gap-4 h-16 max-w-7xl mx-auto border-b border-zinc-900">
      <Link href="/" className="text-xl font-extrabold flex items-center gap-2 hover:opacity-90 transition">
        <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Shield className="h-4.5 w-4.5 text-white" />
        </div>
        <span className="bg-gradient-to-r from-zinc-100 to-zinc-300 bg-clip-text text-transparent">
          Vibe-Check
        </span>
      </Link>
      <div className="flex gap-6 items-center text-sm font-medium text-zinc-400">
        <Link href="/dashboard" className="hover:text-zinc-200 transition">Dashboard</Link>
        <Link href="/subscription" className="hover:text-zinc-200 transition">Subscriptions</Link>
        <SignedOut>
          <SignInButton mode="modal">
            <Button size="sm" className="bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-medium">
              Sign In
            </Button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </div>
    </header>
  );
};

export default Navbar;
