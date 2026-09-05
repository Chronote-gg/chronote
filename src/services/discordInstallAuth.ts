import type { Request, RequestHandler, Response } from "express";
import type { Authenticator } from "passport";
import type { Profile } from "passport-discord";
import {
  stashOauthRedirectFromSession,
  readOauthRedirectFromRequest,
} from "./oauthRedirectSession";
import { readMcpAuthorizeRedirect } from "./mcpOAuthSession";
import { stashInstallAttributionFromSession } from "./installAttributionService";

export const DISCORD_INSTALL_SESSION_KEY = "oauth2:discord-install";

// Both flows use the registered callback URL, but separate Passport state stores
// bind each response to its intended flow. DNT does not affect that binding.
export function discordCallbackAuthentication(
  passport: Pick<Authenticator, "authenticate">,
): RequestHandler {
  return (req, res, next) => {
    const installSession = req.session as typeof req.session & {
      [DISCORD_INSTALL_SESSION_KEY]?: { state?: string };
    };
    const state = installSession?.[DISCORD_INSTALL_SESSION_KEY]?.state;
    if (!state || state !== req.query.state) {
      stashOauthRedirectFromSession(req);
      res.locals.mcpAuthorizeRedirect = readMcpAuthorizeRedirect(req);
      passport.authenticate("discord", { failureRedirect: "/" })(
        req,
        res,
        next,
      );
      return;
    }
    passport.authenticate(
      "discord-install",
      { session: false },
      (error: unknown, user: Profile | false | null) => {
        // Passport consumes successful state; denial can skip its state store.
        delete installSession[DISCORD_INSTALL_SESSION_KEY];
        stashInstallAttributionFromSession(req);
        if (error) {
          next(error);
          return;
        }
        if (!user) {
          res.redirect("/");
          return;
        }
        // A custom callback deliberately never logs in or replaces req.user.
        // Only the verified installer ID survives the transient OAuth profile.
        res.locals.discordInstallerId = user.id;
        next();
      },
    )(req, res, next);
  };
}

export function resolveDiscordCallbackRedirect(
  req: Request,
  res: Response,
  frontendSiteUrl: string,
): string {
  if (res.locals.discordInstallerId)
    return new URL("/join", frontendSiteUrl).toString();
  return (
    res.locals.mcpAuthorizeRedirect ||
    readOauthRedirectFromRequest(req) ||
    frontendSiteUrl
  );
}
