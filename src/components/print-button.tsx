'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Print / Save as PDF" trigger for the receipt and invoice pages.
 *
 * Previously implemented as a server-rendered `<button>` + inline
 * `<script>` to skip the client bundle entirely. React 19 flags
 * inline script tags with a hydration warning ("Scripts inside React
 * components are never executed when rendering on the client"), so
 * it's a proper Client Component now. Payload cost is negligible —
 * one onClick handler.
 */
export function PrintButton() {
  return (
    <Button type="button" size="sm" onClick={() => window.print()}>
      <Printer className="mr-1.5 size-4" />
      Print / Save as PDF
    </Button>
  );
}
