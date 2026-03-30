import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Terms of Service | elsewhere",
  description: "Terms of Service for Elsewhere.",
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What Elsewhere is",
    body: (
      <>
        Elsewhere is a platform that helps you find cafes and libraries to work
        or study. It shows community ratings, photos, and information about
        places in the Northern Virginia area.
      </>
    ),
  },
  {
    title: "Your account",
    body: (
      <>
        You are responsible for any activity that happens under your account.
        You must be 13 or older to use Elsewhere.
      </>
    ),
  },
  {
    title: "Content you submit",
    body: (
      <>
        When you submit a rating, photo, or tip, you grant Elsewhere a license
        to display that content in the app. You are responsible for what you
        post. Do not post anything false, harmful, or that you don&apos;t have
        the right to share.
      </>
    ),
  },
  {
    title: "Photos",
    body: (
      <>
        Photos you upload should be of the place itself—interior seating, the
        space, the vibe.
      </>
    ),
  },
  {
    title: "Ratings and reviews",
    body: (
      <>
        Rate places honestly based on your real experience. Do not submit fake
        ratings, rate places you haven&apos;t visited, or manipulate ratings
        for any reason.
      </>
    ),
  },
  {
    title: "Place submissions",
    body: (
      <>
        You can suggest places to be added. Elsewhere reviews all submissions
        and has sole discretion over what gets added or removed.
      </>
    ),
  },
  {
    title: "Elsewhere's content",
    body: (
      <>
        Place data, photos seeded by Elsewhere, and app features are owned by
        Elsewhere. Do not scrape or reproduce them.
      </>
    ),
  },
  {
    title: "No guarantees",
    body: (
      <>
        Place information like hours, wifi, and seating may be outdated.
        Elsewhere makes no guarantee that any place is open, available, or as
        described.
      </>
    ),
  },
  {
    title: "Termination",
    body: (
      <>
        Elsewhere may suspend or remove your account if you violate these
        terms.
      </>
    ),
  },
  {
    title: "Changes",
    body: (
      <>
        These terms may change. Continued use of the app means you accept the
        updated terms.
      </>
    ),
  },
];

function ContactLine() {
  return (
    <p className="text-body-l text-text">
      Questions? Reach out at{" "}
      <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent text-link">
        {CONTACT_EMAIL}
      </a>
      .
    </p>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-16 py-24 pb-40">
        <Link
          href="/feed"
          className="text-body-m text-accent text-link mb-16 inline-block"
        >
          ← Back
        </Link>

        <h1 className="font-lora text-heading-xl text-text">Terms of Service</h1>
        <p className="mt-8 text-body-s text-text-secondary">
          Last updated: March 2026
        </p>

        <div className="mt-32 space-y-32">
          {SECTIONS.map((section, i) => (
            <section key={section.title}>
              <h2 className="font-lora text-heading-m text-text">
                {i + 1}. {section.title}
              </h2>
              <p className="mt-12 text-body-l text-text">{section.body}</p>
            </section>
          ))}

          <section>
            <h2 className="font-lora text-heading-m text-text">11. Contact</h2>
            <div className="mt-12">
              <ContactLine />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
