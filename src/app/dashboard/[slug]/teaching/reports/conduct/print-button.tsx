"use client";
import { Printer } from "lucide-react";
export default function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 print:hidden"><Printer size={16}/> Imprimir / guardar PDF</button>;
}
