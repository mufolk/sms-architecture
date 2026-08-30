import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-white">Page not found</h1>
      <p className="mt-4 text-sm text-slate-400">
        That URL does not match any page in this app.
      </p>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/" className="text-indigo-300 hover:text-indigo-200">Home</Link>
        <Link href="/admin" className="text-indigo-300 hover:text-indigo-200">Admin</Link>
        <Link href="/dev" className="text-indigo-300 hover:text-indigo-200">Dev handset</Link>
      </div>
    </main>
  );
}
