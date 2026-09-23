import { cn } from '@/lib/utils';

interface AppContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function AppContainer({ children, className }: AppContainerProps) {
  return <div className={cn('app-container w-full min-w-0 max-w-full', className)}>{children}</div>;
}
