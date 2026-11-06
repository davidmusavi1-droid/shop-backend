#!/bin/sh
set -eu
# Deployment archives may explicitly request an isolated live-provider check.
# Normal source deployments have no marker and retain their existing startup.
if [ -f /app/.motif-admin-release-check ] && [ ! -f /tmp/motif-admin-release-check.passed ]; then
  node /app/scripts/verify-admin-release.cjs
  touch /tmp/motif-admin-release-check.passed
fi
