import { redirect } from "next/navigation";

/** Landing page for first-time users. */
export default function Home() {
  redirect("/signup");
}
