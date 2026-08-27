# Project Makefile — app targets plus AI Product Slice Harness.
include Makefile.harness

.DEFAULT_GOAL := start

.PHONY: start build install

PWA_DIR := apps/web-whisper-pwa

install:
	npm --prefix $(PWA_DIR) install

# Local dev server for the PWA (iPhone-sized viewport, LAN-reachable).
start: install
	npm --prefix $(PWA_DIR) start

# Production build published to docs/ for GitHub Pages.
build: install
	node scripts/generate-icons.mjs
	npm --prefix $(PWA_DIR) run build
	node scripts/deploy-docs.mjs
