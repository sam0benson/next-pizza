import Dashboard from '@/components/Dashboard'
import Login from '@/components/Login'
import { currentUser } from '@/lib/auth'
export const dynamic = 'force-dynamic'
export default async function Page() {
	return (await currentUser()) ? <Dashboard /> : <Login />
}
