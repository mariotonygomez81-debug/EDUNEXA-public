import { notFound } from "next/navigation";
import LocalDemoWorkspace from "./workspace";

export const dynamic = "force-dynamic";

export default function LocalDemoWorkspacePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <LocalDemoWorkspace />;
}
