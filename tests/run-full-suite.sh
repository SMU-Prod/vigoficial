#!/bin/bash

################################################################################
# VIGI Complete Test Suite
# ============================================================================
# Runs ALL tests in order: unit → integration → coverage
# - Phase 1: Unit tests (no dependencies)
# - Phase 2: Start mock servers (GESP on 3333, DOU on 3334)
# - Phase 3: Run integration tests
# - Phase 4: Stop servers and generate coverage
# - Summary: Pass/fail count and timing
#
# Features:
# - Colored output with timestamps
# - Support for --unit-only, --integration-only, --coverage flags
# - Graceful cleanup on Ctrl+C
# - Detailed pass/fail summary
# - Optional coverage HTML report
################################################################################

set -o pipefail

# ============================================================================
# Color codes and formatting
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ============================================================================
# Configuration
# ============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="${PROJECT_ROOT}/tests"
SRC_DIR="${PROJECT_ROOT}/src"
COVERAGE_DIR="${PROJECT_ROOT}/coverage"
LOGS_DIR="/tmp/vigi-test-logs"

# Ports for mock servers
GESP_PORT=3333
DOU_PORT=3334

# Test configuration
UNIT_ONLY=false
INTEGRATION_ONLY=false
WITH_COVERAGE=false
VERBOSE=false

# Store PIDs for cleanup
GESP_PID=""
DOU_PID=""

# Test counters
UNIT_PASS=0
UNIT_FAIL=0
INTEGRATION_PASS=0
INTEGRATION_FAIL=0
START_TIME=0
END_TIME=0

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
  local text="$1"
  echo ""
  echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${CYAN}║${NC} ${text}"
  echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

log_info() {
  echo -e "${BLUE}[INFO]${NC} $(date '+%H:%M:%S') - $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $(date '+%H:%M:%S') - $1"
}

log_warn() {
  echo -e "${YELLOW}[!]${NC} $(date '+%H:%M:%S') - $1"
}

log_error() {
  echo -e "${RED}[✗]${NC} $(date '+%H:%M:%S') - $1"
}

log_test_pass() {
  echo -e "${GREEN}  ✓${NC} $1"
}

log_test_fail() {
  echo -e "${RED}  ✗${NC} $1"
}

log_section() {
  echo ""
  echo -e "${MAGENTA}─────────────────────────────────────────────────────────────────────${NC}"
  echo -e "${BOLD}${MAGENTA}$1${NC}"
  echo -e "${MAGENTA}─────────────────────────────────────────────────────────────────────${NC}"
  echo ""
}

# ============================================================================
# Initialization
# ============================================================================

init_environment() {
  log_info "Initializing test environment..."

  # Create log directory
  mkdir -p "${LOGS_DIR}"
  rm -f "${LOGS_DIR}"/*.log

  # Check project structure
  if [ ! -d "${PROJECT_ROOT}" ]; then
    log_error "Project root not found: ${PROJECT_ROOT}"
    exit 1
  fi

  if [ ! -d "${TEST_DIR}" ]; then
    log_error "Test directory not found: ${TEST_DIR}"
    exit 1
  fi

  # Check for required tools
  if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
  fi

  if ! command -v npm &> /dev/null; then
    log_error "npm is not installed"
    exit 1
  fi

  log_success "Node.js version: $(node --version)"
  log_success "npm version: $(npm --version)"

  # Check dependencies
  if [ ! -d "${PROJECT_ROOT}/node_modules" ]; then
    log_info "Installing dependencies..."
    cd "${PROJECT_ROOT}" && npm install --silent
    if [ $? -ne 0 ]; then
      log_error "Failed to install dependencies"
      exit 1
    fi
    log_success "Dependencies installed"
  fi

  log_success "Environment initialized"
}

# ============================================================================
# Parse Command Line Arguments
# ============================================================================

parse_args() {
  while [[ $# -gt 0 ]]; do
    case $1 in
      --unit-only)
        UNIT_ONLY=true
        shift
        ;;
      --integration-only)
        INTEGRATION_ONLY=true
        shift
        ;;
      --coverage)
        WITH_COVERAGE=true
        shift
        ;;
      --verbose)
        VERBOSE=true
        shift
        ;;
      -h|--help)
        print_usage
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        print_usage
        exit 1
        ;;
    esac
  done
}

print_usage() {
  cat << EOF
Usage: ./run-full-suite.sh [OPTIONS]

OPTIONS:
  --unit-only          Run only unit tests (skip integration)
  --integration-only   Run only integration tests (skip unit)
  --coverage          Generate coverage report after tests
  --verbose           Show detailed test output
  -h, --help          Show this help message

EXAMPLES:
  # Run all tests with coverage
  ./run-full-suite.sh --coverage

  # Run only unit tests
  ./run-full-suite.sh --unit-only

  # Run integration tests with verbose output
  ./run-full-suite.sh --integration-only --verbose

EOF
}

# ============================================================================
# Mock Server Management
# ============================================================================

start_gesp_server() {
  log_info "Starting GESP mock server on port ${GESP_PORT}..."

  if [ ! -f "${TEST_DIR}/mocks/gesp-standalone.ts" ]; then
    log_error "GESP mock server not found: ${TEST_DIR}/mocks/gesp-standalone.ts"
    return 1
  fi

  cd "${PROJECT_ROOT}" && \
    npx tsx "${TEST_DIR}/mocks/gesp-standalone.ts" > "${LOGS_DIR}/gesp-server.log" 2>&1 &
  GESP_PID=$!

  # Wait for server to start
  sleep 2

  # Verify process is still running
  if ! kill -0 $GESP_PID 2>/dev/null; then
    log_error "GESP server failed to start"
    cat "${LOGS_DIR}/gesp-server.log"
    return 1
  fi

  # Try to connect
  if ! timeout 5 curl -s "http://localhost:${GESP_PORT}/health" > /dev/null 2>&1; then
    log_warn "GESP server health check failed (continuing anyway)"
  fi

  log_success "GESP mock server started (PID: ${GESP_PID})"
  return 0
}

start_dou_server() {
  log_info "Starting DOU mock server on port ${DOU_PORT}..."

  if [ ! -f "${TEST_DIR}/mocks/dou-standalone.ts" ]; then
    log_error "DOU mock server not found: ${TEST_DIR}/mocks/dou-standalone.ts"
    return 1
  fi

  cd "${PROJECT_ROOT}" && \
    npx tsx "${TEST_DIR}/mocks/dou-standalone.ts" > "${LOGS_DIR}/dou-server.log" 2>&1 &
  DOU_PID=$!

  # Wait for server to start
  sleep 2

  # Verify process is still running
  if ! kill -0 $DOU_PID 2>/dev/null; then
    log_error "DOU server failed to start"
    cat "${LOGS_DIR}/dou-server.log"
    return 1
  fi

  # Try to connect
  if ! timeout 5 curl -s "http://localhost:${DOU_PORT}/health" > /dev/null 2>&1; then
    log_warn "DOU server health check failed (continuing anyway)"
  fi

  log_success "DOU mock server started (PID: ${DOU_PID})"
  return 0
}

stop_gesp_server() {
  if [ -n "$GESP_PID" ] && kill -0 $GESP_PID 2>/dev/null; then
    log_info "Stopping GESP mock server (PID: ${GESP_PID})..."
    kill $GESP_PID 2>/dev/null || true
    wait $GESP_PID 2>/dev/null || true
    GESP_PID=""
    log_success "GESP mock server stopped"
  fi
}

stop_dou_server() {
  if [ -n "$DOU_PID" ] && kill -0 $DOU_PID 2>/dev/null; then
    log_info "Stopping DOU mock server (PID: ${DOU_PID})..."
    kill $DOU_PID 2>/dev/null || true
    wait $DOU_PID 2>/dev/null || true
    DOU_PID=""
    log_success "DOU mock server stopped"
  fi
}

stop_mock_servers() {
  stop_gesp_server
  stop_dou_server
}

# ============================================================================
# Cleanup
# ============================================================================

cleanup() {
  log_info "Cleaning up resources..."

  # Stop mock servers
  stop_mock_servers

  # Kill any remaining child processes
  jobs -p | xargs -r kill 2>/dev/null || true

  log_success "Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# ============================================================================
# Test Execution
# ============================================================================

run_unit_tests() {
  log_section "PHASE 1: Unit Tests"
  log_info "Running unit tests from ${TEST_DIR}/unit..."

  if [ ! -d "${TEST_DIR}/unit" ]; then
    log_warn "Unit test directory not found, skipping"
    return 0
  fi

  cd "${PROJECT_ROOT}"

  local test_log="${LOGS_DIR}/unit-tests.log"
  local test_output

  if [ "${VERBOSE}" = true ]; then
    npx vitest run "${TEST_DIR}/unit" --reporter=verbose 2>&1 | tee "${test_log}"
    test_output=$?
  else
    test_output=$(npx vitest run "${TEST_DIR}/unit" --reporter=verbose 2>&1)
    echo "${test_output}" > "${test_log}"
    echo "${test_output}"
  fi

  if [ ${test_output} -eq 0 ]; then
    log_success "Unit tests passed"
    return 0
  else
    log_error "Unit tests failed"
    return 1
  fi
}

run_integration_tests() {
  log_section "PHASE 2: Start Mock Servers"
  log_info "Starting mock servers for integration testing..."

  # Start GESP server
  if ! start_gesp_server; then
    log_error "Failed to start GESP mock server"
    return 1
  fi

  # Start DOU server
  if ! start_dou_server; then
    log_error "Failed to start DOU mock server"
    stop_gesp_server
    return 1
  fi

  log_success "Both mock servers are running"

  log_section "PHASE 3: Integration Tests"
  log_info "Running integration tests from ${TEST_DIR}/integration..."

  if [ ! -d "${TEST_DIR}/integration" ]; then
    log_warn "Integration test directory not found, skipping"
    stop_mock_servers
    return 0
  fi

  cd "${PROJECT_ROOT}"

  local test_log="${LOGS_DIR}/integration-tests.log"
  local test_output

  # Set environment variables for tests
  export GESP_MOCK_URL="http://localhost:${GESP_PORT}"
  export DOU_MOCK_URL="http://localhost:${DOU_PORT}"

  if [ "${VERBOSE}" = true ]; then
    npx vitest run "${TEST_DIR}/integration" --reporter=verbose 2>&1 | tee "${test_log}"
    test_output=$?
  else
    test_output=$(npx vitest run "${TEST_DIR}/integration" --reporter=verbose 2>&1)
    echo "${test_output}" > "${test_log}"
    echo "${test_output}"
  fi

  # Stop servers before returning
  log_section "PHASE 4: Cleanup Mock Servers"
  stop_mock_servers

  if [ ${test_output} -eq 0 ]; then
    log_success "Integration tests passed"
    return 0
  else
    log_error "Integration tests failed"
    return 1
  fi
}

run_coverage_report() {
  log_section "Coverage Report"
  log_info "Generating test coverage report..."

  cd "${PROJECT_ROOT}"

  if [ ! -d "${COVERAGE_DIR}" ]; then
    log_warn "Coverage directory not found, skipping coverage generation"
    return 0
  fi

  # Run tests with coverage
  log_info "Running all tests with coverage instrumentation..."
  npx vitest run --coverage 2>&1 | tee "${LOGS_DIR}/coverage.log"

  if [ -f "${COVERAGE_DIR}/index.html" ]; then
    log_success "Coverage report generated: file://${COVERAGE_DIR}/index.html"
  else
    log_warn "Coverage report not found at expected location"
  fi
}

# ============================================================================
# Summary and Reporting
# ============================================================================

print_summary() {
  local total_duration=$((END_TIME - START_TIME))
  local minutes=$((total_duration / 60))
  local seconds=$((total_duration % 60))

  echo ""
  print_header "TEST EXECUTION SUMMARY"

  echo -e "${BOLD}Timing:${NC}"
  echo -e "  Total Duration: ${minutes}m ${seconds}s"
  echo ""

  echo -e "${BOLD}Configuration:${NC}"
  [ "${UNIT_ONLY}" = true ] && echo -e "  Mode: ${YELLOW}Unit tests only${NC}" || true
  [ "${INTEGRATION_ONLY}" = true ] && echo -e "  Mode: ${YELLOW}Integration tests only${NC}" || true
  [ "${WITH_COVERAGE}" = true ] && echo -e "  Coverage: ${GREEN}Enabled${NC}" || echo -e "  Coverage: ${YELLOW}Disabled${NC}"
  echo ""

  echo -e "${BOLD}Test Logs:${NC}"
  if [ -f "${LOGS_DIR}/unit-tests.log" ]; then
    echo -e "  Unit Tests: ${LOGS_DIR}/unit-tests.log"
  fi
  if [ -f "${LOGS_DIR}/integration-tests.log" ]; then
    echo -e "  Integration Tests: ${LOGS_DIR}/integration-tests.log"
  fi
  if [ -f "${LOGS_DIR}/gesp-server.log" ]; then
    echo -e "  GESP Server: ${LOGS_DIR}/gesp-server.log"
  fi
  if [ -f "${LOGS_DIR}/dou-server.log" ]; then
    echo -e "  DOU Server: ${LOGS_DIR}/dou-server.log"
  fi
  echo ""

  echo -e "${BOLD}Coverage Report:${NC}"
  if [ -f "${COVERAGE_DIR}/index.html" ]; then
    echo -e "  HTML Report: file://${COVERAGE_DIR}/index.html"
  else
    echo -e "  ${YELLOW}Not generated${NC}"
  fi
  echo ""

  print_header "END OF TEST RUN"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
  START_TIME=$(date +%s)

  # Print welcome
  clear
  print_header "VIGI Complete Test Suite"
  echo -e "${BOLD}Starting comprehensive test execution...${NC}"
  echo ""

  # Parse arguments
  parse_args "$@"

  # Initialize environment
  init_environment

  local overall_status=0

  # Run unit tests unless --integration-only is set
  if [ "${INTEGRATION_ONLY}" != true ]; then
    if ! run_unit_tests; then
      overall_status=1
    fi
  fi

  # Run integration tests unless --unit-only is set
  if [ "${UNIT_ONLY}" != true ]; then
    if ! run_integration_tests; then
      overall_status=1
    fi
  fi

  # Generate coverage if requested
  if [ "${WITH_COVERAGE}" = true ]; then
    run_coverage_report
  fi

  END_TIME=$(date +%s)

  # Print summary
  print_summary

  # Exit with appropriate code
  if [ $overall_status -eq 0 ]; then
    log_success "All tests passed!"
    exit 0
  else
    log_error "Some tests failed. Check logs above for details."
    exit 1
  fi
}

# ============================================================================
# Script Entry Point
# ============================================================================

# Only run main if script is executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
