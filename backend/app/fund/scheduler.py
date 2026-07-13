"""APScheduler job: the recurring fund run.

An ``AsyncIOScheduler`` is started in the app lifespan and fires
``service.run_fund`` on the fund's cron (default weekdays 15:45 IST, after NSE
close). The kill-switch (``fund.is_paused``) is checked inside ``run_fund`` before
every run, so pausing needs no scheduler surgery. Start is guarded against the
uvicorn-reload double-fire and never crashes app boot.
"""
from __future__ import annotations

import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.data.db import async_session_maker, init_db
from app.fund import ledger
from app.fund.service import run_fund

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None
_DEFAULT_CRON = "45 15 * * mon-fri"
_TZ = "Asia/Kolkata"


def get_scheduler() -> Optional[AsyncIOScheduler]:
    return _scheduler


def _tz():
    """Return the IST tzinfo, or None (scheduler falls back to local time)."""
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(_TZ)
    except Exception:  # noqa: BLE001 — missing tzdata on some Windows installs
        logger.warning("tz %s unavailable; scheduler uses local time.", _TZ)
        return None


async def _run_default_fund() -> None:
    try:
        await run_fund("local")
    except Exception:  # noqa: BLE001 — a failed run must not kill the scheduler
        logger.exception("Scheduled fund run failed.")


async def start_scheduler(fund_id: str = "local") -> Optional[AsyncIOScheduler]:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    await init_db()
    async with async_session_maker() as session:
        fund = await ledger.get_or_create_fund(session, fund_id)
        cron = fund.schedule_cron or _DEFAULT_CRON
        await session.commit()

    tz = _tz()
    sched = AsyncIOScheduler(timezone=tz) if tz else AsyncIOScheduler()
    try:
        trigger = CronTrigger.from_crontab(cron, timezone=tz) if tz else CronTrigger.from_crontab(cron)
    except Exception:  # noqa: BLE001 — bad cron in config -> safe default
        logger.warning("Invalid cron %r; using default %r.", cron, _DEFAULT_CRON)
        trigger = CronTrigger.from_crontab(_DEFAULT_CRON, timezone=tz) if tz else CronTrigger.from_crontab(_DEFAULT_CRON)

    sched.add_job(
        _run_default_fund, trigger, id=f"fund-run-{fund_id}",
        replace_existing=True, misfire_grace_time=3600, coalesce=True,
    )
    sched.start()
    _scheduler = sched
    logger.info("Scheduler started; fund %s cron=%r tz=%s", fund_id, cron, _TZ if tz else "local")
    return sched


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        try:
            _scheduler.shutdown(wait=False)
        except Exception:  # noqa: BLE001
            pass
        _scheduler = None
