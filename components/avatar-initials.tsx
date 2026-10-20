import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface AvatarInitialsProps {
  name: string;
  muted?: boolean;
  className?: string;
}

export function AvatarInitials({ name, muted = false, className }: AvatarInitialsProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-base",
        muted ? "bg-muted text-muted-foreground" : "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
