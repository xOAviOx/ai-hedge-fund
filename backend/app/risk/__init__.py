"""Portfolio risk analytics — VaR, volatility, beta, drawdown, correlation.

Pure metric functions (:mod:`app.risk.metrics`) plus a service
(:mod:`app.risk.service`) that assembles a live-portfolio risk report from
cached OHLCV. Replaces the old placeholder ``services/portfolio_analysis.py``.
"""
