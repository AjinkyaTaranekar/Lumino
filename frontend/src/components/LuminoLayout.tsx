import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopNavBar } from './TopNavBar';
import { SideNavBar } from './SideNavBar';

interface LuminoLayoutProps {
  /** Override children instead of using Outlet (for non-nested routes) */
  children?: React.ReactNode;
  /** Whether to show the side navigation bar (default: true) */
  showSidebar?: boolean;
}

/**
 * Main app shell: sticky TopNavBar + fixed SideNavBar + scrollable content area.
 * Use as a route wrapper or import directly.
 */
export default function LuminoLayout({ children, showSidebar = true }: LuminoLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      {showSidebar && <SideNavBar />}
      <main
        id="main-content"
        className={`pt-16 ${showSidebar ? 'lg:ml-64' : ''} h-screen overflow-y-auto`}
        tabIndex={-1}
      >
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
