// Not part of the MVP (no real data behind it). The route redirects instead of showing sample content.
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/dashboard");
}
