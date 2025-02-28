// src/app/admin/page.js
export default function AdminDashboard() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Admin Dashboard</h1>
        <p>Only accessible to authenticated users</p>
      </div>
    </main>
  );
}
