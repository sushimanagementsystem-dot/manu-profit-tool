export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-br from-rose-50/60 via-background to-amber-50/60 p-6 py-12 dark:from-rose-500/5 dark:via-background dark:to-amber-500/5">
      {children}
    </div>
  );
}
