import type { ReactNode } from "react";

interface PageContainerProps {
  title?: string;
  description?: string;
  children: ReactNode;
  width?: "narrow" | "wide";
}

export default function PageContainer({ title, description, children, width = "narrow" }: PageContainerProps) {
  return (
    <div className={`mx-auto px-4 py-8 ${width === "wide" ? "max-w-7xl" : "max-w-3xl"}`}>
      {title ? <h1 className="text-2xl font-semibold tracking-tight">{title}</h1> : null}
      {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
      <div className={title || description ? "mt-6" : ""}>{children}</div>
    </div>
  );
}
