.PHONY: install bootstrap test api web build run

install:            ## install Python + Node dependencies
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

bootstrap:          ## clean data, train models, simulate scheduling layer, generate alerts (~10 s)
	cd backend && python -m scripts.bootstrap

test:               ## 37 integration tests (on a throwaway database)
	cd backend && python -m pytest -q tests

api:                ## API on :8000 (also serves the built frontend)
	cd backend && uvicorn app.main:app --reload --port 8000

web:                ## frontend dev server on :5173 (proxies /api to :8000)
	cd frontend && npm run dev

build:              ## production frontend build into frontend/dist
	cd frontend && npm run build

run: build api      ## build the frontend and serve everything on http://localhost:8000
