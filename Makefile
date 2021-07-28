SHELL ?= /bin/bash

.DEFAULT_GOAL := test-unit

################################################################################
# Containerized development environment-- or lack thereof                      #
################################################################################

ifneq ($(SKIP_DOCKER),true)
	PROJECT_ROOT := $(dir $(realpath $(firstword $(MAKEFILE_LIST))))
	GO_DEV_IMAGE := brigadecore/go-tools:v0.1.0

	GO_DOCKER_CMD := docker run \
		-it \
		--rm \
		-e SKIP_DOCKER=true \
		-e GITHUB_TOKEN=$${GITHUB_TOKEN} \
		-e GOCACHE=/workspaces/brigade-foundations/.gocache \
		-v $(PROJECT_ROOT):/workspaces/brigade-foundations \
		-w /workspaces/brigade-foundations \
		$(GO_DEV_IMAGE)
endif

################################################################################
# Tests                                                                        #
################################################################################

.PHONY: lint
lint:
	$(GO_DOCKER_CMD) sh -c ' \
		golangci-lint run --config golangci.yaml \
	'

.PHONY: test-unit
test-unit:
	$(GO_DOCKER_CMD) sh -c ' \
		go test \
			-v \
			-timeout=60s \
			-race \
			-coverprofile=coverage.txt \
			-covermode=atomic \
			./... \
	'
