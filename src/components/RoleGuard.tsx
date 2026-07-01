"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Role, sectionAllowed } from "@/components/RoleContext";

// Секция определяется первым сегментом пути после /dashboard.
function sectionOf(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean); // ["dashboard", "clients", ...]
  return parts[1] || "dashboard"; // /dashboard → dashboard
}

// Уводит пользователя с закрытой для его роли страницы (client-side).
export default function RoleGuard({ role }: { role: Role }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const section = sectionOf(pathname);
    if (!sectionAllowed(role, section)) {
      router.replace("/dashboard/montage");
    }
  }, [pathname, role, router]);
  return null;
}
