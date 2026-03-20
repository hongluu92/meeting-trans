include .env
export

.PHONY: install dev backend frontend clean

install:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
	cd frontend && pnpm install

dev:
	make backend & make frontend & wait

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port $(API_PORT)

frontend:
	cd frontend && VITE_API_PORT=$(API_PORT) pnpm dev --host

clean:
	rm -rf backend/.venv frontend/node_modules
