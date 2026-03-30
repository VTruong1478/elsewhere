import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Privacy Policy | elsewhere",
  description: "Privacy Policy for Elsewhere.",
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What we collect",
    body: (
      <>
        <p>When you use Elsewhere we collect:</p>
        <ul className="mt-12 list-disc space-y-8 pl-24">
          <li>Your name and email address from Google when you sign in</li>
          <li>Your profile photo from Google if you have one</li>
          <li>Ratings, notes, and photos you submit</li>
          <li>Places you save</li>
          <li>
            Your location if you grant permission (used only to show nearby
            places)
          </li>
        </ul>
        <p className="mt-12">
          We do not collect your precise location in the background. Location is
          only used in the moment to center the map and sort results.
        </p>
      </>
    ),
  },
  {
    title: "How we use it",
    body: (
      <>
        <p>
          To operate and improve the service, we use your information to:
        </p>
        <ul className="mt-12 list-disc space-y-8 pl-24">
          <li>Show you places near you</li>
          <li>Display your ratings and tips to other users</li>
          <li>Save your preferences across sessions</li>
          <li>Let you see your saved places and past ratings</li>
        </ul>
        <p className="mt-12">
          We do not sell your data. We do not use your data for advertising.
        </p>
      </>
    ),
  },
  {
    title: "What other users can see",
    body: (
      <>
        <p>Elsewhere is a public platform. Other users can see:</p>
        <ul className="mt-12 list-disc space-y-8 pl-24">
          <li>Your ratings, vibes, notes, and photos attached to a place</li>
          <li>
            Your first name and last initial (e.g. &quot;An T.&quot;) on tips
            you write
          </li>
        </ul>
        <p className="mt-12">
          Nothing else—your email and full name are not shown publicly.
        </p>
      </>
    ),
  },
  {
    title: "Third party services",
    body: (
      <>
        <p>Elsewhere uses the following third party services:</p>
        <ul className="mt-12 list-disc space-y-8 pl-24">
          <li>Supabase—stores your account data, ratings, and photos</li>
          <li>Google OAuth—handles sign in</li>
          <li>Google Places API—provides place data and photos</li>
          <li>Mapbox—renders the map</li>
          <li>Vercel—hosts the app</li>
        </ul>
        <p className="mt-12">
          These services have their own privacy policies. We share only the
          minimum data necessary to operate Elsewhere and are not responsible
          for the practices of third-party services.
        </p>
      </>
    ),
  },
  {
    title: "Photos",
    body: (
      <>
        <p>
          Photos you upload are stored in Supabase and displayed publicly in the
          app attached to the place you rated. Do not upload photos containing
          people without their consent.
        </p>
        <p className="mt-12">
          Elsewhere may remove any content that violates these guidelines or
          applicable laws at its discretion. If you believe content should be
          removed, please contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent text-link">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </>
    ),
  },
  {
    title: "Data retention",
    body: (
      <>
        Your data stays in Elsewhere as long as your account exists. If you
        request deletion, we will remove your account and associated data
        within 30 days.
      </>
    ),
  },
  {
    title: "Children",
    body: (
      <>
        Elsewhere is not intended for children under 13. We do not knowingly
        collect data from anyone under 13.
      </>
    ),
  },
  {
    title: "Security",
    body: (
      <>
        We use Supabase row-level security to ensure users can only access their
        own private data. All data is transmitted over HTTPS.
      </>
    ),
  },
  {
    title: "Changes",
    body: (
      <>
        If we make material changes to this policy we will update the date at
        the top. Continued use of the app means you accept the updated policy.
      </>
    ),
  },
];

function ContactLine() {
  return (
    <p className="text-body-l text-text">
      Questions about your data? Email us at{" "}
      <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent text-link">
        {CONTACT_EMAIL}
      </a>
      .
    </p>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-16 py-24 pb-40">
        <Link
          href="/feed"
          className="text-body-m text-accent text-link mb-16 inline-block"
        >
          ← Back
        </Link>

        <h1 className="font-lora text-heading-xl text-text">Privacy Policy</h1>
        <p className="mt-8 text-body-s text-text-secondary">
          Last updated: March 2026
        </p>

        <div className="mt-32 space-y-32">
          {SECTIONS.map((section, i) => (
            <section key={section.title}>
              <h2 className="font-lora text-heading-m text-text">
                {i + 1}. {section.title}
              </h2>
              <div className="mt-12 space-y-12 text-body-l text-text">
                {section.body}
              </div>
            </section>
          ))}

          <section>
            <h2 className="font-lora text-heading-m text-text">10. Contact</h2>
            <div className="mt-12">
              <ContactLine />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
