import type { ReactNode } from 'react';
import NavigationSidebar from './NavigationSidebar';
import FloatingShapes from './FloatingShapes';
import UserSetupGate from './UserSetupGate';

const AppShell = ({ children }: { children: ReactNode }) => {
  return (
    <UserSetupGate>
      <div className="min-h-screen relative">
        <FloatingShapes />
        <NavigationSidebar />
        {/* Main content area offset by sidebar */}
        <main className="relative z-10 md:ml-16 min-h-screen">
          {children}
        </main>
      </div>
    </UserSetupGate>
  );
};

export default AppShell;
