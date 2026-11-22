// Кабинет клиента живёт на прежнем оформлении: новое оформление CRM (src/styles/crm.css) сюда не подключается.
import "@/styles/legacy.css";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
