import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-16 bg-background px-16 py-24">
      <h1 className="text-heading-l text-text">Page not found</h1>
      <p className="max-w-md text-center text-body-m text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist or was moved.
      </p>
      <Link
        href="/feed"
        className="text-body-l text-accent text-link underline-offset-2 hover:underline"
      >
        Go home
      </Link>
    </div>
  );
}
