import { redirect } from "next/navigation";

export default function LegacyPlatformRoute() {
  redirect("/dashboard/platform");
}
