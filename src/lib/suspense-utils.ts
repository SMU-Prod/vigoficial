/**
 * FE-04: Suspense Boundary Utilities
 * Helper functions and documentation for implementing Suspense boundaries
 *
 * NOTE: The pages prospeccao, empresas, and monitoramento are currently
 * using "use client" directives which prevent server-side data fetching.
 *
 * To properly implement Suspense boundaries (FE-04), these components should be:
 * 1. Converted to server components (remove "use client")
 * 2. Use async/await for data fetching instead of useFetch hook
 * 3. Wrapped with React.Suspense from client component children
 *
 * Example refactoring pattern:
 *
 * // /app/(dashboard)/empresas/page.tsx (SERVER COMPONENT)
 * import { Suspense } from 'react';
 * import { getCompanies } from '@/lib/data/companies';
 * import EmpresasContent from './empresas-content';
 * import { TableSkeleton } from '@/components/suspense-fallback';
 *
 * export default async function EmpresasPage() {
 *   return (
 *     <Suspense fallback={<TableSkeleton />}>
 *       <EmpresasContent />
 *     </Suspense>
 *   );
 * }
 *
 * // /app/(dashboard)/empresas/empresas-content.tsx (CLIENT COMPONENT)
 * 'use client';
 * import { useContext } from 'react';
 *
 * export default function EmpresasContent() {
 *   // Now receives pre-fetched data as promise from server parent
 *   // ...
 * }
 *
 * Benefits:
 * - Faster initial page load (parallel data fetching)
 * - Better perceived performance with skeleton loaders
 * - Reduced layout shift
 * - Improved SEO (content in HTML, not JS)
 */

/**
 * List of pages that should implement Suspense boundaries:
 * 1. src/app/(dashboard)/prospeccao/page.tsx
 * 2. src/app/(dashboard)/empresas/page.tsx
 * 3. src/app/(dashboard)/monitoramento/page.tsx
 *
 * These pages currently load data client-side with useFetch.
 * Converting to server components with Suspense would improve:
 * - Perceived performance (show skeleton while loading data)
 * - Data freshness (fetch on server, not browser)
 * - Bundle size (less JS sent to client)
 */

// Migration checklist for FE-04 implementation:
// [ ] Convert page.tsx from "use client" to server component
// [ ] Extract client-side content into -content.tsx file with "use client"
// [ ] Create async data fetching function in lib/data/
// [ ] Wrap content with <Suspense fallback={<Skeleton />}>
// [ ] Test loading state and error boundaries
// [ ] Verify SEO metadata is still present
