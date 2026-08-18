"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { Info } from "lucide-react";
import * as React from "react";
import { cn } from "../cn";
import { eases, springs } from "../motion-variants";

type AnimatedInfoTriggerProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children?: React.ReactNode;
  iconClassName?: string;
  iconSize?: number;
  iconStrokeWidth?: number;
};

export const AnimatedInfoTrigger = React.forwardRef<HTMLButtonElement, AnimatedInfoTriggerProps>(
  function AnimatedInfoTrigger(
    {
      children,
      className,
      disabled,
      iconClassName,
      iconSize = 13,
      iconStrokeWidth = 2.25,
      onKeyDown,
      onPointerDown,
      type = "button",
      ...props
    },
    ref,
  ) {
    const reduzir = useReducedMotion();
    const [pulso, setPulso] = React.useState(0);

    function dispararPulso() {
      if (!disabled && !reduzir) setPulso((atual) => atual + 1);
    }

    return (
      <motion.button
        ref={ref}
        type={type}
        disabled={disabled}
        whileTap={reduzir || disabled ? undefined : { scale: 0.86, rotate: -5 }}
        onPointerDown={(event) => {
          dispararPulso();
          onPointerDown?.(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") dispararPulso();
          onKeyDown?.(event);
        }}
        className={cn("relative isolate overflow-visible", className)}
        {...props}
      >
        <AnimatePresence>
          {pulso > 0 && (
            <motion.span
              key={pulso}
              aria-hidden="true"
              initial={{ opacity: 0.62, scale: 0.35 }}
              animate={{ opacity: 0, scale: 1.85 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.48, ease: eases.emphasized }}
              className="pointer-events-none absolute inset-[-6px] -z-10 rounded-full border border-primary/35 bg-primary/10"
            />
          )}
        </AnimatePresence>
        <motion.span
          key={`icone-${pulso}`}
          aria-hidden="true"
          initial={false}
          animate={pulso > 0 && !reduzir ? { scale: [1, 0.9, 1.1, 1], rotate: [0, -11, 7, 0] } : undefined}
          transition={{ duration: 0.36, ease: eases.emphasized }}
          className="inline-flex shrink-0"
        >
          <Info aria-hidden="true" size={iconSize} strokeWidth={iconStrokeWidth} className={iconClassName} />
        </motion.span>
        {children}
      </motion.button>
    );
  },
);

type AnimatedInfoPopoverProps = Omit<React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>, "children"> & {
  arrowClassName?: string;
  children: React.ReactNode;
  showArrow?: boolean;
  trigger: React.ReactNode;
};

export function AnimatedInfoPopover({
  arrowClassName,
  children,
  className,
  showArrow = true,
  trigger,
  ...contentProps
}: AnimatedInfoPopoverProps) {
  const reduzir = useReducedMotion();

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content asChild {...contentProps}>
          <motion.div
            initial={reduzir ? false : { opacity: 0, scale: 0.84, y: 7, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={reduzir ? undefined : { opacity: 0, scale: 0.96, y: 2 }}
            transition={reduzir ? { duration: 0 } : springs.settle}
            className={cn(
              "origin-[var(--radix-popover-content-transform-origin)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-300 data-[state=open]:ease-[cubic-bezier(0.22,1,0.36,1)]",
              className,
            )}
          >
            {children}
            {showArrow && <PopoverPrimitive.Arrow className={cn("fill-card", arrowClassName)} />}
          </motion.div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
