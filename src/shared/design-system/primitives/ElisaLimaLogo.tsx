import Image from "next/image";
import { cn } from "../cn";

interface ElisaLimaLogoProps {
  variant?: "header" | "login";
  className?: string;
}

export function ElisaLimaLogo({ variant = "header", className }: ElisaLimaLogoProps) {
  const login = variant === "login";

  return (
    <Image
      src="/logos/elisa-lima-transparent.png"
      alt="Elisa Lima"
      width={1233}
      height={516}
      priority
      unoptimized
      sizes={login ? "(max-width: 640px) 240px, 290px" : "120px"}
      className={cn(
        "h-auto object-contain dark:brightness-0 dark:invert",
        login ? "w-[min(72vw,18rem)]" : "w-[7.5rem]",
        className,
      )}
    />
  );
}
