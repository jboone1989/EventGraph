// Telegram channel pushes (specs/004-editorial-ops FR-005). Same acknowledgement rules as the Feishu
// webhook: an HTTP-level success is not proof of delivery — only Telegram's own {ok:true} is.
export interface TelegramButton {
  label: string;
  url: string;
}

export async function postTelegram(token: string, chatId: string, text: string, buttons: TelegramButton[]): Promise<{ status: "sent" | "failed" | "unknown"; body: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(buttons.length ? { reply_markup: { inline_keyboard: [buttons.map((b) => ({ text: b.label, url: b.url }))] } } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.text();
  let status: "sent" | "failed" | "unknown" = res.status >= 400 && res.status < 500 ? "failed" : "unknown";
  try {
    const json = JSON.parse(body) as { ok?: boolean } | null;
    if (typeof json?.ok === "boolean") status = json.ok ? "sent" : "failed";
  } catch {
    // non-JSON body
  }
  return { status, body: body.slice(0, 500) };
}
