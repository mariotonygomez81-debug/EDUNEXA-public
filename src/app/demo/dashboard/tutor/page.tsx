import Link from "next/link";
import { notFound } from "next/navigation";
import TutorDemo from "../../tutor/tutor-demo";

export const dynamic = "force-dynamic";

export default function TutorModuleDemoPage() {
  const previewEnabled = process.env.EDUNEXA_TUTOR_PREVIEW_ENABLED === "true";
  if (process.env.NODE_ENV !== "development" && !previewEnabled) notFound();

  return (
    <>
      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/demo/dashboard" className="text-sm font-semibold text-violet-700 hover:text-violet-900">
            ← Volver a los módulos de EDUNEXA
          </Link>
        </div>
      </div>
      <TutorDemo />
    </>
  );
}
