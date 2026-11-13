'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Cost = {
  id: string
  title: string
  category: string | null
  invoice_date: string
  net_amount: number
  vat_amount: number
  gross_amount: number
}

const euro = (value: number) =>
  new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)

const dateFormat = (value: string) =>
  new Date(value + 'T00:00:00').toLocaleDateString('de-AT')

export default function CostsPage() {
  const router = useRouter()
  const [costs, setCosts] = useState<Cost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadCosts = async () => {
      const { data: authData } = await supabase.auth.getUser()

      if (!authData.user) {
        router.replace('/')
        return
      }

      const { data, error } = await supabase
        .from('costs')
        .select('*')
        .order('invoice_date', { ascending: false })

      if (error) {
        setError('Die Ausgaben konnten nicht geladen werden.')
      } else {
        setCosts((data || []) as Cost[])
      }

      setLoading(false)
    }

    loadCosts()
  }, [router])

  const totalNet = costs.reduce((sum, item) => sum + Number(item.net_amount || 0), 0)
  const totalVat = costs.reduce((sum, item) => sum + Number(item.vat_amount || 0), 0)
  const totalGross = costs.reduce((sum, item) => sum + Number(item.gross_amount || 0), 0)

  return (
    <main className="min-h-screen bg-[#202226] px-4 py-8 text-[#f8f6f1] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              onClick={() => router.push('/dashboard')}
              className="mb-3 text-sm text-[#c5a46d] hover:text-white"
            >
              ← Zurück zum Dashboard
            </button>
            <h1 className="text-3xl font-semibold">Ausgaben</h1>
            <p className="mt-2 text-sm text-[#a9a9a9]">
              Übersicht deiner erfassten Ausgaben
            </p>
          </div>

          <button
            onClick={() => router.push('/dashboard/costs/new')}
            className="rounded-lg bg-[#c5a46d] px-5 py-3 text-sm font-semibold text-[#202226] transition hover:bg-[#d8bd91]"
          >
            + Neue Ausgabe erfassen
          </button>
        </div>

        <section className="mb-6 grid grid-cols-3 gap-2 rounded-xl border border-[#414247] bg-[#292b30] p-4 sm:gap-6 sm:p-5">
          <div>
            <p className="text-xs text-[#aaa] sm:text-sm">Ausgaben netto</p>
            <p className="mt-2 text-sm font-semibold text-white sm:text-xl">
              {euro(totalNet)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#aaa] sm:text-sm">Vorsteuer</p>
            <p className="mt-2 text-sm font-semibold text-[#c5a46d] sm:text-xl">
              {euro(totalVat)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#aaa] sm:text-sm">Gesamt brutto</p>
            <p className="mt-2 text-sm font-semibold text-white sm:text-xl">
              {euro(totalGross)}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#414247] bg-[#292b30]">
          {loading ? (
            <p className="p-8 text-center text-sm text-[#aaa]">Ausgaben werden geladen ...</p>
          ) : error ? (
            <p className="p-8 text-center text-sm text-red-400">{error}</p>
          ) : costs.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-lg font-medium">Noch keine Ausgaben erfasst</p>
              <p className="mt-2 text-sm text-[#aaa]">
                Sobald du deine erste Ausgabe erfasst hast, erscheint sie hier.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="border-b border-[#414247] bg-[#24262a] text-xs uppercase tracking-wide text-[#aaa]">
                  <tr>
                    <th className="px-5 py-4">Datum</th>
                    <th className="px-5 py-4">Bezeichnung</th>
                    <th className="px-5 py-4">Kategorie</th>
                    <th className="px-5 py-4 text-right">Netto</th>
                    <th className="px-5 py-4 text-right">Vorsteuer</th>
                    <th className="px-5 py-4 text-right">Brutto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#414247]">
                  {costs.map((item) => (
                    <tr key={item.id} className="transition hover:bg-[#32343a]">
                      <td className="whitespace-nowrap px-5 py-4 text-[#bbb]">
                        {dateFormat(item.invoice_date)}
                      </td>
                      <td className="px-5 py-4 font-medium text-white">
                        {item.title}
                      </td>
                      <td className="px-5 py-4 text-[#999]">
                        {item.category || '–'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        {euro(Number(item.net_amount))}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right text-[#c5a46d]">
                        {euro(Number(item.vat_amount))}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-white">
                        {euro(Number(item.gross_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
