import { PageContentSkeleton } from "@/components/page-skeleton";

/** Instant fallback while a signed-in page loads its request-time data. */
export default function Loading() {
  return <PageContentSkeleton />;
}
