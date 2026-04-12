import { redirect } from "next/navigation";

/** Guests land on browse; signup is linked from login and marketing paths. */
export default function Home() {
  redirect("/feed");
}
