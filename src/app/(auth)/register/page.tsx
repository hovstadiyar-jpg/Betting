import type { Metadata } from "next";
import { AuthForm } from "@/features/auth/AuthForm";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Create your account</h1>
      <p className="mb-6 mt-1 text-[13px] text-ink-3">Accounts arrive in a later phase; this form is a preview and stores nothing.</p>
      <AuthForm mode="register" />
    </>
  );
}
