import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "EDUNEXA | Plataforma Integral Educativa", description: "EDUNEXA conecta la gestión académica, la enseñanza y la comunidad educativa en un solo lugar." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR"><body>{children}</body></html>;
}
