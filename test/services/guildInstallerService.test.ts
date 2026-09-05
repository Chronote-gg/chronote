import { beforeEach, describe, expect, test } from "@jest/globals";
import { resetMockStore } from "../../src/repositories/mockStore";
import {
  fetchGuildInstaller,
  removeGuildInstaller,
  saveGuildInstallerIfAbsent,
} from "../../src/services/guildInstallerService";

describe("guildInstallerService", () => {
  beforeEach(() => resetMockStore());

  test("preserves the first installer and attribution record", async () => {
    const guildId = "555555555555555555";
    const first = {
      guildId,
      installerId: "111111111111111111",
      installedAt: "2026-08-28T12:00:00.000Z",
      acquisition: {
        source: "chatgpt.com",
        medium: "referral",
        landingPath: "/",
        ctaLocation: "hero",
        capturedAt: "2026-08-28T11:59:00.000Z",
      },
    };
    const repeat = {
      guildId,
      installerId: "222222222222222222",
      installedAt: "2026-08-29T12:00:00.000Z",
      acquisition: {
        source: "direct",
        medium: "web",
        landingPath: "/join",
        ctaLocation: "join",
        capturedAt: "2026-08-29T11:59:00.000Z",
      },
    };

    await expect(saveGuildInstallerIfAbsent(first)).resolves.toBe(true);
    await expect(saveGuildInstallerIfAbsent(repeat)).resolves.toBe(false);
    await expect(fetchGuildInstaller(guildId)).resolves.toEqual(first);
  });
});

describe("installer removal lifecycle", () => {
  beforeEach(() => resetMockStore());

  const first = {
    guildId: "555555555555555555",
    installerId: "111111111111111111",
    installedAt: "2026-08-28T12:00:00.000Z",
  };
  const removedAt = "2026-08-29T12:00:00.000Z";
  const reinstall = {
    ...first,
    installerId: "222222222222222222",
    installedAt: "2026-08-30T12:00:00.000Z",
    acquisition: {
      source: "direct",
      medium: "web",
      capturedAt: "2026-08-30T12:00:00.000Z",
    },
  };

  test("allows a new installer and attribution after removal", async () => {
    await saveGuildInstallerIfAbsent(first);
    await removeGuildInstaller(first.guildId, removedAt);
    await expect(fetchGuildInstaller(first.guildId)).resolves.toBeUndefined();
    await expect(saveGuildInstallerIfAbsent(reinstall)).resolves.toBe(true);
    await expect(fetchGuildInstaller(first.guildId)).resolves.toEqual(
      reinstall,
    );
  });

  test("delayed removal cannot erase a newer installation", async () => {
    await saveGuildInstallerIfAbsent(reinstall);
    await removeGuildInstaller(first.guildId, removedAt);
    await expect(fetchGuildInstaller(first.guildId)).resolves.toEqual(
      reinstall,
    );
  });

  test("removing a missing installer is harmless", async () => {
    await expect(
      removeGuildInstaller(first.guildId, removedAt),
    ).resolves.toBeUndefined();
  });
});
