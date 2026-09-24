import { Spinner } from "@/components/ui/spinner";
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading Brain"
      className="flex min-h-dvh items-center justify-center"
    >
      <Spinner />
    </div>
  );
}
