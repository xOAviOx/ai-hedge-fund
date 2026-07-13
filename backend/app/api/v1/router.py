from fastapi import APIRouter, HTTPException
from app.data.cache import get_market_cache
from app.data.providers.base import SymbolNotFound
from app.data.symbols import resolve_symbol
from app.services.portfolio_analysis import analysis_service

router = APIRouter()

@router.get("/market/{symbol}")
async def get_market_data(symbol: str):
    try:
        details = await get_market_cache().get_details(resolve_symbol(symbol))
    except SymbolNotFound:
        raise HTTPException(status_code=404, detail=f"Symbol not found: {symbol}")
    return details.model_dump()

@router.post("/portfolio/analyze")
async def analyze_portfolio(assets: list):
    analysis = await analysis_service.analyze_diversification(assets)
    return analysis

@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "portai-api"}
