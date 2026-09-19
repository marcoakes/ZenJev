'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="page"><div className="notice error" role="alert"><h1>Something interrupted this screen.</h1><p>Your saved records remain in the database. Try loading the screen again.</p><button onClick={reset}>Try again</button></div></div>;
}
