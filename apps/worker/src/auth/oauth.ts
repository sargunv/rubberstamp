import * as v from "valibot";

const TokenResponse = v.union([
  v.object({ access_token: v.string(), expires_in: v.optional(v.number()) }),
  v.object({ error: v.string(), error_description: v.optional(v.string()) }),
]);

export function authorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

/** Trade the callback's code for a user access token. */
export async function exchangeCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  send?: typeof fetch;
}): Promise<{ token: string; expiresIn: number }> {
  const send = params.send ?? fetch;
  const response = await send("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "rubberstamp",
    },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });
  const body = v.parse(TokenResponse, await response.json());
  if ("error" in body) {
    throw new Error(
      `GitHub sign-in failed: ${body.error_description ?? body.error}`,
    );
  }
  // Tokens expire in eight hours unless the app turns expiry off.
  return { token: body.access_token, expiresIn: body.expires_in ?? 8 * 3600 };
}
