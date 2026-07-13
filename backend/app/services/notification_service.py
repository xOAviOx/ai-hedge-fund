import os
import httpx
from twilio.rest import Client
from typing import Optional, List, Dict, Any
from datetime import datetime

# Twilio Config
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")

# Telegram Config
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

async def send_sms_alert(message: str, to_number: Optional[str] = None):
    """Sends an SMS alert via Twilio."""
    if not all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER]):
        print("SMS Alert skipped: Twilio credentials missing.")
        return False
    
    target = to_number or os.getenv("USER_PHONE_NUMBER")
    if not target:
        print("SMS Alert skipped: No target phone number.")
        return False

    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        client.messages.create(
            body=f"🚨 PortAI Alert: {message}",
            from_=TWILIO_PHONE_NUMBER,
            to=target
        )
        return True
    except Exception as e:
        print(f"Twilio Error: {e}")
        return False

async def send_telegram_alert(message: str):
    """Sends an alert via Telegram Bot."""
    if not all([TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID]):
        print("Telegram Alert skipped: Bot credentials missing.")
        return False

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": f"🛡️ *PortAI Real-Time Alert*\n\n{message}",
        "parse_mode": "Markdown"
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload)
            return resp.status_code == 200
    except Exception as e:
        print(f"Telegram Error: {e}")
        return False

async def notify_all_channels(message: str):
    """Dispatches alerts to all configured notification channels."""
    sms_status = await send_sms_alert(message)
    tg_status = await send_telegram_alert(message)
    return {"sms": sms_status, "telegram": tg_status}


def format_news_digest(
    market_data: Dict[str, Any],
    news_articles: List[Dict[str, Any]],
    trending_stocks: List[Dict[str, Any]],
) -> str:
    now = datetime.now().strftime("%d %b %Y, %I:%M %p IST")
    lines = [
        "📊 *PortAI — Market Intelligence Digest*",
        f"🕐 _{now}_",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━",
        "📈 *Indian Market Snapshot*",
    ]

    for name, data in list(market_data.items())[:6]:
        price = data.get("price", 0)
        change = data.get("change_pct", 0)
        arrow = "🔺" if change >= 0 else "🔻"
        lines.append(f"  {arrow} *{name}*: ₹{price:,.2f} ({change:+.2f}%)")

    if trending_stocks:
        lines += ["", "━━━━━━━━━━━━━━━━━━━━━━", "🔥 *Trending Stocks*"]
        for s in trending_stocks[:5]:
            change = s.get("change_pct", 0)
            arrow = "🟢" if change >= 0 else "🔴"
            lines.append(f"  {arrow} *{s.get('symbol','?')}*: ₹{s.get('price',0):,.2f} ({change:+.2f}%)")

    if news_articles:
        lines += ["", "━━━━━━━━━━━━━━━━━━━━━━", "📰 *Top Market News*"]
        for a in news_articles[:7]:
            title = a.get("title", "")
            source = a.get("source", {})
            src_name = source.get("name", "") if isinstance(source, dict) else str(source)
            if title:
                lines.append(f"  • {title}" + (f" _{src_name}_" if src_name else ""))

    lines += ["", "━━━━━━━━━━━━━━━━━━━━━━", "_Powered by PortAI Intelligence Engine_ 🤖"]
    return "\n".join(lines)


async def send_news_digest(
    market_data: Dict[str, Any],
    news_articles: List[Dict[str, Any]],
    trending_stocks: List[Dict[str, Any]],
) -> bool:
    """Formats and sends a news/market digest to Telegram."""
    message = format_news_digest(market_data, news_articles, trending_stocks)
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not all([bot_token, chat_id]):
        print("News digest skipped: Telegram credentials missing.")
        return False

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload)
            return resp.status_code == 200
    except Exception as e:
        print(f"Telegram digest error: {e}")
        return False
