import type { Metadata } from "next";
import "./globals.css";
import IdleSessionGuard from "@/components/auth/idle-session-guard";
export const metadata: Metadata = { title: "EDUNEXA | Plataforma Integral Educativa", description: "EDUNEXA conecta la gestión académica, la enseñanza y la comunidad educativa en un solo lugar." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR"><body><IdleSessionGuard />{children}</body></html>;
}
