"use client";

import { WarningCircle, CheckCircle, Info, X, XCircle } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastProps {
  className?: string;
  duration?: number;
  isVisible?: boolean;
  message: string;
  onClose?: () => void;
  type?: ToastType;
}

const toastIcons = {
  error: <XCircle className="h-5 w-5 text-destructive" />,
  info: <Info className="h-5 w-5 text-ink" />,
  success: <CheckCircle className="h-5 w-5 text-kept" />,
  warning: <WarningCircle className="h-5 w-5 text-orange" />,
};

const toastClasses: Record<ToastType, string> = {
  error: "border-destructive/30 bg-[#fde3da]",
  info: "border-line bg-white",
  success: "border-kept/30 bg-kept-soft",
  warning: "border-orange/30 bg-[#fff7ef]",
};

export default function BasicToast({
  message,
  type = "info",
  duration = 3000,
  onClose,
  isVisible = true,
  className = "",
}: ToastProps) {
  const [visible, setVisible] = useState(isVisible);
  const [mounted, setMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setVisible(isVisible);
  }, [isVisible]);

  useEffect(() => {
    if (visible && duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onClose]);

  if (!mounted) {
    return null;
  }

  const toastContent = (
    <AnimatePresence>
      {visible ? (
        <motion.div
          animate={
            shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, x: 0 }
          }
          className={`fixed right-4 bottom-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border p-4 text-ink shadow-lg sm:right-6 sm:bottom-6 ${toastClasses[type]} ${className}`}
          role={type === "error" ? "alert" : "status"}
          exit={
            shouldReduceMotion
              ? { opacity: 0, transition: { duration: 0 } }
              : {
                  opacity: 0,
                  scale: 0.8,
                  transition: { duration: 0.15 },
                  x: 50,
                }
          }
          initial={
            shouldReduceMotion
              ? { opacity: 1 }
              : { opacity: 0, scale: 0.8, x: 50 }
          }
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { bounce: 0.1, duration: 0.25, type: "spring" as const }
          }
        >
          <div className="flex-shrink-0">{toastIcons[type]}</div>
          <p className="flex-1 text-sm">{message}</p>
          <button
            className="flex-shrink-0 cursor-pointer rounded-full p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Dismiss message"
            onClick={() => {
              setVisible(false);
              onClose?.();
            }}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(toastContent, document.body);
}

// Example of how to use this component:
export function ToastDemo() {
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<ToastType>("success");

  const handleShowToast = (type: ToastType) => {
    setToastType(type);
    setShowToast(true);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap gap-2">
        <button
          className="cursor-pointer rounded-md bg-emerald-500 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
          onClick={() => handleShowToast("success")}
          type="button"
        >
          Success Toast
        </button>
        <button
          className="cursor-pointer rounded-md bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
          onClick={() => handleShowToast("error")}
          type="button"
        >
          Error Toast
        </button>
        <button
          className="cursor-pointer rounded-md bg-amber-500 px-3 py-1.5 text-sm text-white hover:bg-amber-600"
          onClick={() => handleShowToast("warning")}
          type="button"
        >
          Warning Toast
        </button>
        <button
          className="cursor-pointer rounded-md bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
          onClick={() => handleShowToast("info")}
          type="button"
        >
          Info Toast
        </button>
      </div>

      <AnimatePresence>
        {showToast ? (
          <BasicToast
            duration={3000}
            message={`This is a ${toastType} message example!`}
            onClose={() => setShowToast(false)}
            type={toastType}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
