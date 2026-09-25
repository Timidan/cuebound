import { cn } from "@/lib/utils";

const DIGITS = "0123456789";

// Adapted from Tern (MIT): numbers that roll digit by digit when they change. Non-digits stay still.
export function RollingNumber({ value, className }: { value: string; className?: string }) {
  return (
    <span aria-label={value} className={cn("tabular inline-flex", className)} role="text">
      {value.split("").map((char, i) => {
        const digit = DIGITS.indexOf(char);
        if (digit < 0)
          return (
            <span aria-hidden="true" className="inline-block h-[1.15em] leading-[1.15]" key={`${i}-${char}`}>
              {char}
            </span>
          );
        return (
          <span aria-hidden="true" className="relative inline-block h-[1.15em] overflow-hidden leading-[1.15]" key={i}>
            <span className="block transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" style={{ transform: `translateY(-${digit * 10}%)` }}>
              {DIGITS.split("").map((d) => (
                <span className="block" key={d}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
