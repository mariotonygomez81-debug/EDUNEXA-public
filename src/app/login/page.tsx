import { Suspense } from "react";
import LoginForm from "@/components/auth/login-form";
export default function LoginPage() { return <Suspense fallback={<main className="simple-auth"><div className="simple-auth-card">Preparando el acceso seguro...</div></main>}><LoginForm /></Suspense>; }
