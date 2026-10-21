import { MarkGithubIcon } from "@primer/octicons-react";

import { ButtonLink } from "../ui/button.tsx";
import { Stamp } from "./stamp.tsx";

export function SignIn() {
  return (
    <main className="grid flex-1 place-items-center px-6 py-16">
      <div className="flex flex-col items-center gap-10">
        <h1>
          <Stamp seed="rubberstamp" className="signin-stamp">
            Rubberstamp
          </Stamp>
        </h1>
        <ButtonLink href="/auth/github">
          <MarkGithubIcon size={18} className="fill-current" />
          Sign in with GitHub
        </ButtonLink>
      </div>
    </main>
  );
}
