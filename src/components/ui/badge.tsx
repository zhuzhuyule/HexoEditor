import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors select-none",
  {
    variants: {
      variant: {
        default: "bg-zinc-100 text-zinc-700 border border-zinc-200/70",
        subtle: "bg-zinc-100/80 text-zinc-600",
        amber: "bg-amber-50 text-amber-700 border border-amber-200/80",
        emerald: "bg-emerald-50 text-emerald-700 border border-emerald-200/80",
        outline: "border border-zinc-200 text-zinc-600 bg-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
