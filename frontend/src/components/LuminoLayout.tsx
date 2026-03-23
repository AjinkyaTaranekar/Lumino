import { Outlet } from 'react-router-dom'
import TopNavBar from './TopNavBar'
import SideNavBar from './SideNavBar'

export default function LuminoLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <TopNavBar />
      <SideNavBar />
      <main className="lg:ml-64 pt-20">
        <Outlet />
      </main>
    </div>
  )
}
