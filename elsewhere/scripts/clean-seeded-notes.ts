import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const USER_ID = "d9dd2d19-a7d9-49bb-82f0-0ba2f4fd80df";

const UPDATES: { place_name: string; notes: string }[] = [
  { place_name: "Fairfax Coffee", notes: "Quiet, lots of chargers, big comfortable space. One of the best work spots in NoVA." },
  { place_name: "Foundation Coffee", notes: "Already set up as a study cafe with lots of seats and chargers. Gets busy and loud in the afternoon so go early. Open until 9PM." },
  { place_name: "Maman", notes: "Grab and go only. Super busy, loud, and small. Not a work spot." },
  { place_name: "Bakery Museum", notes: "Loud music, cramped, and always busy. Better for hanging out than working." },
  { place_name: "Simply Social", notes: "Pretty small and cramped. Not great for getting work done." },
  { place_name: "Compass Coffee", notes: "Nice well-lit space with wall to wall windows. Decent outlets. Good atmosphere for working." },
  { place_name: "Gathering Grounds", notes: "Used to be a great study spot during GMU undergrad days but has gone downhill since new management took over. Not as cozy and louder now." },
  { place_name: "29th Parallel", notes: "Small and limited seating but pretty quiet. Good for focused work." },
  { place_name: "De Clieu", notes: "Gets super busy, closes early, and feels overstimulating and messy. Not a work spot." },
  { place_name: "Common Culture", notes: "Nice big space with lots of seating. Worth trying for a work session." },
  { place_name: "Peet's", notes: "Decent size and seating. Loud music makes it tough for virtual meetings." },
  { place_name: "Senberry", notes: "More of a hangout spot than a work cafe. Loud and busy." },
  { place_name: "Cafein", notes: "Decent size and seating. Gets busy fast." },
  { place_name: "Cafe V", notes: "Decent space but gets loud. On the expensive side." },
  { place_name: "Chateau de Chantilly", notes: "Gets busy and overstimulating. More of a hangout spot than a work cafe." },
  { place_name: "Tous les Jours", notes: "Nice big space with lots of seating. Gets pretty busy but has enough ambient noise that it works for video calls too." },
  { place_name: "Rare Bird", notes: "Small, cramped, and always packed with a long line. Not a work spot." },
  { place_name: "Godfrey's", notes: "More of a hangout space than a work cafe. Gets busy." },
  { place_name: "Goosecup", notes: "Nice space with decent seating and lighting. Only visited during busy times so hard to fully judge." },
  { place_name: "Frame", notes: "Small and cramped, hard to get work done here." },
  { place_name: "Caffe Amouri", notes: "Lots of seating, seems nicest early in the day. One of the only local cafes that roasts their own beans." },
];

async function main() {
  const updated: string[] = [];
  const notFound: string[] = [];

  for (const { place_name, notes } of UPDATES) {
    const { data: places, error: placeErr } = await supabase
      .from("places")
      .select("id")
      .ilike("name", `%${place_name}%`);

    if (placeErr || !places || places.length === 0) {
      notFound.push(place_name);
      continue;
    }

    const placeIds = places.map((p) => p.id);

    const { data: rating, error: ratingErr } = await supabase
      .from("ratings")
      .select("id")
      .eq("user_id", USER_ID)
      .in("place_id", placeIds)
      .maybeSingle();

    if (ratingErr || !rating) {
      notFound.push(place_name);
      continue;
    }

    const { error: updateErr } = await supabase
      .from("ratings")
      .update({ notes })
      .eq("id", rating.id);

    if (updateErr) {
      console.error(`Error updating "${place_name}":`, updateErr.message);
      notFound.push(place_name);
      continue;
    }

    console.log(`Updated: "${place_name}"`);
    updated.push(place_name);
  }

  console.log("\n=== Summary ===");
  console.log(`Updated: ${updated.length}`);
  console.log(`Not found: ${notFound.length}${notFound.length > 0 ? ` (${notFound.join(", ")})` : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
