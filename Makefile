.PHONY: install dev build lint type-check test clean deploy logs stop down nuke seed backup

# --- Local development -----------------------------------------------------
install:
	npm install

dev:
	npm run dev

build:
	npm run build

lint:
	npm run lint

type-check:
	npm run type-check

test:
	npm run test

clean:
	npm run clean

# --- Production deploy (requires .env at repo root) ------------------------
deploy:
	./scripts/deploy.sh up

logs:
	./scripts/deploy.sh logs

stop:
	./scripts/deploy.sh stop

down:
	./scripts/deploy.sh down

nuke:
	./scripts/deploy.sh nuke

seed:
	./scripts/deploy.sh seed

backup:
	./scripts/backup.sh
