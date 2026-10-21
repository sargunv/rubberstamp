import type { ReactNode } from "react";

/**
 * Long-form reading text, such as a policy. Its content is plain headings,
 * paragraphs, and lists; this styles them.
 */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="leading-relaxed [&_code]:font-mono [&_code]:text-sm [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_p]:my-3 [&_ul]:my-3 [&_ul]:space-y-2">
      {children}
    </div>
  );
}

/** The opening paragraph of a page of prose. */
export function Lede({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-lg">{children}</p>;
}
