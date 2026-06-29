export async function sendTelegramMessage(text, options = {}) {
  const token = options.botToken || process.env.TELEGRAM_BOT_TOKEN || "";
  const chatIds = options.chatIds || getTelegramNotifyChatIds();
  if (!token || !chatIds.length) return { sent: 0, skipped: true };

  let sent = 0;
  for (const chatId of chatIds) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Telegram sendMessage failed: ${response.status} ${body.slice(0, 160)}`);
    }
    sent += 1;
  }
  return { sent, skipped: false };
}

export function getTelegramNotifyChatIds(value = process.env.TELEGRAM_AUDIO_NOTIFY_CHAT_IDS || process.env.INITIAL_ADMIN_TELEGRAM_IDS || "") {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
