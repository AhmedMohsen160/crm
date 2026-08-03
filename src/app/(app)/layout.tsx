import { requireUser } from '@/lib/auth';
import Shell from '@/components/shell';
import { unreadCount } from '@/lib/notification-engine';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // عدّاد التنبيهات يُقرأ هنا مرة واحدة لكل صفحة — لا نداء دوري من المتصفح
  const unread = await unreadCount(user.id);
  return (
    <Shell user={user} unread={unread}>
      {children}
    </Shell>
  );
}
