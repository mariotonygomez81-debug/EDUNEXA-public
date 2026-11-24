import { notFound } from "next/navigation";
import TutorDemo from "./tutor-demo";

export const dynamic = "force-dynamic";

export default function TutorDemoPage() {
  // This route must never expose demo data in a deployed environment.
  if (process.env.NODE_ENV !== "development") notFound();

  return <TutorDemo />;
}
