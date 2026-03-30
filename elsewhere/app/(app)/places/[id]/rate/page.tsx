import { RatingForm } from "@/components/rating/RatingForm";
import { RatePageBackButton } from "@/components/rating/RatePageBackButton";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ name?: string }>;
}

export default async function PlaceRatePage(props: PageProps) {
  const { id } = await props.params;
  const sp = (await props.searchParams) ?? {};
  const placeName = sp.name ?? "This place";

  return (
    <div className="w-full bg-background px-16 pb-32 pt-16 lg:pb-32">
      <div className="mx-auto max-w-xl space-y-8">
        <header className="flex min-w-0 items-center gap-8">
          <RatePageBackButton />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-heading-m text-text" title={placeName}>
              {placeName}
            </h1>
          </div>
        </header>

        <RatingForm placeId={id} placeName={placeName} />
      </div>
    </div>
  );
}
