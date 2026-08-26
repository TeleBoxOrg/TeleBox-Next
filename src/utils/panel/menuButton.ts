/**
 * TeleBox Panel — Telegram Chat Menu Button integration.
 *
 * This module is intentionally independent from botService: botService imports
 * webAppUrl() to build inline buttons, while the controller passes the active
 * Telegraf instance here for the default Chat Menu Button.
 */

import type { Telegraf } from "telegraf";
import { getErrorMessage } from "@utils/errorHelpers";
import { logger } from "@utils/logger";
import type { PanelConfig } from "./types";

type SetChatMenuButtonOptions = NonNullable<
  Parameters<Telegraf["telegram"]["setChatMenuButton"]>[0]
>;
type MenuButton = NonNullable<SetChatMenuButtonOptions["menuButton"]>;

export interface MenuButtonState {
  bound: boolean;
  /** The URL from the last successful WebApp binding, or empty when unbound. */
  url: string;
  /** The last binding/clearing failure, if any. */
  error?: string;
}

const MENU_BUTTON_TEXT = "打开管理面板";

let state: MenuButtonState = {
  bound: false,
  url: "",
};

/**
 * Normalize the URL shared by inline WebApp buttons and the Chat Menu Button.
 * Config storage already removes trailing slashes, but this helper is also
 * called directly by botService and therefore remains defensive.
 */
export function webAppUrl(baseUrl: string): string {
  const value = baseUrl.trim();
  return value ? value.replace(/\/+$/, "") : "";
}

export function getMenuButtonState(): MenuButtonState {
  return { ...state };
}

function setUnbound(error?: string): void {
  state = error
    ? { bound: false, url: "", error }
    : { bound: false, url: "" };
}

function setBound(url: string): void {
  state = { bound: true, url };
}

function validateWebAppUrl(baseUrl: string): string {
  const url = webAppUrl(baseUrl);
  if (!url) {
    throw new Error("未设置公网 HTTPS 地址");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("公网地址格式无效");
  }

  if (parsed.protocol !== "https:" || !parsed.hostname) {
    throw new Error("Telegram WebApp 要求 https:// 公网地址");
  }
  return url;
}

function defaultMenuButton(): MenuButton {
  return { type: "default" };
}

function webAppMenuButton(url: string): MenuButton {
  return {
    type: "web_app",
    text: MENU_BUTTON_TEXT,
    web_app: { url },
  };
}

/**
 * Restore Telegram's normal command-list menu button.
 *
 * Clearing is best-effort during shutdown: a missing bot instance is already
 * equivalent to no active binding in this process, while a live Bot API error
 * remains visible through getMenuButtonState().
 */
export async function clearMenuButton(bot: Telegraf | null): Promise<void> {
  if (!bot) {
    setUnbound();
    return;
  }

  try {
    await bot.telegram.setChatMenuButton({
      menuButton: defaultMenuButton(),
    });
    setUnbound();
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    setUnbound(message);
    logger.warn("[panel-menu] failed to restore Telegram default menu button", error);
  }
}

/**
 * Synchronize the default Chat Menu Button with the current panel config.
 * Invalid/empty URLs clear any stale button and remain observable as state;
 * they do not prevent the rest of the panel runtime from starting.
 */
export async function applyMenuButton(
  bot: Telegraf | null,
  cfg: PanelConfig,
): Promise<void> {
  if (!cfg.enabled || !cfg.publicBaseUrl.trim()) {
    await clearMenuButton(bot);
    return;
  }

  let url: string;
  try {
    url = validateWebAppUrl(cfg.publicBaseUrl);
  } catch (error: unknown) {
    await clearMenuButton(bot);
    setUnbound(getErrorMessage(error));
    return;
  }

  if (!bot) {
    setUnbound("Bot 未运行");
    return;
  }

  try {
    await bot.telegram.setChatMenuButton({
      menuButton: webAppMenuButton(url),
    });
    setBound(url);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    setUnbound(message);
    logger.warn("[panel-menu] failed to bind Telegram WebApp menu button", error);
  }
}
