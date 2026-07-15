import { redirect } from "next/navigation";

// Self-registration is disabled; accounts come from admin import.
export default function RegisterPage() {
  redirect("/login");
}
