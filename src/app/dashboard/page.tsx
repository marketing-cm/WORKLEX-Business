'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Booking = {
  id: string
  title: string
  invoice_date: string
  net_amount: number
  vat_amount: number
  gross_amount: number
  category?: string
}

const euro = (value: number) =>
  new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value || 0)

const dateFormat = (value: string) =>
  new Date(value + 'T00:00:00').toLocaleDateString('de-AT')

export default function DashboardPage() {
  const router = useRouter()

  const [companyName, setCompanyName] = useState('Mein Unternehmen')
  const [companyLogoUrl, setCompanyLogoUrl] = useState('')
  const [revenues, setRevenues] = useState<Booking[]>([])
  const [costs, setCosts] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true)
      setError('')

      const { data: { user }, error: authError } =
        await supabase.auth.getUser()

      if (authError || !user) {
        router.replace('/')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id, must_change_password')
        .eq('user_id', user.id)
        .single()

      if (profileError || !profile) {
        setError('Dein Unternehmensprofil konnte nicht geladen werden.')
        setLoading(false)
        return
      }

      if (profile.must_change_password) {
        router.replace('/change-password')
        return
      }

      const companyId = profile.company_id

      const [companyResult, revenueResult, costResult] = await Promise.all([
        supabase
          .from('companies')
          .select('name, logo_path, setup_completed')
          .eq('id', companyId)
          .single(),

        supabase
          .from('revenues')
          .select('id, title, invoice_date, net_amount, vat_amount, gross_amount, category')
          .eq('company_id', companyId)
          .order('invoice_date', { ascending: false }),

        supabase
          .from('costs')
          .select('id, title, invoice_date, net_amount, vat_amount, gross_amount, category')
          .eq('company_id', companyId)
          .order('invoice_date', { ascending: false }),
      ])

      if (companyResult.error || !companyResult.data) {
        setError('Deine Unternehmensdaten konnten nicht geladen werden.')
        setLoading(false)
        return
      }

      if (!companyResult.data.setup_completed) {
        router.replace('/dashboard/setup')
        return
      }

      if (companyResult.data.name) {
        setCompanyName(companyResult.data.name)
      }

      if (companyResult.data.logo_path) {
        const { data: logoData, error: logoError } = await supabase.storage
          .from('worklex-logos')
          .createSignedUrl(companyResult.data.logo_path, 3600)

        if (logoError) {
          console.error('Logo konnte nicht geladen werden:', logoError.message)
        } else if (logoData?.signedUrl) {
          setCompanyLogoUrl(logoData.signedUrl)
        }
      }

      if (revenueResult.error || costResult.error) {
        setError('Die Buchungen konnten nicht vollständig geladen werden.')
      } else {
        setRevenues((revenueResult.data || []) as Booking[])
        setCosts((costResult.data || []) as Booking[])
      }

      setLoading(false)
    }

    loadDashboard()
  }, [router])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  const revenueVat = revenues.reduce(
    (sum, item) => sum + Number(item.vat_amount || 0), 0
  )

  const costVat = costs.reduce(
    (sum, item) => sum + Number(item.vat_amount || 0), 0
  )

  const vatBalance = revenueVat - costVat

  const recentBookings = [
    ...revenues.map(item => ({ ...item, type: 'Einnahme' })),
    ...costs.map(item => ({ ...item, type: 'Ausgabe' })),
  ]
    .sort((a, b) =>
      new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime()
    )
    .slice(0, 8)

  if (loading) {
    return (
      <main className="min-h-screen bg-[#242424] flex items-center justify-center text-[#d6bd91]">
        WORKLEX wird geladen ...
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#292929]">
      <header className="bg-[#242424] text-white px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src="/worklex-icon-glas.png"
              alt="WORKLEX"
              className="h-12 w-auto object-contain"
            />
            <div className="hidden sm:block border-l border-[#d6bd91]/40 pl-4">
              <p className="text-xs text-[#d6bd91] tracking-[0.2em]">
                BUSINESS PORTAL
              </p>
              <p className="text-sm text-white/70">Finanzübersicht</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="text-sm text-[#d6bd91] hover:text-white transition"
          >
            Abmelden
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 py-10">
        <div className="mb-9">
          <p className="text-xs tracking-[0.25em] text-[#a18b65] uppercase mb-2">
            Willkommen in deinem Unternehmensportal
          </p>

          <div className="flex items-center gap-4">
            {companyLogoUrl && (
              <img
                src={companyLogoUrl}
                alt={`${companyName} Logo`}
                className="h-16 w-16 rounded-xl bg-white border border-[#e8e3d9] p-2 object-contain"
              />
            )}

            <h1 className="text-3xl sm:text-4xl font-light">
              {companyName}
            </h1>
          </div>

          <p className="text-sm text-gray-500 mt-2">
            Deine finanzielle Übersicht auf einen Blick.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6">
            {error}
          </div>
        )}

        {/* Umsatzsteuer-Kennzahlen */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-[#242424] text-white rounded-2xl p-6">
            <p className="text-sm text-white/60 mb-3">
              USt. eingenommen
            </p>
            <p className="text-2xl font-light text-[#e0c99e]">
              {euro(revenueVat)}
            </p>
            <p className="text-xs text-white/50 mt-3">
              Umsatzsteuer aus Einnahmen
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-[#e8e3d9]">
            <p className="text-sm text-gray-500 mb-3">
              Vorsteuer ausgegeben
            </p>
            <p className="text-2xl font-light text-[#8b744d]">
              {euro(costVat)}
            </p>
            <p className="text-xs text-gray-400 mt-3">
              Vorsteuer aus Ausgaben
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-[#e8e3d9]">
            <p className="text-sm text-gray-500 mb-3">
              USt.-Saldo
            </p>
            <p className={`text-2xl font-light ${vatBalance < 0 ? 'text-green-700' : 'text-[#8b744d]'}`}>
              {euro(vatBalance)}
            </p>
            <p className="text-xs text-gray-400 mt-3">
              Umsatzsteuer minus Vorsteuer
            </p>
          </div>
        </section>

        {/* Navigation zu Einnahmen und Ausgaben */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => router.push('/dashboard/revenues')}
            className="bg-[#242424] text-[#e0c99e] rounded-xl p-5 text-left hover:bg-[#363636] transition"
          >
            <span className="text-2xl block mb-2">↗</span>
            <span className="font-medium">Einnahmen verwalten</span>
            <span className="block text-xs text-white/50 mt-1">
              Übersicht und neue Einnahmen erfassen
            </span>
          </button>

          <button
            onClick={() => router.push('/dashboard/costs')}
            className="bg-white border border-[#d8c9aa] rounded-xl p-5 text-left hover:bg-[#faf8f3] transition"
          >
            <span className="text-2xl block mb-2 text-[#a18b65]">↗</span>
            <span className="font-medium">Ausgaben verwalten</span>
            <span className="block text-xs text-gray-500 mt-1">
              Übersicht und neue Ausgaben erfassen
            </span>
          </button>
        </section>

        {/* Letzte Buchungen */}
        <section className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-medium">Letzte Buchungen</h2>
            <p className="text-xs text-gray-400 mt-1">
              Deine zuletzt erfassten Einnahmen und Ausgaben
            </p>
          </div>

          {recentBookings.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="text-lg font-light">
                Noch keine Buchungen vorhanden.
              </p>
              <p className="text-sm mt-2">
                Deine ersten Einnahmen und Ausgaben erscheinen hier.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#faf9f6] text-gray-500">
                  <tr>
                    <th className="text-left p-4 font-normal">Datum</th>
                    <th className="text-left p-4 font-normal">Bezeichnung</th>
                    <th className="text-left p-4 font-normal">Art</th>
                    <th className="text-right p-4 font-normal">Netto</th>
                    <th className="text-right p-4 font-normal">Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map(item => (
                    <tr
                      key={`${item.type}-${item.id}`}
                      className="border-t border-gray-100"
                    >
                      <td className="p-4 whitespace-nowrap text-gray-500">
                        {dateFormat(item.invoice_date)}
                      </td>
                      <td className="p-4 font-medium">{item.title}</td>
                      <td className="p-4">
                        <span className={item.type === 'Einnahme' ? 'text-green-700' : 'text-gray-500'}>
                          {item.type}
                        </span>
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        {euro(Number(item.net_amount))}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        {euro(Number(item.gross_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs text-gray-400 text-center mt-8">
          WORKLEX · Deine Unternehmenszahlen · Alle Beträge sind vorläufige Übersichten und keine Steuerberechnung.
        </p>
      </div>
    </main>
  )
}
