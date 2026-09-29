"use client";

export function ConfirmButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      // Admin text buttons (tables): at least 44px tall to tap (CLAUDE.md).
      className={`inline-flex min-h-11 min-w-11 items-center justify-center ${className ?? ""}`}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
