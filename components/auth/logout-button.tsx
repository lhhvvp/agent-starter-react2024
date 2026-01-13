"use client";

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  async function onClick() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store' });
    } finally {
      router.refresh();
    }
  }
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm"
      title="退出登录"
    >
      退出
    </button>
  );
}

