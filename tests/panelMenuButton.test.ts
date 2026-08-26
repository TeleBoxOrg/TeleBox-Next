import type { Telegraf } from "telegraf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelConfig } from "../src/utils/panel/types";
import {
  applyMenuButton,
  clearMenuButton,
  getMenuButtonState,
  webAppUrl,
} from "../src/utils/panel/menuButton";

function config(patch: Partial<PanelConfig> = {}): PanelConfig {
  return {
    enabled: true,
    botToken: "123:token",
    publicBaseUrl: "https://panel.example.com",
    bindHost: "0.0.0.0",
    bindPort: 8787,
    sessionSecret: "x".repeat(64),
    admins: [],
    displayName: "Panel",
    updatedAt: 0,
    tunnelMode: "off",
    tunnelUrl: "",
    ...patch,
  };
}

function fakeBot(
  setChatMenuButton = vi.fn().mockResolvedValue(true),
): Telegraf {
  return {
    telegram: { setChatMenuButton },
  } as unknown as Telegraf;
}

describe("panel menu button", () => {
  beforeEach(async () => {
    await clearMenuButton(null);
  });

  it("normalizes the public base URL for both WebApp entry points", () => {
    expect(webAppUrl("  https://panel.example.com///  ")).toBe(
      "https://panel.example.com",
    );
  });

  it("binds a valid HTTPS WebApp as the default menu button", async () => {
    const setChatMenuButton = vi.fn().mockResolvedValue(true);
    await applyMenuButton(
      fakeBot(setChatMenuButton),
      config({ publicBaseUrl: "https://panel.example.com/" }),
    );

    expect(setChatMenuButton).toHaveBeenCalledWith({
      menuButton: {
        type: "web_app",
        text: "打开管理面板",
        web_app: { url: "https://panel.example.com" },
      },
    });
    expect(getMenuButtonState()).toEqual({
      bound: true,
      url: "https://panel.example.com",
    });
  });

  it("restores Telegram's default menu when the panel is disabled or has no URL", async () => {
    const setChatMenuButton = vi.fn().mockResolvedValue(true);
    await applyMenuButton(
      fakeBot(setChatMenuButton),
      config({ enabled: false }),
    );
    await applyMenuButton(
      fakeBot(setChatMenuButton),
      config({ publicBaseUrl: "" }),
    );

    expect(setChatMenuButton).toHaveBeenNthCalledWith(1, {
      menuButton: { type: "default" },
    });
    expect(setChatMenuButton).toHaveBeenNthCalledWith(2, {
      menuButton: { type: "default" },
    });
    expect(getMenuButtonState()).toEqual({ bound: false, url: "" });
  });

  it("clears an invalid URL and exposes the validation error", async () => {
    const setChatMenuButton = vi.fn().mockResolvedValue(true);
    await applyMenuButton(
      fakeBot(setChatMenuButton),
      config({ publicBaseUrl: "http://panel.example.com" }),
    );

    expect(setChatMenuButton).toHaveBeenCalledWith({
      menuButton: { type: "default" },
    });
    expect(getMenuButtonState()).toMatchObject({
      bound: false,
      url: "",
    });
    expect(getMenuButtonState().error).toContain("https://");
  });

  it("retains an API failure as observable state instead of claiming success", async () => {
    const setChatMenuButton = vi
      .fn()
      .mockRejectedValue(new Error("Telegram API unavailable"));
    await applyMenuButton(fakeBot(setChatMenuButton), config());

    expect(getMenuButtonState()).toEqual({
      bound: false,
      url: "",
      error: "Telegram API unavailable",
    });
  });

  it("reports that an enabled panel cannot bind without a running bot", async () => {
    await applyMenuButton(null, config());

    expect(getMenuButtonState()).toEqual({
      bound: false,
      url: "",
      error: "Bot 未运行",
    });
  });
});
