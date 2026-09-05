import type { GuildInstaller } from "../types/db";
import { getGuildInstallerRepository } from "../repositories/guildInstallerRepository";

export async function fetchGuildInstaller(guildId: string) {
  return getGuildInstallerRepository().get(guildId);
}

export async function saveGuildInstaller(installer: GuildInstaller) {
  return getGuildInstallerRepository().write(installer);
}

export async function saveGuildInstallerIfAbsent(installer: GuildInstaller) {
  return getGuildInstallerRepository().writeIfAbsent(installer);
}

export async function removeGuildInstaller(guildId: string, removedAt: string) {
  return getGuildInstallerRepository().remove(guildId, removedAt);
}
