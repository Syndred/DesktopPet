import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

type PublicUser = {
  id: string;
  account: string;
  username: string;
  createdAt: string;
  lastLoginAt?: string | null;
};

type DuelRequest = {
  id: string;
  fromUserId: string;
  fromAccount: string;
  toUserId: string;
  toAccount: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  roomId?: string | null;
  roomCode?: string | null;
  roomStatus?: string | null;
  createdAt: string;
  updatedAt: string;
};

type RuntimeDataStoreType = new (options: { filePath: string }) => {
  getAuthSession: () => { ok: boolean; currentUser: PublicUser | null };
  registerUser: (account: string, password: string, username?: string) => {
    ok: boolean;
    error?: string;
    currentUser?: PublicUser | null;
  };
  loginUser: (account: string, password: string) => {
    ok: boolean;
    error?: string;
    currentUser?: PublicUser | null;
  };
  logoutUser: () => { ok: boolean; currentUser: PublicUser | null };
  updateCurrentUserProfile: (payload: {
    username?: string;
    oldPassword: string;
    newPassword?: string;
  }) => {
    ok: boolean;
    error?: string;
    changed?: boolean;
    currentUser?: PublicUser | null;
  };
  searchUsers: (
    keyword: string,
    limit?: number
  ) => {
    ok: boolean;
    users: PublicUser[];
    error?: string;
  };
  sendDuelRequest: (
    targetAccount: string,
    options?: {
      allowResend?: boolean;
    }
  ) => {
    ok: boolean;
    error?: string;
    resent?: boolean;
    retryAfterSeconds?: number;
    request?: DuelRequest;
  };
  respondDuelRequest: (
    requestId: string,
    decision: "accept" | "reject",
    options?: {
      roomId?: string | null;
      roomCode?: string | null;
      roomStatus?: string | null;
    }
  ) => {
    ok: boolean;
    error?: string;
    request?: DuelRequest;
  };
  cancelDuelRequest: (requestId: string) => {
    ok: boolean;
    error?: string;
    request?: DuelRequest;
  };
  listDuelRequests: () => {
    ok: boolean;
    inbound: DuelRequest[];
    outbound: DuelRequest[];
    error?: string;
  };
};

let RuntimeDataStore: RuntimeDataStoreType;
let tempDirs: string[] = [];

function createTempFilePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "qp-runtime-auth-"));
  tempDirs.push(dir);
  return join(dir, "pet-runtime-data.json");
}

describe("D-007 pc user auth and duel request", () => {
  beforeAll(async () => {
    const modulePath = pathToFileURL(
      join(process.cwd(), "apps/pc-app/runtime/services/runtime-data-store.cjs")
    ).href;
    const loaded = (await import(modulePath)) as {
      RuntimeDataStore: RuntimeDataStoreType;
    };
    RuntimeDataStore = loaded.RuntimeDataStore;
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  it("supports register/logout/login and persists session on restart", () => {
    const filePath = createTempFilePath();
    const store = new RuntimeDataStore({ filePath });

    const register = store.registerUser("alice_01", "123456", "Alice");
    expect(register.ok).toBe(true);
    expect(register.currentUser?.account).toBe("alice_01");
    expect(register.currentUser?.username).toBe("Alice");
    expect(store.getAuthSession().currentUser?.account).toBe("alice_01");
    expect(store.getAuthSession().currentUser?.username).toBe("Alice");

    const logout = store.logoutUser();
    expect(logout.ok).toBe(true);
    expect(logout.currentUser).toBeNull();

    const wrongPassword = store.loginUser("alice_01", "bad123");
    expect(wrongPassword.ok).toBe(false);
    expect(wrongPassword.error).toContain("password");

    const login = store.loginUser("alice_01", "123456");
    expect(login.ok).toBe(true);
    expect(login.currentUser?.account).toBe("alice_01");

    const restarted = new RuntimeDataStore({ filePath });
    expect(restarted.getAuthSession().currentUser?.account).toBe("alice_01");
  });

  it("supports account search and duel request send/list flow", () => {
    const store = new RuntimeDataStore({ filePath: createTempFilePath() });

    expect(store.registerUser("alice_01", "123456", "Alice").ok).toBe(true);
    expect(store.logoutUser().ok).toBe(true);
    expect(store.registerUser("bob_02", "123456", "Bob").ok).toBe(true);
    expect(store.logoutUser().ok).toBe(true);
    expect(store.registerUser("carol_03", "123456", "Carol").ok).toBe(true);
    expect(store.logoutUser().ok).toBe(true);

    expect(store.loginUser("alice_01", "123456").ok).toBe(true);
    const search = store.searchUsers("bo", 10);
    expect(search.ok).toBe(true);
    expect(search.users.some((item) => item.account === "bob_02")).toBe(true);
    expect(search.users.some((item) => item.account === "alice_01")).toBe(false);

    const request = store.sendDuelRequest("bob_02");
    expect(request.ok).toBe(true);
    expect(request.request?.status).toBe("pending");
    expect(request.request?.toAccount).toBe("bob_02");

    const duplicate = store.sendDuelRequest("bob_02");
    expect(duplicate.ok).toBe(false);
    expect(duplicate.error).toContain("pending");

    const aliceRequests = store.listDuelRequests();
    expect(aliceRequests.ok).toBe(true);
    expect(aliceRequests.outbound.length).toBe(1);
    expect(aliceRequests.outbound[0]?.toAccount).toBe("bob_02");

    expect(store.loginUser("bob_02", "123456").ok).toBe(true);
    const bobRequests = store.listDuelRequests();
    expect(bobRequests.ok).toBe(true);
    expect(bobRequests.inbound.length).toBe(1);
    expect(bobRequests.inbound[0]?.fromAccount).toBe("alice_01");
  });

  it("supports duel request accept, reject, cancel and resend cooldown", () => {
    const store = new RuntimeDataStore({ filePath: createTempFilePath() });
    expect(store.registerUser("alice_01", "123456", "Alice").ok).toBe(true);
    expect(store.logoutUser().ok).toBe(true);
    expect(store.registerUser("bob_02", "123456", "Bob").ok).toBe(true);
    expect(store.logoutUser().ok).toBe(true);

    expect(store.loginUser("alice_01", "123456").ok).toBe(true);
    const first = store.sendDuelRequest("bob_02");
    expect(first.ok).toBe(true);
    expect(first.request?.status).toBe("pending");

    const resendTooSoon = store.sendDuelRequest("bob_02", { allowResend: true });
    expect(resendTooSoon.ok).toBe(false);
    expect(String(resendTooSoon.error || "")).toContain("resend");
    expect(Number(resendTooSoon.retryAfterSeconds)).toBeGreaterThan(0);

    const pendingRequestId = first.request?.id || "";
    expect(pendingRequestId.length).toBeGreaterThan(0);

    expect(store.loginUser("bob_02", "123456").ok).toBe(true);
    const accepted = store.respondDuelRequest(pendingRequestId, "accept", {
      roomId: "room-001",
      roomCode: "ab12cd",
      roomStatus: "waiting"
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.request?.status).toBe("accepted");
    expect(accepted.request?.roomId).toBe("room-001");
    expect(accepted.request?.roomCode).toBe("AB12CD");

    const resolveAgain = store.respondDuelRequest(pendingRequestId, "reject");
    expect(resolveAgain.ok).toBe(false);
    expect(String(resolveAgain.error || "")).toContain("resolved");

    expect(store.loginUser("alice_01", "123456").ok).toBe(true);
    const second = store.sendDuelRequest("bob_02");
    expect(second.ok).toBe(true);
    expect(second.request?.status).toBe("pending");
    const secondId = second.request?.id || "";

    const cancelled = store.cancelDuelRequest(secondId);
    expect(cancelled.ok).toBe(true);
    expect(cancelled.request?.status).toBe("cancelled");

    expect(store.loginUser("bob_02", "123456").ok).toBe(true);
    const bobInbound = store.listDuelRequests().inbound;
    expect(bobInbound.some((item) => item.id === pendingRequestId && item.status === "accepted")).toBe(true);
    expect(bobInbound.some((item) => item.id === secondId && item.status === "cancelled")).toBe(true);
  });

  it("blocks duel request when not logged in or targeting self", () => {
    const store = new RuntimeDataStore({ filePath: createTempFilePath() });
    expect(store.registerUser("solo_01", "123456", "Solo").ok).toBe(true);

    const selfRequest = store.sendDuelRequest("solo_01");
    expect(selfRequest.ok).toBe(false);
    expect(selfRequest.error).toContain("yourself");

    expect(store.logoutUser().ok).toBe(true);
    const noSessionRequest = store.sendDuelRequest("solo_01");
    expect(noSessionRequest.ok).toBe(false);
    expect(noSessionRequest.error).toContain("login");
  });

  it("updates account/profile with old password validation", () => {
    const store = new RuntimeDataStore({ filePath: createTempFilePath() });
    expect(store.registerUser("alpha_01", "123456", "Alpha").ok).toBe(true);
    expect(store.logoutUser().ok).toBe(true);
    expect(store.registerUser("beta_02", "123456", "Beta").ok).toBe(true);
    expect(store.logoutUser().ok).toBe(true);
    expect(store.loginUser("alpha_01", "123456").ok).toBe(true);

    const wrongOld = store.updateCurrentUserProfile({
      username: "AlphaRenamed",
      oldPassword: "bad123"
    });
    expect(wrongOld.ok).toBe(false);
    expect(wrongOld.error).toContain("old password");

    const renamed = store.updateCurrentUserProfile({
      username: "AlphaRenamed",
      oldPassword: "123456",
      newPassword: "654321"
    });
    expect(renamed.ok).toBe(true);
    expect(renamed.currentUser?.account).toBe("alpha_01");
    expect(renamed.currentUser?.username).toBe("AlphaRenamed");

    expect(store.logoutUser().ok).toBe(true);
    expect(store.loginUser("alpha_renamed", "654321").ok).toBe(false);
    expect(store.loginUser("alpha_01", "654321").ok).toBe(true);
  });
});
