import { createFileRoute } from "@tanstack/react-router";

import { Anchor, AppLink } from "../ui/link.tsx";
import { MetaLine, Page } from "../ui/page.tsx";
import { Lede, Prose } from "../ui/prose.tsx";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <Page title="Terms of use" width="prose">
      <Lede>
        Rubberstamp is a free service run by one person. It acts on your
        repositories by itself, and it can be wrong, so check its work.
      </Lede>
      <MetaLine className="mt-2">
        <span>
          Effective <time dateTime="2026-10-21">October 21, 2026</time>
        </span>
      </MetaLine>
      <Prose>
        <h2>Agreeing to these terms</h2>
        <ul>
          <li>
            Installing Rubberstamp Bot or signing in to the dashboard means you
            agree to these terms with us, who run Rubberstamp.
          </li>
          <li>
            If you install it on an organization's account, you agree for that
            organization and confirm that you're allowed to.
          </li>
        </ul>

        <h2>The service</h2>
        <ul>
          <li>
            Rubberstamp is free. It works on public repositories, and on private
            ones only by invitation.
          </li>
          <li>
            Each account has a monthly allowance. Once it runs out, Rubberstamp
            stops labeling that account's items until the next month.
          </li>
          <li>
            We may change what Rubberstamp does, its allowances, and who can use
            it, or shut it down, at any time.
          </li>
        </ul>

        <h2>What it does in your repositories</h2>
        <ul>
          <li>
            Rubberstamp adds labels to issues and pull requests on its own,
            based on a model's judgment. That judgment can be wrong.
          </li>
          <li>
            You're responsible for reviewing what Rubberstamp does, and for
            anything you or your automation do because of it.
          </li>
        </ul>

        <h2>Your content</h2>
        <p>
          You keep all rights to your repositories and what's in them. You let
          Rubberstamp read and process them, as the{" "}
          <AppLink to="/privacy">privacy policy</AppLink> describes, only to
          provide the service.
        </p>

        <h2>Acceptable use</h2>
        <p>Don't use Rubberstamp to:</p>
        <ul>
          <li>
            get around its allowances or the invitation for private repos,
          </li>
          <li>overload it, or interfere with its use by others,</li>
          <li>reach data you aren't allowed to see, or</li>
          <li>
            break the law or{" "}
            <Anchor href="https://docs.github.com/site-policy/github-terms/github-terms-of-service">
              GitHub's terms
            </Anchor>
            .
          </li>
        </ul>

        <h2>Suspension and ending</h2>
        <ul>
          <li>
            We may stop serving any account or repository at any time, such as
            for breaking these terms.
          </li>
          <li>
            You can stop using it at any time by uninstalling it. The privacy
            policy describes what's deleted and when.
          </li>
        </ul>

        <h2>Other services</h2>
        <p>
          Rubberstamp relies on GitHub, TypeSafe, and Cloudflare, each under its
          own terms. We aren't responsible for them.
        </p>

        <h2>The source code</h2>
        <p>
          Rubberstamp's source is available under the{" "}
          <Anchor href="https://github.com/sargunv/rubberstamp/blob/main/LICENSE">
            AGPL-3.0-or-later
          </Anchor>
          . These terms cover the hosted service at this site. The license
          covers your use of the code, including running your own copy.
        </p>

        <h2>No warranty</h2>
        <p>
          <b>
            Rubberstamp is provided as is and as available, with no warranty of
            any kind, express or implied, including of merchantability, fitness
            for a particular purpose, accuracy, or uninterrupted service.
          </b>
        </p>

        <h2>Limitation of liability</h2>
        <p>
          <b>
            As far as the law allows, we aren't liable for any indirect,
            incidental, special, consequential, or punitive damages, or for lost
            data, profits, or time, arising from your use of Rubberstamp, even
            if warned they were possible.
          </b>
        </p>

        <h2>Changes</h2>
        <p>
          If these terms change, this page and its date change before the new
          terms take effect. Using Rubberstamp after that means you accept them.
        </p>

        <h2>Contact</h2>
        <p>
          Send questions about these terms to{" "}
          <Anchor href="mailto:rubberstamp@mail.sargunv.dev">
            rubberstamp@mail.sargunv.dev
          </Anchor>
          .
        </p>
      </Prose>
    </Page>
  );
}
