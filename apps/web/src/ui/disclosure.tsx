import { Collapsible } from "@base-ui/react/collapsible";
import type { ReactNode } from "react";

import { cx } from "./cx.ts";
import { Chevron } from "./icons.tsx";

/** Opens and closes a `Collapsible.Panel`, with a chevron that turns. */
export function DisclosureTrigger({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible.Trigger
      className={cx(
        "group flex items-center gap-1 rounded-sm text-sm text-muted hover:text-ink data-panel-open:text-ink",
        className,
      )}
    >
      {children}
      <Chevron className="transition-transform group-data-panel-open:rotate-180" />
    </Collapsible.Trigger>
  );
}

/** A panel that grows into place when its disclosure opens. */
export function DisclosurePanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible.Panel
      className={cx(
        "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </Collapsible.Panel>
  );
}
