include .env
export

# Extract host and port from API_URL (e.g. http://0.0.0.0:8000)
API_HOST := $(shell echo $(API_URL) | sed -E 's|https?://([^:]+):.*|\1|')
API_PORT := $(shell echo $(API_URL) | sed -E 's|.*:([0-9]+)$$|\1|')

.PHONY: install dev backend frontend clean

install:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
	cd frontend && pnpm install

dev:
	make backend & make frontend & wait

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --host $(API_HOST) --port $(API_PORT)

frontend:
	cd frontend && VITE_API_URL=$(API_URL) VITE_API_PORT=$(API_PORT) pnpm dev --host

clean:
	rm -rf backend/.venv frontend/node_modules
