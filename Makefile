.DEFAULT_GOAL := help

PLUGIN_ID    := contact-forge
VAULT        ?=
PLUGIN_DIR   := $(VAULT)/.obsidian/plugins/$(PLUGIN_ID)
BUMP         ?= patch

.PHONY: help install dev build test test-watch lint format format-check clean install-plugin release

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Instala las dependencias (pnpm install, respeta pnpm-lock.yaml)
	pnpm install --frozen-lockfile

dev: ## Arranca esbuild en modo watch
	pnpm run dev

build: ## Typecheck (tsc -noEmit) + bundle de producción -> main.js
	pnpm run build

test: ## Ejecuta la suite de tests (vitest run)
	pnpm test

test-watch: ## Ejecuta vitest en modo watch
	pnpm run test:watch

lint: ## Lint con oxlint (config en .oxlintrc.json)
	pnpm run lint

format: ## Formatea todo el repo con oxfmt (config en .oxfmtrc.json)
	pnpm run format

format-check: ## Comprueba el formato sin escribir (falla si algo esta desformateado)
	pnpm run format:check

clean: ## Elimina artefactos generados
	rm -f main.js main.js.map
	rm -rf node_modules coverage

install-plugin: build ## Copia main.js/manifest.json/styles.css a un vault de Obsidian (usa VAULT=/ruta/al/vault)
	@if [ -z "$(VAULT)" ]; then \
		echo "Uso: make install-plugin VAULT=/ruta/al/vault"; \
		exit 1; \
	fi
	mkdir -p "$(PLUGIN_DIR)"
	cp main.js manifest.json styles.css "$(PLUGIN_DIR)/"
	@echo "Plugin instalado en $(PLUGIN_DIR)"

release: lint format-check build test ## Cierra una version: bump (BUMP=patch|minor|major), commit, tag y push del tag
	pnpm version $(BUMP) -m "chore(release): %s"
	git push && git push --tags
	@echo "Tag publicado. El workflow de GitHub Actions generara el release con main.js, manifest.json y styles.css."
