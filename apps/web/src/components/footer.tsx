import { Container } from "../ui/app-shell.tsx";
import { Anchor, AppLink } from "../ui/link.tsx";

/** The site's quiet footer: where the policy and the source live. */
export function SiteFooter() {
  return (
    <footer>
      <Container className="flex gap-5 py-6 text-xs">
        <AppLink to="/privacy" variant="quiet">
          Privacy
        </AppLink>
        <Anchor href="https://github.com/sargunv/rubberstamp" variant="quiet">
          Source
        </Anchor>
      </Container>
    </footer>
  );
}
