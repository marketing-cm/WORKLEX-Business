'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Revenue = {
  id: string
  customer_name: string | null
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

export default function RevenuesPage() {
  const router = useRouter()
  const [revenues, setRevenues] = useState<Revenue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadRevenues = async () => {
      const { data: authData } = await supabase.auth.getUser()

      if (!authData.user) {
        router.replace('/')
        return
      }

      const { data, error } = await supabase
        .from('revenues')
        .select('*')
        .order('invoice_date', { ascending: false })

      if (error) {
        setError('Die Einnahmen konnten nicht geladen werden.')
      } else {
        setRevenues((data || []) as Revenue[])
      }

      setLoading(false)
    }

    loadRevenues()
  }, [router])

  const totalNet = revenues.reduce(
    (sum, item) => sum + Number(item.net_amount || 0),
    0
  )

  const totalVat = revenues.reduce(
    (sum, item) => sum + Number(item.vat_amount || 0),
    0
  )

  const totalGross = revenues.reduce(
    (sum, item) => sum + Number(item.gross_amount || 0),
    0
  )

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-4 py-8 text-[#292929] sm:px-8">
      <div className="mx-auto max-w-7xl">

        <header className="mb-8 flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-[#242424] px-6 py-6 text-white shadow-sm sm:px-8">
          <div>
            <button
              onClick={() => router.push('/dashboard')}
              className="mb-3 text-sm text-[#d6bd91] transition hover:text-white"
            >
              ← Zurück zum Dashboard
            </button>

            <p className="mb-2 text-xs font-medium tracking-[0.2em] text-[#c5a46d]">
              WORKLEX · FINANZVERWALTUNG
            </p>

            <h1 className="text-3xl font-semibold">
              Einnahmen
            </h1>

            <p className="mt-2 text-sm text-[#c5c5c5]">
              Übersicht deiner erfassten Einnahmen
            </p>
          </div>

          <button
            onClick={() => router.push('/dashboard/revenues/new')}
            className="rounded-xl bg-[#d6bd91] px-5 py-3 text-sm font-semibold text-[#242424] transition hover:bg-[#e5d2ad]"
          >
            + Neue Einnahme erfassen
          </button>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e8e3d9] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#88847d]">
              Einnahmen netto
            </p>
            <p className="mt-3 text-2xl font-semibold text-[#292929]">
              {euro(totalNet)}
            </p>
            <p className="mt-2 text-xs text-[#a18b65]">
              Gesamt ohne Umsatzsteuer
            </p>
          </div>

          <div className="rounded-2xl border border-[#e8e3d9] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#88847d]">
              Umsatzsteuer eingenommen
            </p>
            <p className="mt-3 text-2xl font-semibold text-[#a18b65]">
              {euro(totalVat)}
            </p>
            <p className="mt-2 text-xs text-[#aaa49a]">
              Enthaltene Umsatzsteuer
            </p>
          </div>

          <div className="rounded-2xl border border-[#e8e3d9] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#88847d]">
              Gesamteinnahmen brutto
            </p>
            <p className="mt-3 text-2xl font-semibold text-[#292929]">
              {euro(totalGross)}
            </p>
            <p className="mt-2 text-xs text-[#a18b65]">
              Inklusive Umsatzsteuer
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e8e3d9] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eeeae2] px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-[#292929]">
                Erfasste Einnahmen
              </h2>
              <p className="mt-1 text-sm text-[#969189]">
                Alle bisher gespeicherten Einnahmen
              </p>
            </div>

            <span className="rounded-full bg-[#f5f3ee] px-4 py-2 text-xs font-medium text-[#8b744d]">
              {revenues.length} {revenues.length === 1 ? 'Eintrag' : 'Einträge'}
            </span>
          </div>

          {loading ? (
            <p className="p-10 text-center text-sm text-[#8b744d]">
              Einnahmen werden geladen ...
            </p>
          ) : error ? (
            <p className="p-10 text-center text-sm text-red-600">
              {error}
            </p>
          ) : revenues.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f5f3ee] text-2xl text-[#a18b65]">
                €
              </div>

              <p className="text-lg font-medium text-[#292929]">
                Noch keine Einnahmen erfasst
              </p>

              <p className="mt-2 text-sm text-[#969189]">
                Sobald du deine erste Einnahme erfasst hast, erscheint sie hier.
              </p>

              <button
                onClick={() => router.push('/dashboard/revenues/new')}
                className="mt-6 rounded-xl bg-[#242424] px-5 py-3 text-sm font-medium text-[#e0c99e] transition hover:bg-[#363636]"
              >
                Erste Einnahme erfassen
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="border-b border-[#eeeae2] bg-[#faf9f6] text-xs uppercase tracking-wide text-[#8b877f]">
                  <tr>
                    <th className="px-6 py-4 font-medium">Datum</th>
                    <th className="px-6 py-4 font-medium">Bezeichnung</th>
                    <th className="px-6 py-4 font-medium">Kunde</th>
                    <th className="px-6 py-4 text-right font-medium">Netto</th>
                    <th className="px-6 py-4 text-right font-medium">USt.</th>
                    <th className="px-6 py-4 text-right font-medium">Brutto</th>
                    <th className="px-6 py-4 text-right font-medium">Aktion</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#eeeae2]">
                  {revenues.map((item) => (
                    <tr
                      key={item.id}
                      className="transition hover:bg-[#faf9f6]"
                    >
                      <td className="whitespace-nowrap px-6 py-5 text-[#77736c]">
                        {dateFormat(item.invoice_date)}
                      </td>

                      <td className="px-6 py-5">
                        <p className="font-medium text-[#292929]">
                          {item.title}
                        </p>

                        {item.category && (
                          <p className="mt-1 text-xs text-[#a18b65]">
                            {item.category}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-5 text-[#77736c]">
                        {item.customer_name || '–'}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-right text-[#55514b]">
                        {euro(Number(item.net_amount))}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-right text-[#a18b65]">
                        {euro(Number(item.vat_amount))}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-right font-semibold text-[#292929]">
                        {euro(Number(item.gross_amount))}
                      </td>

                      <td className="whitespace-nowrap px-6 py-5 text-right">
                        <button
                          onClick={() =>
                            router.push(`/dashboard/revenues/new?id=${item.id}`)
                          }
                          className="rounded-lg border border-[#d8c9aa] px-4 py-2 text-xs font-medium text-[#8b744d] transition hover:bg-[#f5f3ee]"
                        >
                          Bearbeiten
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-8 text-center text-xs text-[#aaa49a]">
          WORKLEX · Deine Unternehmenszahlen
        </p>
      </div>
    </main>
  )
}
