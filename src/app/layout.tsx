import type { Metadata } from 'next';
import './globals.css';
import { WorkbenchShell } from '@/components/workbench';

export const metadata: Metadata = {
  title: { default: 'ZenJev · Support workbench', template: '%s · ZenJev' },
  description: 'Less noise. Smarter support. A review-first support workbench.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><WorkbenchShell>{children}</WorkbenchShell></body></html>;
}
