# VIGI Test Suite - Quick Start Guide

## Test Files Structure

```
src/lib/__tests__/
├── utils.test.ts                 # 58 tests - Utility functions
├── password.test.ts              # 34 tests - Password hashing & validation
├── validation.test.ts            # 58 tests - Zod schema validation
├── sanitize.test.ts              # 59 tests - Input sanitization
├── rate-limit.test.ts            # 22 tests - Rate limiting
├── file-validation.test.ts        # 39 tests - File upload security
├── billing-integration.test.ts    # 32 tests - Billing lifecycle
└── email-integration.test.ts      # 51 tests - Email workflows

Total: 8 files, 265 tests, 100% passing
```

## Running Tests

### Watch mode (development)
```bash
npm run test
```

### Single run (CI/CD)
```bash
npm run test:run
```

### With coverage
```bash
npm run test:coverage
```

## What Gets Tested

### Core Security (password.test.ts)
- ✅ Bcrypt hashing with 12 rounds
- ✅ Secure password comparison
- ✅ Password strength validation (12 chars, uppercase, number, special char)

### Data Validation (validation.test.ts)
- ✅ Login schema (email, password)
- ✅ Company schema (CNPJ, emails, UF)
- ✅ Employee schema (CPF, RG, dates, functions)
- ✅ Vehicle schema (plate, model, type)
- ✅ Report schema (type, month format)

### Input Safety (sanitize.test.ts)
- ✅ XSS prevention (HTML escaping)
- ✅ Prompt injection blocking
- ✅ Format normalization (CNPJ, CPF, phone)
- ✅ Null byte removal
- ✅ Length limiting

### API Protection (rate-limit.test.ts)
- ✅ Per-IP rate limiting
- ✅ Configurable windows and limits
- ✅ Reset tracking
- ✅ Retry-after headers

### File Security (file-validation.test.ts)
- ✅ Magic bytes verification
- ✅ Dangerous extension blocking
- ✅ File size enforcement
- ✅ Executable signature detection
- ✅ File spoofing detection

### Business Logic
- ✅ Billing cycle (D-10 to D+30)
- ✅ Company status transitions
- ✅ Email classification
- ✅ Workflow creation
- ✅ Template selection

## Test Naming Convention

```
describe('Feature - Component', () => {
  it('should [expected behavior] when [condition]', () => {
    // Arrange
    // Act
    // Assert
  })
})
```

Example:
```typescript
describe('Sanitize - sanitizeHtml', () => {
  it('should remove HTML tags when given HTML string', () => {
    const result = sanitizeHtml('<p>hello</p>')
    expect(result).toBe('hello')
  })
})
```

## Key Test Patterns

### 1. Happy Path + Error Cases
Each feature tested with:
- Valid input (should succeed)
- Invalid input (should fail)
- Edge cases (null, empty, boundary)

### 2. Security Testing
- Injection prevention
- XSS blocking
- File security
- Rate limiting

### 3. Business Logic
- State transitions
- Workflow sequences
- Integration between systems

### 4. Error Handling
- Proper error messages
- Status codes
- Retry logic

## Common Assertions

```typescript
// Equality
expect(value).toBe(expected)
expect(array).toEqual([1, 2, 3])

// Truthiness
expect(value).toBeTruthy()
expect(value).toBeFalsy()

// Type/Length
expect(array).toHaveLength(5)
expect(string).toMatch(/pattern/)

// Arrays
expect(array).toContain(item)
expect(array.some(x => x.includes('text'))).toBe(true)

// Functions
expect(fn).toThrow()
expect(async fn).rejects.toThrow()

// Ranges
expect(num).toBeGreaterThan(0)
expect(num).toBeLessThan(100)
```

## Debugging Tests

### Run specific test file
```bash
npm run test -- password.test.ts
```

### Run specific test
```bash
npm run test -- -t "should validate"
```

### Watch specific test
```bash
npm run test -- --watch password.test.ts
```

### Check coverage for file
```bash
npm run test:coverage -- utils.test.ts
```

## When Tests Fail

1. **Check the assertion message** - tells you exactly what failed
2. **Look at expected vs received** - vitest shows the diff
3. **Review test setup** - check mocks are configured
4. **Verify test data** - ensure realistic test values
5. **Check recent code changes** - what changed since last pass?

## Adding New Tests

1. Create new test file in `src/lib/__tests__/`
2. Follow naming: `feature.test.ts`
3. Import function to test: `import { myFn } from '../my-file'`
4. Structure with describe blocks
5. Use AAA pattern (Arrange, Act, Assert)
6. Run `npm run test:run` to verify

Example:
```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from '../my-function'

describe('MyFeature', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test'
    
    // Act
    const result = myFunction(input)
    
    // Assert
    expect(result).toBe('expected')
  })
})
```

## Integration with CI/CD

In your CI/CD pipeline:
```bash
npm run test:run  # Must pass before deployment
```

## Dependencies

- **vitest** - Fast unit test framework
- **@testing-library/react** - React component testing
- **zod** - Schema validation library
- **bcryptjs** - Password hashing

## Notes

- All tests run in Node.js environment (not browser)
- Tests can run in parallel
- No external services required (all mocked)
- Tests complete in ~12 seconds
- 100% deterministic (no flaky tests)
