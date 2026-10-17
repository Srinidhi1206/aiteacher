// Where the public landing page sends visitors. One definition, so the navbar, the hero and the pricing buttons cannot drift apart - and so a test can
// prove that none of them goes through the old student "State / Board / Class / Subjects" questionnaire before authentication.
//
//   Get Started / Start Learning Free / the pricing buttons  -> /register  (create an account; Student, Teacher and Admin-request are all offered there,
//                                                                            and it links to Sign in for people who already have an account)
//   Sign in                                                   -> /login     (choose Student, Teacher or Admin, then sign in; it links to Register)
//
// A student's State, Board and Class are asked ONCE, in the student registration form (/register/student), where they are saved with the account.
// Teachers and administrators are never asked for them.
export const GET_STARTED_HREF = "/register";
export const SIGN_IN_HREF = "/login";
