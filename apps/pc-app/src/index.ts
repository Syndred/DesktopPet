import { SHARED_SCHEMA_VERSION } from "@qingpet/shared-types";
export * from "./window.js";
export * from "./interaction.js";

export interface PcBootstrapState {
  platform: "windows" | "macos" | "linux";
  schemaVersion: string;
}

export function createPcBootstrapState(
  platform: PcBootstrapState["platform"]
): PcBootstrapState {
  return {
    platform,
    schemaVersion: SHARED_SCHEMA_VERSION
  };
}
