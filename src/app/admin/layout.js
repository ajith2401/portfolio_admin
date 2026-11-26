// src/app/admin/layout.js
import AdminShell from './AdminShell';

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
