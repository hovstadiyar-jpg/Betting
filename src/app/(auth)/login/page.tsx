import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/AuthForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mb-6 mt-1 text-[13px] text-ink-3">Welcome back. Accounts arrive in a later phase; this form is a preview.</p>
      <AuthForm mode="login" />
    </>
  );
}
