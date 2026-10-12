"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

type Mode = "login" | "register";

/**
 * Presentational auth form. Phase 1 has no authentication backend:
 * submissions are validated locally and never sent or stored anywhere.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(false);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (mode === "register") {
      if (!name.trim()) return setError("Enter your name.");
      if (password !== confirm) return setError("Passwords do not match.");
      if (!ageConfirmed) return setError("You must confirm you are 18 or over.");
    }
    setError(null);
    setSubmitted(true);
    setPassword("");
    setConfirm("");
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {mode === "register" ? (
        <Field label="Name" htmlFor="name">
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        </Field>
      ) : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9"
        />
      </Field>
      {mode === "register" ? (
        <>
          <Field label="Confirm password" htmlFor="confirm">
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-9" />
          </Field>
          <label className="flex items-start gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />I
            confirm I am 18 or over and accept the terms of use.
          </label>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-neg/30 bg-neg-soft px-3 py-2 text-xs text-neg">
          {error}
        </p>
      ) : null}

      {submitted ? (
        <p role="status" className="flex items-start gap-2 rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-xs text-ink-2">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />
          Accounts are not available in the Phase 1 preview. Nothing was sent or stored. You can keep exploring every page without signing in.
        </p>
      ) : null}

      <Button type="submit" variant="primary" className="h-9 w-full">
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>

      <p className="text-center text-xs text-ink-3">
        {mode === "login" ? (
          <>
            New to BettingValue?{" "}
            <Link href="/register" className="text-accent hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
