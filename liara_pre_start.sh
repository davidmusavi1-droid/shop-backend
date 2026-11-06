#!/bin/sh
set -eu
# Deployment archives may explicitly request an isolated live-provider check.
# Normal source deployments have no marker and retain their existing startup.
if [ -f /app/.motif-admin-release-check ]; then
  node /app/scripts/verify-admin-release.cjs
  rm /app/.motif-admin-release-check
fi
