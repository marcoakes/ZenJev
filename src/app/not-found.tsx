import Link from 'next/link';
export default function NotFound() { return <div className="page"><h1>Record not found</h1><p>This page or ticket is unavailable.</p><Link href="/tickets">Return to ticket queue →</Link></div>; }
