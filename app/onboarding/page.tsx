import { redirect } from "next/navigation";
import { GET_STARTED_HREF } from "@/lib/marketing/auth-links";

// The old public "State -> Board -> Class -> Subjects -> Build my learning path" questionnaire used to live here. It saved nothing (it never created an
// account or a plan) and made every visitor answer academic questions before they could even see the sign-in screen. A student's State, Board and Class are
// now asked once, in the student registration form (/register/student), where they are saved with the account; teachers and administrators are never
// asked for them. This route stays only so old links and bookmarks keep working: it sends the visitor straight to the authentication entry point.
export default function OnboardingPage() {
  redirect(GET_STARTED_HREF);
}
