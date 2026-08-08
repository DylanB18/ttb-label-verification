import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <p className="text-lg">Choose what you&apos;d like to do:</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <Link
          href="/single"
          className="block rounded-xl border-2 border-neutral-900 p-8 text-center no-underline text-neutral-900 hover:bg-neutral-50 focus:outline-4 focus:outline-offset-2 focus:outline-blue-600"
        >
          <div className="text-4xl">📄</div>
          <div className="mt-3 text-2xl font-bold">Check One Label</div>
          <p className="mt-2 text-base text-neutral-600">Upload a single label image and enter the application details.</p>
        </Link>

        <Link
          href="/batch"
          className="block rounded-xl border-2 border-neutral-900 p-8 text-center no-underline text-neutral-900 hover:bg-neutral-50 focus:outline-4 focus:outline-offset-2 focus:outline-blue-600"
        >
          <div className="text-4xl">📦</div>
          <div className="mt-3 text-2xl font-bold">Check a Batch of Labels</div>
          <p className="mt-2 text-base text-neutral-600">Upload many label images at once, with a spreadsheet of application details.</p>
        </Link>
      </div>
    </div>
  );
}
