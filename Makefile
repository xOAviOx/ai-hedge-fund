# PortAI — convenience targets. Unix/macOS/Git-Bash; on plain Windows use the
# explicit commands in the README. Everything runs without any API key.
.PHONY: help setup backend frontend test bench up down

help:
	@echo "targets: setup | backend | frontend | test | bench | up | down"

setup:
	cd backend && python -m venv .venv
	cd backend && (.venv/bin/pip install -r requirements.txt || .venv/Scripts/pip install -r requirements.txt)
	cd frontend && npm install
	@echo ""
	@echo "Next: cp backend/.env.example backend/.env ; cp frontend/.env.example frontend/.env.local"

backend:
	cd backend && uvicorn app.main:app --reload

frontend:
	cd frontend && npm run dev

test:
	cd backend && python -m pytest -q

bench:
	cd backend && python scripts/bench.py

up:
	docker compose up --build

down:
	docker compose down
