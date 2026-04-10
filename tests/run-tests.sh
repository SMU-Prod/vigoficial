#!/bin/bash

# ============================================
# VIGI Integration Test Runner
# ============================================
# This script sets up the test environment,
# starts mock servers, runs integration tests,
# and cleans up resources.

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Store PIDs for cleanup
GESP_PID=""
DOU_PID=""

# ============================================
# Helper Functions
# ============================================

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
  log_info "Cleaning up test resources..."

  # Kill GESP server
  if [ -n "$GESP_PID" ]; then
    log_info "Stopping GESP mock server (PID: $GESP_PID)..."
    kill $GESP_PID 2>/dev/null || true
    sleep 1
  fi

  # Kill DOU server
  if [ -n "$DOU_PID" ]; then
    log_info "Stopping DOU mock server (PID: $DOU_PID)..."
    kill $DOU_PID 2>/dev/null || true
    sleep 1
  fi

  log_success "Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT

# ============================================
# Main Script
# ============================================

log_info "VIGI Integration Test Runner"
log_info "=============================="

# Check if .env.test exists
if [ ! -f ".env.test" ]; then
  log_error ".env.test file not found"
  log_info "Please run this script from the project root directory"
  exit 1
fi

# Load test environment variables
log_info "Loading test environment from .env.test..."
export $(cat .env.test | grep -v '^#' | xargs)
log_success "Test environment loaded"

# Verify Node.js and npm are available
if ! command -v node &> /dev/null; then
  log_error "Node.js is not installed"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  log_error "npm is not installed"
  exit 1
fi

log_info "Node version: $(node --version)"
log_info "npm version: $(npm --version)"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  log_info "Installing dependencies..."
  npm install
fi

# ============================================
# Start Mock Servers
# ============================================

log_info "Starting mock servers..."

# Start GESP mock server on port 3333
log_info "Starting GESP mock server on http://localhost:3333..."
npx tsx tests/mocks/gesp-standalone.ts > /tmp/gesp-server.log 2>&1 &
GESP_PID=$!
log_info "GESP server started with PID: $GESP_PID"

# Start DOU mock server on port 3334
log_info "Starting DOU mock server on http://localhost:3334..."
npx tsx tests/mocks/dou-standalone.ts > /tmp/dou-server.log 2>&1 &
DOU_PID=$!
log_info "DOU server started with PID: $DOU_PID"

# Wait for servers to start
log_info "Waiting for servers to initialize..."
sleep 3

# Verify servers are running
log_info "Verifying server connectivity..."

# Check GESP server
if ! kill -0 $GESP_PID 2>/dev/null; then
  log_error "GESP server failed to start"
  cat /tmp/gesp-server.log
  exit 1
fi

# Check DOU server
if ! kill -0 $DOU_PID 2>/dev/null; then
  log_error "DOU server failed to start"
  cat /tmp/dou-server.log
  exit 1
fi

log_success "Both mock servers are running"

# ============================================
# Run Integration Tests
# ============================================

log_info "Running integration tests..."
log_info "Test suite: tests/integration/"

# Run vitest with integration tests
npx vitest run tests/integration/ --reporter=verbose

TEST_RESULT=$?

if [ $TEST_RESULT -eq 0 ]; then
  log_success "All integration tests passed!"
else
  log_error "Integration tests failed with exit code: $TEST_RESULT"
fi

# ============================================
# Run with Coverage (optional)
# ============================================

if [ "$1" == "--coverage" ]; then
  log_info "Running tests with coverage..."
  npx vitest run tests/integration/ --coverage
fi

# ============================================
# Test Summary
# ============================================

log_info "Test run completed"
log_info "=============================="

if [ $TEST_RESULT -eq 0 ]; then
  log_success "All tests passed!"
else
  log_error "Some tests failed. Check output above for details."
fi

exit $TEST_RESULT
