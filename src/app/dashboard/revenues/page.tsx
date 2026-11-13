
'use client'

import { Fragment, useEffect, useState } from 'react'
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

type RevenuePayment = {
  id: string
  revenue_id: string
  amount: number
  paid_at: string
}

const euro = (value: number) =>
  new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)

const dateFormat = (value: string) =>
  new Date(value + 'T00:00:00').toLocaleDateString('de-AT')

const paymentDateFormat = (value: string) =>
  new Date(value).toLocaleString('de-AT', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

export default function RevenuesPage() {
  const router = useRouter()

  const [revenues, setRevenues] = useState<Revenue[]>([])
  const [payments, setPayments] = useState<RevenuePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paymentError, setPaymentError] = useState('')

  const [activeRevenueId, setActiveRevenueId] = useState<string | null>(null)
  const [paymentMode, setPaymentMode] = useState<'partial' | 'full' | null>(null)
  const [inputMode, setInputMode] = useState<'euro' | 'percent'>('euro')
  const [paymentValue, setPaymentValue] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)

  const loadData = async () => {
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      router.replace('/')
      return
    }

    const { data: revenueData, error: revenueError } = await supabase
      .from('revenues')
      .select('*')
      .order('invoice_date', { ascending: false })

    if (revenueError) {
      setError('Die Einnahmen konnten nicht geladen werden.')
      setLoading(false)
      return
    }

    const { data: paymentData, error: paymentsError } = await supabase
      .from('revenue_payments')
      .select('*')
      .order('paid_at', { ascending: false })

    if (paymentsError) {
      setError('Die Zahlungshistorie konnte nicht geladen werden.')
      setLoading(false)
      return
    }

    setRevenues((revenueData || []) as Revenue[])
    setPayments((paymentData || []) as RevenuePayment[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const paidTotal = (revenueId: string) =>
    payments
      .filter((payment) => payment.revenue_id === revenueId)
      .reduce((sum, payment) => sum + Number(payment.amount), 0)

  const outstanding = (item: Revenue) =>
    Math.max(0, Number(item.gross_amount) - paidTotal(item.id))

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

  const totalPaid = revenues.reduce(
    (sum, item) => sum + paidTotal(item.id),
    0
  )

  const totalOutstanding = Math.max(0, totalGross - totalPaid)

  const openPayment = (revenueId: string) => {
    if (activeRevenueId === revenueId) {
      setActiveRevenueId(null)
      setPaymentMode(null)
      setPaymentError('')
      return
    }

    setActiveRevenueId(revenueId)
    setPaymentMode(null)
    setPaymentValue('')
    setInputMode('euro')
    setPaymentError('')
  }

  const openRevenue = (revenueId: string) => {
    router.push(`/dashboard/revenues/${revenueId}`)
  }

  const savePayment = async (item: Revenue) => {
    const remaining = outstanding(item)

    if (remaining <= 0) {
      setPaymentError('Diese Einnahme ist bereits vollständig bezahlt.')
      return
    }

    let amount = remaining

    if (paymentMode === 'partial') {
      const value = Number(paymentValue.replace(',', '.'))

      if (!Number.isFinite(value) || value <= 0) {
        setPaymentError('Bitte gib einen gültigen Zahlungsbetrag ein.')
        return
      }

      amount =
        inputMode === 'percent'
          ? Math.round((remaining * value) / 100 * 100) / 100
          : Math.round(value * 100) / 100

      if (inputMode === 'percent' && value > 100) {
        setPaymentError('Der Prozentsatz darf höchstens 100 % betragen.')
        return
      }

      if (amount <= 0) {
        setPaymentError('Der Zahlungsbetrag ist zu klein.')
        return
      }

      if (amount > remaining) {
        setPaymentError('Die Zahlung ist höher als der noch offene Betrag.')
        return
      }
    }

    setSavingPayment(true)
    setPaymentError('')

    const { error: saveError } = await supabase.rpc(
      'record_revenue_payment',
      {
        p_revenue_id: item.id,
        p_amount: amount,
      }
    )

    if (saveError) {
      setPaymentError(saveError.message || 'Die Zahlung konnte nicht gespeichert werden.')
      setSavingPayment(false)
      return
    }

    await loadData()

    setActiveRevenueId(null)
    setPaymentMode(null)
    setPaymentValue('')
    setSavingPayment(false)
  }

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

            <h1 className="text-3xl font-semibold">Einnahmen</h1>

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

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#e8e3d9] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#88847d]">Einnahmen netto</p>
            <p className="mt-3 text-2xl font-semibold">{euro(totalNet)}</p>
            <p className="mt-2 text-xs text-[#a18b65]">Gesamt ohne Umsatzsteuer</p>
          </div>

          <div className="rounded-2xl border border-[#e8e3d9] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#88847d]">Umsatzsteuer</p>
            <p className="mt-3 text-2xl font-semibold text-[#a18b65]">
              {euro(totalVat)}
            </p>
            <p className="mt-2 text-xs text-[#aaa49a]">Enthaltene Umsatzsteuer</p>
          </div>

          <div className="rounded-2xl border border-[#e8e3d9] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#88847d]">Bereits bezahlt</p>
            <p className="mt-3 text-2xl font-semibold text-emerald-700">
              {euro(totalPaid)}
            </p>
            <p className="mt-2 text-xs text-[#aaa49a]">Eingegangene Zahlungen</p>
          </div>

          <div className="rounded-2xl border border-[#e8e3d9] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#88847d]">Noch offen</p>
            <p className="mt-3 text-2xl font-semibold text-[#292929]">
              {euro(totalOutstanding)}
            </p>
            <p className="mt-2 text-xs text-[#a18b65]">Offene Forderungen</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e8e3d9] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eeeae2] px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold">Erfasste Einnahmen</h2>
              <p className="mt-1 text-sm text-[#969189]">
                Einnahmen und dazugehörige Zahlungseingänge
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
            <p className="p-10 text-center text-sm text-red-600">{error}</p>
          ) : revenues.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f5f3ee] text-2xl text-[#a18b65]">
                €
              </div>

              <p className="text-lg font-medium">Noch keine Einnahmen erfasst</p>

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
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-b border-[#eeeae2] bg-[#faf9f6] text-xs uppercase tracking-wide text-[#8b877f]">
                  <tr>
                    <th className="px-6 py-4 font-medium">Datum</th>
                    <th className="px-6 py-4 font-medium">Bezeichnung</th>
                    <th className="px-6 py-4 font-medium">Kunde</th>
                    <th className="px-6 py-4 text-right font-medium">Netto</th>
                    <th className="px-6 py-4 text-right font-medium">USt.</th>
                    <th className="px-6 py-4 text-right font-medium">Brutto</th>
                    <th className="px-6 py-4 text-right font-medium">Zahlungsstatus</th>
                    <th className="px-6 py-4 text-right font-medium">Aktion</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#eeeae2]">
                  {revenues.map((item) => {
                    const paid = paidTotal(item.id)
                    const remaining = outstanding(item)
                    const isPaid = remaining < 0.01
                    const isPartiallyPaid = paid > 0 && !isPaid
                    const isOpen = activeRevenueId === item.id

                    const percentage =
                      Number(item.gross_amount) > 0
                        ? Math.min(100, (paid / Number(item.gross_amount)) * 100)
                        : 0

                    const history = payments.filter(
                      (payment) => payment.revenue_id === item.id
                    )

                    return (
                      <Fragment key={item.id}>
                        <tr
                          onClick={() => openRevenue(item.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openRevenue(item.id)
                            }
                          }}
                          role="link"
                          tabIndex={0}
                          className="cursor-pointer transition hover:bg-[#faf9f6] focus:outline-none focus:bg-[#f5f3ee]"
                          title="Einnahmedetails öffnen"
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
                            <p className="mt-1 text-xs text-[#a18b65]">
                              Details öffnen ↗
                            </p>
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

                          <td className="whitespace-nowrap px-6 py-5 text-right font-semibold">
                            {euro(Number(item.gross_amount))}
                          </td>

                          <td className="px-6 py-5 text-right">
                            <span
                              className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium ${
                                isPaid
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : isPartiallyPaid
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-[#f5f3ee] text-[#8b744d]'
                              }`}
                            >
                              {isPaid ? 'Bezahlt' : isPartiallyPaid ? 'Teilbezahlt' : 'Offen'}
                            </span>

                            <p className="mt-1 text-xs text-[#969189]">
                              {isPaid ? '0,00 € offen' : `${euro(remaining)} offen`}
                            </p>
                          </td>

                          <td className="whitespace-nowrap px-6 py-5 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openPayment(item.id)
                                }}
                                className={`relative h-7 w-12 rounded-full transition ${
                                  isPaid
                                    ? 'bg-emerald-600'
                                    : isOpen
                                      ? 'bg-emerald-500'
                                      : 'bg-[#d8d4cc]'
                                }`}
                                aria-label="Zahlung erfassen"
                                title="Zahlung erfassen"
                              >
                                <span
                                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                                    isPaid || isOpen ? 'left-6' : 'left-1'
                                  }`}
                                />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={8} className="bg-[#faf9f6] px-6 py-6">
                              <div className="grid gap-6 lg:grid-cols-2">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wider text-[#a18b65]">
                                    Zahlung erfassen
                                  </p>

                                  <h3 className="mt-2 text-lg font-semibold">
                                    {item.title}
                                  </h3>

                                  <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-[#e8e3d9] bg-white p-4">
                                      <p className="text-xs text-[#969189]">Bereits bezahlt</p>
                                      <p className="mt-1 font-semibold text-emerald-700">
                                        {euro(paid)}
                                      </p>
                                    </div>

                                    <div className="rounded-xl border border-[#e8e3d9] bg-white p-4">
                                      <p className="text-xs text-[#969189]">Noch offen</p>
                                      <p className="mt-1 font-semibold">
                                        {euro(remaining)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#e8e3d9]">
                                    <div
                                      className="h-full rounded-full bg-emerald-500 transition-all"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>

                                  <p className="mt-2 text-xs text-[#969189]">
                                    {percentage.toFixed(1)} % der Einnahme bezahlt
                                  </p>

                                  {isPaid ? (
                                    <p className="mt-5 text-sm font-medium text-emerald-700">
                                      Diese Einnahme ist vollständig bezahlt.
                                    </p>
                                  ) : (
                                    <>
                                      <p className="mt-5 text-sm font-medium">
                                        Welche Zahlung möchtest du erfassen?
                                      </p>

                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPaymentMode('partial')
                                            setPaymentValue('')
                                            setPaymentError('')
                                          }}
                                          className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                                            paymentMode === 'partial'
                                              ? 'border-[#c5a46d] bg-[#f1e9d9] text-[#755d36]'
                                              : 'border-[#e2ddd3] bg-white text-[#55514b] hover:bg-[#f5f3ee]'
                                          }`}
                                        >
                                          Teilzahlung
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPaymentMode('full')
                                            setPaymentValue('')
                                            setPaymentError('')
                                          }}
                                          className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                                            paymentMode === 'full'
                                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                              : 'border-[#e2ddd3] bg-white text-[#55514b] hover:bg-[#f5f3ee]'
                                          }`}
                                        >
                                          Gesamtbetrag bezahlen
                                        </button>
                                      </div>

                                      {paymentMode === 'partial' && (
                                        <div className="mt-4 rounded-xl border border-[#e8e3d9] bg-white p-4">
                                          <p className="text-sm font-medium">
                                            Höhe der Teilzahlung
                                          </p>

                                          <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setInputMode('euro')
                                                setPaymentValue('')
                                              }}
                                              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                                                inputMode === 'euro'
                                                  ? 'bg-[#242424] text-white'
                                                  : 'bg-[#f5f3ee] text-[#77736c]'
                                              }`}
                                            >
                                              Euro (€)
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                setInputMode('percent')
                                                setPaymentValue('')
                                              }}
                                              className={`rounded-lg px-3 py-2 text-xs font-medium ${
                                                inputMode === 'percent'
                                                  ? 'bg-[#242424] text-white'
                                                  : 'bg-[#f5f3ee] text-[#77736c]'
                                              }`}
                                            >
                                              Prozent (%)
                                            </button>
                                          </div>

                                          <div className="mt-3 flex gap-2">
                                            <input
                                              type="number"
                                              min="0"
                                              max={inputMode === 'percent' ? 100 : remaining}
                                              step={inputMode === 'percent' ? '0.1' : '0.01'}
                                              value={paymentValue}
                                              onChange={(event) =>
                                                setPaymentValue(event.target.value)
                                              }
                                              placeholder={inputMode === 'percent' ? 'z. B. 30' : 'z. B. 500'}
                                              className="min-w-0 flex-1 rounded-lg border border-[#ddd7cc] bg-white px-4 py-3 text-sm outline-none focus:border-[#c5a46d]"
                                            />

                                            <button
                                              type="button"
                                              disabled={savingPayment}
                                              onClick={() => savePayment(item)}
                                              className="rounded-lg bg-[#242424] px-5 py-3 text-sm font-medium text-[#e0c99e] transition hover:bg-[#363636] disabled:opacity-50"
                                            >
                                              {savingPayment ? 'Speichert ...' : 'Zahlung speichern'}
                                            </button>
                                          </div>

                                          {paymentValue && Number(paymentValue) > 0 && (
                                            <p className="mt-3 text-xs text-[#77736c]">
                                              Voraussichtlicher Zahlungseingang:{' '}
                                              <strong>
                                                {euro(
                                                  inputMode === 'percent'
                                                    ? remaining * Number(paymentValue.replace(',', '.')) / 100
                                                    : Number(paymentValue.replace(',', '.'))
                                                )}
                                              </strong>
                                            </p>
                                          )}
                                        </div>
                                      )}

                                      {paymentMode === 'full' && (
                                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                                          <p className="text-sm text-emerald-800">
                                            Der noch offene Restbetrag von{' '}
                                            <strong>{euro(remaining)}</strong> wird als Zahlung erfasst.
                                          </p>

                                          <button
                                            type="button"
                                            disabled={savingPayment}
                                            onClick={() => savePayment(item)}
                                            className="mt-4 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
                                          >
                                            {savingPayment ? 'Speichert ...' : 'Gesamtzahlung bestätigen'}
                                          </button>
                                        </div>
                                      )}

                                      {paymentError && (
                                        <p className="mt-3 text-sm text-red-600">
                                          {paymentError}
                                        </p>
                                      )}
                                    </>
                                  )}
                                </div>

                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wider text-[#a18b65]">
                                    Zahlungshistorie
                                  </p>

                                  <h3 className="mt-2 text-lg font-semibold">
                                    Bisherige Zahlungseingänge
                                  </h3>

                                  {history.length === 0 ? (
                                    <p className="mt-4 rounded-xl border border-dashed border-[#ddd7cc] bg-white p-5 text-sm text-[#969189]">
                                      Für diese Einnahme wurden noch keine Zahlungen erfasst.
                                    </p>
                                  ) : (
                                    <div className="mt-4 space-y-2">
                                      {history.map((payment) => (
                                        <div
                                          key={payment.id}
                                          className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e3d9] bg-white px-4 py-3"
                                        >
                                          <div>
                                            <p className="text-sm font-medium text-[#292929]">
                                              Zahlungseingang
                                            </p>
                                            <p className="mt-1 text-xs text-[#969189]">
                                              {paymentDateFormat(payment.paid_at)}
                                            </p>
                                          </div>

                                          <p className="whitespace-nowrap text-sm font-semibold text-emerald-700">
                                            + {euro(Number(payment.amount))}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
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
