/** @jest-environment node */
import express from "express";
import session from "express-session";
import { rateLimit } from "express-rate-limit";
import passport from "passport";
import type { AddressInfo } from "net";
import {
  discordCallbackAuthentication,
  DISCORD_INSTALL_SESSION_KEY,
} from "../../src/services/discordInstallAuth";

// Exercise real Passport login/session middleware; only Discord's remote
// authorization is replaced with a deterministic strategy.
class TestDiscordStrategy extends passport.Strategy {
  authenticate(req: express.Request) {
    if (req.query.state === "invalid" || req.query.error) {
      this.fail();
      return;
    }
    this.success({
      id: "installer",
      accessToken: "transient-token",
      refreshToken: "transient-refresh",
    });
  }
}

async function runCallback(
  options: {
    install?: boolean;
    signedIn?: boolean;
    dnt?: boolean;
    state?: string;
    denied?: boolean;
  } = {},
) {
  const auth = new passport.Passport();
  const serialized = jest.fn(
    (user: Express.User, done: (error: null, user: Express.User) => void) =>
      done(null, user),
  );
  auth.serializeUser(serialized);
  auth.deserializeUser((user: Express.User, done) => done(null, user));
  auth.use("discord", new TestDiscordStrategy());
  auth.use("discord-install", new TestDiscordStrategy());
  const app = express();
  app.use(rateLimit({ windowMs: 60_000, limit: 20 }));
  app.use(
    session({
      secret: "test-only-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: true, httpOnly: true },
    }),
  );
  app.use(auth.initialize());
  app.use(auth.session());
  app.use((req, _res, next) => {
    Object.assign(req.session, {
      oauthRedirect: "https://chronote.gg/library",
      ...(options.install
        ? { [DISCORD_INSTALL_SESSION_KEY]: { state: "install-state" } }
        : {}),
      ...(options.install && !options.dnt
        ? { installAttribution: { source: "direct" } }
        : {}),
      ...(options.signedIn
        ? { passport: { user: { id: "existing-user" } } }
        : {}),
    });
    if (options.signedIn) req.user = { id: "existing-user" };
    next();
  });
  app.get("/callback", discordCallbackAuthentication(auth), (req, res) => {
    res.json({
      user: req.user,
      stored: req.session,
      installerId: res.locals.discordInstallerId,
    });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const query = new URLSearchParams({
      state:
        options.state ?? (options.install ? "install-state" : "portal-state"),
      ...(options.denied ? { error: "access_denied" } : {}),
    });
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback?${query}`,
      { redirect: "manual" },
    );
    return {
      status: response.status,
      body: response.status === 200 ? await response.json() : undefined,
      serialized,
    };
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test.each([false, true])(
  "install callback never creates a portal login, DNT=%s",
  async (dnt) => {
    const result = await runCallback({ install: true, dnt });
    expect(result.status).toBe(200);
    expect(result.body.installerId).toBe("installer");
    expect(result.body.user).toBeUndefined();
    expect(result.body.stored.passport).toBeUndefined();
    expect(result.body.stored[DISCORD_INSTALL_SESSION_KEY]).toBeUndefined();
    expect(result.body.stored.installAttribution).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain("transient-");
    expect(result.serialized).not.toHaveBeenCalled();
  },
);

test("install preserves an existing portal identity", async () => {
  const result = await runCallback({ install: true, signedIn: true });
  expect(result.body.user).toEqual({ id: "existing-user" });
  expect(result.body.stored.passport.user).toEqual({ id: "existing-user" });
  expect(result.body.installerId).toBe("installer");
  expect(result.body.stored.oauthRedirect).toBe("https://chronote.gg/library");
  expect(result.serialized).not.toHaveBeenCalled();
});

test("normal portal callback still serializes its authenticated profile", async () => {
  const result = await runCallback();
  expect(result.body.user.id).toBe("installer");
  expect(result.body.stored.passport.user.id).toBe("installer");
  expect(result.serialized).toHaveBeenCalledTimes(1);
});

test.each([{ state: "invalid" }, { denied: true }])(
  "failed install never logs in: %j",
  async (failure) => {
    const result = await runCallback({ install: true, ...failure });
    expect(result.status).toBe(302);
    expect(result.serialized).not.toHaveBeenCalled();
  },
);
