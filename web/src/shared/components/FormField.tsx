import type { ReactNode } from "react";

type FormFieldProps = {
  children: ReactNode;
  className?: string;
  label: ReactNode;
};

export function FormField({ children, className, label }: FormFieldProps) {
  return (
    <label className={className}>
      <span>{label}</span>
      {children}
    </label>
  );
}
