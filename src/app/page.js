// src/app/page.js
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to Your Portfolio</h1>
        <Link 
          href="/admin" 
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Go to Admin Dashboard
        </Link>
      </div>
    </main>
  );
}