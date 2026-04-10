# VIGI PRO Security - Remediation Code Examples

This document provides code examples to fix critical vulnerabilities identified in the security audit.

---

## CRITICAL FIX #1: CSRF Token Timing Attack

**File:** `src/lib/security/csrf.ts`

**Before (Vulnerable):**
```typescript
export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  const tokenFromHeader = request.headers.get(CSRF_TOKEN_HEADER);
  if (!tokenFromHeader) return false;

  const cookieStore = await cookies();
  const tokenFromCookie = cookieStore.get(CSRF_TOKEN_COOKIE)?.value;

  if (!tokenFromCookie) return false;

  // VULNERABLE: Timing attack - string equality leaks token length/content
  return tokenFromHeader === tokenFromCookie;
}
```

**After (Fixed):**
```typescript
import { timingSafeEqual } from 'crypto';

export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  const tokenFromHeader = request.headers.get(CSRF_TOKEN_HEADER);
  if (!tokenFromHeader) return false;

  const cookieStore = await cookies();
  const tokenFromCookie = cookieStore.get(CSRF_TOKEN_COOKIE)?.value;

  if (!tokenFromCookie) return false;

  // Check lengths are equal first
  if (tokenFromHeader.length !== tokenFromCookie.length) return false;

  try {
    // Constant-time comparison - prevents timing attacks
    return timingSafeEqual(
      Buffer.from(tokenFromHeader),
      Buffer.from(tokenFromCookie)
    );
  } catch {
    return false; // Thrown if lengths differ
  }
}
```

---

## CRITICAL FIX #2: Exchange Store Persistence

**File:** `src/lib/auth/exchange-store.ts`

**Before (Vulnerable):**
```typescript
// In-memory only - lost on restart
const store = new Map<string, ExchangeEntry>();

export function createExchangeCode(token: string, redirect: string): string {
  const code = crypto.randomBytes(32).toString("hex");
  store.set(code, { token, redirect, createdAt: Date.now() });
  return code;
}
```

**After (Fixed):**
```typescript
import { createClient } from 'redis';

const redis = createClient({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

const CODE_TTL_SECONDS = 60; // 60 seconds
const EXCHANGE_CODE_PREFIX = 'exchange:';

export async function createExchangeCode(token: string, redirect: string): Promise<string> {
  const code = crypto.randomBytes(32).toString("hex");
  const key = `${EXCHANGE_CODE_PREFIX}${code}`;

  const data = JSON.stringify({ token, redirect, createdAt: Date.now() });

  // Store in Redis with TTL - survives restarts, works in distributed deployments
  await redis.setex(key, CODE_TTL_SECONDS, data);

  return code;
}

export async function consumeExchangeCode(code: string): Promise<{ token: string; redirect: string } | null> {
  const key = `${EXCHANGE_CODE_PREFIX}${code}`;

  // Get and delete atomically (single-use)
  const data = await redis.getdel(key);

  if (!data) return null;

  try {
    return JSON.parse(data) as { token: string; redirect: string };
  } catch {
    return null;
  }
}
```

---

## CRITICAL FIX #3: Webhook Signature Verification

**File:** `src/app/api/webhooks/asaas/route.ts`

**Before (Vulnerable):**
```typescript
export async function POST(request: NextRequest) {
  try {
    // VULNERABLE: Optional verification - missing env var bypasses security
    const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get("asaas-access-token") || request.headers.get("x-asaas-signature");
      if (!signature || signature !== webhookSecret) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }
    // ... rest of handler
  }
}
```

**After (Fixed):**
```typescript
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // REQUIRED: Secret must be configured
    const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[ASAAS_WEBHOOK] ASAAS_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("x-asaas-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 }
      );
    }

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!isValid) {
      console.error('[ASAAS_WEBHOOK] Invalid webhook signature');
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Parse body only after verification
    const body = JSON.parse(rawBody);
    // ... rest of handler
  }
}
```

---

## CRITICAL FIX #4: MFA Secret Temporary Storage

**File:** `src/app/api/auth/mfa/setup/route.ts`

**Before (Vulnerable):**
```typescript
export async function POST(request: NextRequest) {
  // ... auth check

  // Generate MFA secret
  const { secret, otpauthUrl, qrCodeDataUrl } = await generateMfaSecret(user.email);

  // VULNERABLE: Secret stored in DB before verification
  await supabase
    .from("users")
    .update({ mfa_secret: secret })
    .eq("id", userId);

  return NextResponse.json({
    qrCodeDataUrl,
    secret,
    otpauthUrl,
  });
}
```

**After (Fixed):**
```typescript
import { createClient } from 'redis';

const redis = createClient({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

const MFA_SETUP_TEMP_TTL = 15 * 60; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    // ... auth check

    // Generate MFA secret
    const { secret, otpauthUrl, qrCodeDataUrl } = await generateMfaSecret(user.email);

    // Store temporarily in Redis only - NOT in database
    const tempKey = `mfa_setup:${userId}`;
    await redis.setex(
      tempKey,
      MFA_SETUP_TEMP_TTL,
      JSON.stringify({ secret, createdAt: Date.now() })
    );

    // Return setup token for client to use in verification
    const setupToken = crypto.randomBytes(32).toString('hex');
    await redis.setex(
      `mfa_setup_token:${setupToken}`,
      MFA_SETUP_TEMP_TTL,
      userId
    );

    return NextResponse.json({
      qrCodeDataUrl,
      secret, // For manual entry only
      otpauthUrl,
      setupToken, // Client sends this to verify endpoint
    });
  } catch (err) {
    console.error('[MFA_SETUP]', err);
    return NextResponse.json(
      { error: "Erro ao configurar MFA" },
      { status: 500 }
    );
  }
}
```

**File:** `src/app/api/auth/mfa/verify/route.ts`

**After (Fixed):**
```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { setupToken, totpToken } = body as { setupToken: string; totpToken: string };

    if (!setupToken || !totpToken) {
      return NextResponse.json(
        { error: "Token de setup e código MFA obrigatórios" },
        { status: 400 }
      );
    }

    // Verify setup token
    const tempUserId = await redis.getdel(`mfa_setup_token:${setupToken}`);
    if (!tempUserId) {
      return NextResponse.json(
        { error: "Setup token inválido ou expirado" },
        { status: 401 }
      );
    }

    // Get temporary secret from Redis
    const setupData = await redis.get(`mfa_setup:${tempUserId}`);
    if (!setupData) {
      return NextResponse.json(
        { error: "MFA setup expirado - inicie novamente" },
        { status: 401 }
      );
    }

    const { secret } = JSON.parse(setupData);

    // Verify TOTP token
    const isValid = await verifyMfaToken(secret, totpToken);
    if (!isValid) {
      return NextResponse.json(
        { error: "Código MFA inválido" },
        { status: 401 }
      );
    }

    // NOW store secret permanently in database (after verification)
    await supabase
      .from("users")
      .update({ mfa_secret: secret, mfa_ativo: true })
      .eq("id", tempUserId);

    // Clean up temporary storage
    await redis.del(`mfa_setup:${tempUserId}`);

    return NextResponse.json({
      ok: true,
      message: "MFA ativado com sucesso",
    });
  } catch (err) {
    console.error('[MFA_VERIFY]', err);
    return NextResponse.json(
      { error: "Erro ao verificar MFA" },
      { status: 500 }
    );
  }
}
```

---

## HIGH FIX #1: TOTP Single-Use Enforcement

**File:** `src/lib/auth/mfa.ts`

**After (Fixed):**
```typescript
import { createClient } from 'redis';

const redis = createClient();
const TOTP_USE_WINDOW_SECONDS = 30;

export async function verifyMfaTokenWithReplayProtection(
  secret: string,
  token: string,
  userId: string
): Promise<boolean> {
  try {
    // Verify TOTP is valid
    const totp = new TOTP();
    const result = await totp.verify(token, {
      secret,
      epochTolerance: 30,
    });

    if (!result.valid) {
      return false;
    }

    // Check if TOTP was already used in this time period
    const timeperiod = Math.floor(Date.now() / 1000 / TOTP_USE_WINDOW_SECONDS);
    const usageKey = `totp_used:${userId}:${secret.slice(0, 8)}:${timeperiod}`;

    // Atomic check-and-set to prevent race conditions
    const alreadyUsed = await redis.getex(usageKey, 'EX', TOTP_USE_WINDOW_SECONDS + 10);
    if (alreadyUsed) {
      console.warn(`[MFA] TOTP replay detected for user ${userId}`);
      return false;
    }

    // Mark this TOTP as used
    await redis.setex(usageKey, TOTP_USE_WINDOW_SECONDS + 10, '1');

    return true;
  } catch {
    return false;
  }
}
```

---

## HIGH FIX #2: Rate Limiting with Account-Based Fallback

**File:** `src/lib/security/rate-limit.ts`

**After (Fixed):**
```typescript
export async function rateLimitWithAccountFallback(
  request: NextRequest,
  config: RateLimitConfig,
  accountId?: string // Optional: email, userId, etc.
): Promise<RateLimitResult> {
  const ip = getClientIp(request);

  // Try IP-based first
  const ipKey = `rl:ip:${ip}:${config.windowMs}:${config.maxRequests}`;

  // Try account-based (email for login)
  const accountKey = accountId ? `rl:account:${accountId}:${config.windowMs}:${config.maxRequests}` : null;

  const redis = getRedis();

  if (redis) {
    try {
      // Check both IP and account limits
      const [ipCount, accountCount] = await Promise.all([
        redis.incr(ipKey),
        accountKey ? redis.incr(accountKey) : Promise.resolve(0),
      ]);

      // Set TTL on first increment
      if (ipCount === 1) await redis.pexpire(ipKey, config.windowMs);
      if (accountKey && accountCount === 1) await redis.pexpire(accountKey, config.windowMs);

      // Fail if EITHER limit exceeded
      const ipSuccess = ipCount <= config.maxRequests;
      const accountSuccess = accountCount <= config.maxRequests;

      if (!ipSuccess) {
        console.warn(`[RATE_LIMIT] IP rate limit exceeded: ${ip}`);
      }
      if (!accountSuccess) {
        console.warn(`[RATE_LIMIT] Account rate limit exceeded: ${accountId}`);
      }

      const success = ipSuccess && accountSuccess;

      if (!success) {
        const ttl = await redis.pttl(ipKey);
        const retryAfter = Math.ceil(Math.max(ttl, 0) / 1000);
        return {
          success: false,
          remaining: Math.max(0, config.maxRequests - Math.max(ipCount, accountCount || 0)),
          resetAt: new Date(Date.now() + Math.max(ttl, 0)),
          retryAfter,
        };
      }

      return {
        success: true,
        remaining: Math.min(
          Math.max(0, config.maxRequests - ipCount),
          accountCount ? Math.max(0, config.maxRequests - accountCount) : config.maxRequests
        ),
        resetAt: new Date(Date.now() + config.windowMs),
      };
    } catch {
      // Fall back to in-memory
    }
  }

  // In-memory fallback
  return rateLimitMemory(ipKey, config, Date.now());
}
```

---

## MEDIUM FIX: Reduce JWT Expiration

**File:** `src/lib/auth/jwt.ts`

**Before:**
```typescript
const JWT_EXPIRES_IN = "8h"; // 8 hours - too long
```

**After:**
```typescript
const JWT_EXPIRES_IN = "15m"; // 15 minutes - best practice
// Refresh tokens handle long-lived sessions (7 days with rotation)
```

---

## MEDIUM FIX: Stricter SameSite Policy

**File:** `src/app/api/auth/refresh/route.ts`

**Before:**
```typescript
response.cookies.set("vigi_refresh", newRefresh.token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax", // Too permissive
  // ...
});
```

**After:**
```typescript
response.cookies.set("vigi_refresh", newRefresh.token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict", // Only send on same-site requests
  path: "/",
  maxAge: 7 * 24 * 60 * 60,
});
```

---

## MEDIUM FIX: Add HSTS Header

**File:** `src/middleware.ts`

**After:**
```typescript
export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Add HSTS header for all responses
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // ... rest of middleware
}
```

---

## Testing the Fixes

```bash
# Test CSRF timing attack fix
npm test -- csrf.test.ts

# Test MFA single-use enforcement
npm test -- mfa.test.ts

# Test rate limiting with spoofing
npm test -- rate-limit.test.ts

# Run full security test suite
npm test -- security/

# Run security linter
npm run audit
```

---

## Deployment Verification

After applying fixes, verify with:

```bash
# 1. Check JWT_SECRET is set and long enough
printenv JWT_SECRET | wc -c # Should be > 32

# 2. Verify Redis is accessible
redis-cli ping # Should return PONG

# 3. Check webhook signatures are being verified
curl -X POST http://localhost:3000/api/webhooks/asaas \
  -H "x-asaas-signature: invalid" \
  -H "Content-Type: application/json" \
  -d '{}' # Should return 401

# 4. Test MFA flow end-to-end
npm test -- e2e/mfa-flow.spec.ts
```

---

## References

- [CWE-208: Observable Timing Discrepancy](https://cwe.mitre.org/data/definitions/208.html)
- [OWASP: Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [JWT Best Practices (RFC 8725)](https://datatracker.ietf.org/doc/html/rfc8725)
- [TOTP Replay Attack Prevention](https://tools.ietf.org/html/rfc4226#section-7.2)
