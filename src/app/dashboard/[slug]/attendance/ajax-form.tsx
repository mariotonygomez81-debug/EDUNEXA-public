"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { AttendanceActionResult } from "./actions";

export default function AttendanceAjaxForm({
  action,
  children,
  className,
  submitLabel = "Guardar",
}: {
  action: (data: FormData) => Promise<AttendanceActionResult>;
  children: ReactNode;
  className?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<AttendanceActionResult | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action(data);
        setNotice(result);
        if (result.ok) router.refresh();
      } catch {
        setNotice({ ok: false, message: "No se pudo confirmar la operación. Revisá tu conexión e intentá nuevamente." });
      }
    });
  }

  return (
    <form onSubmit={submit} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      {notice ? (
        <p role={notice.ok ? "status" : "alert"} aria-live="polite" className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {notice.message}
        </p>
      ) : null}
      {pending ? (
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700">
          <LoaderCircle size={14} className="animate-spin" /> Procesando sin recargar la página…
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">{pending ? `${submitLabel}: procesando` : ""}</span>
    </form>
  );
}
