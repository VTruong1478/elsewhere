import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { RatingForm } from "@/components/rating/RatingForm";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ name?: string }>;
}

export default async function PlaceRatePage(props: PageProps) {
  const { id } = await props.params;
  const sp = (await props.searchParams) ?? {};
  const placeName = sp.name ?? "This place";

  return (
    <main className="min-h-screen bg-background px-16 py-16">
      <div className="mx-auto max-w-xl space-y-16">
        <header className="flex items-center gap-8">
          <Link
            href="/feed"
            className="flex h-40 w-40 items-center justify-center rounded-radius-sm bg-surface text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft size={20} aria-hidden />
            <span className="sr-only">Back to feed</span>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-heading-m text-text">{placeName}</h1>
            <p className="text-body-s text-text-secondary">
              Share how it feels to work here.
            </p>
          </div>
        </header>

        <RatingForm placeId={id} placeName={placeName} />
      </div>
    </main>
  );
}

