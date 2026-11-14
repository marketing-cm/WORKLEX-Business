'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Booking = {
  id: string
  title: string
  customer_name?: string | null
  invoice_date: string
  net_amount: number
  vat_amount: number
  gross_amount: number
  category?: string
}

type RevenuePayment = {
  id: string
  revenue_id: string
  amount: number
  paid_at: string
}

type DashboardBooking = Booking & {
  type: 'Einnahme' | 'Ausgabe'
}

const euro = (value: number) =>
  new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value || 0)

const dateFormat = (value: string) =>
  new Date(value + 'T00:00:00').toLocaleDateString('de-AT')

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100

type WeatherSnapshot = {
  temperature: number
  apparentTemperature: number
  description: string
  icon: string
  isDay: boolean
  city: string
  mapUrl: string
}

function describeWeather(code: number, isDay: boolean) {
  if (code === 0) return { description: 'Klarer Himmel', icon: isDay ? '☀️' : '🌙' }
  if (code === 1) return { description: 'Überwiegend klar', icon: isDay ? '🌤️' : '🌙' }
  if (code === 2) return { description: 'Teilweise bewölkt', icon: '⛅' }
  if (code === 3) return { description: 'Bedeckt', icon: '☁️' }
  if ([45, 48].includes(code)) return { description: 'Nebelig', icon: '🌫️' }
  if ([51, 53, 55, 56, 57].includes(code)) return { description: 'Nieselregen', icon: '🌦️' }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { description: 'Regen', icon: '🌧️' }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { description: 'Schnee', icon: '❄️' }
  if ([95, 96, 99].includes(code)) return { description: 'Gewitter', icon: '⛈️' }
  return { description: 'Wetter aktuell', icon: '🌤️' }
}

export default function DashboardPage() {
  const router = useRouter()

  const [companyName, setCompanyName] = useState('Mein Unternehmen')
  const [firstName, setFirstName] = useState('')
  const [companyLogoUrl, setCompanyLogoUrl] = useState('')
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [weatherError, setWeatherError] = useState('')
  const [revenues, setRevenues] = useState<Booking[]>([])
  const [costs, setCosts] = useState<Booking[]>([])
  const [payments, setPayments] = useState<RevenuePayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [activeRevenueId, setActiveRevenueId] = useState<string | null>(null)
  const [paymentMode, setPaymentMode] = useState<'partial' | 'full'>('partial')
  const [paymentUnit, setPaymentUnit] = useState<'euro' | 'percent'>('euro')
  const [paymentInput, setPaymentInput] = useState('')
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null)

  const loadCompanyWeather = useCallback(async (postalCode: string, city: string, country: string) => {
    if (!city.trim() || !country.trim()) return

    setWeatherLoading(true)
    setWeatherError('')

    try {
      const geocodingUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
      geocodingUrl.search = new URLSearchParams({
        name: city.trim(),
        count: '10',
        language: 'de',
        format: 'json',
      }).toString()

      const geocodingResponse = await fetch(geocodingUrl.toString())
      if (!geocodingResponse.ok) throw new Error('Standort konnte nicht gefunden werden.')

      const geocodingData = await geocodingResponse.json()
      const results = geocodingData.results || []
      const normalizedCountry = country.trim().toLocaleLowerCase('de-AT')
      const countryAliases: Record<string, string[]> = {
        'österreich': ['austria'],
        'schweiz': ['switzerland'],
        'deutschland': ['germany'],
      }
      const acceptedCountryNames = [
        normalizedCountry,
        ...(countryAliases[normalizedCountry] || []),
      ]
      const location =
        results.find((result: { country?: string }) =>
          acceptedCountryNames.includes((result.country || '').toLocaleLowerCase('de-AT'))
        ) || results[0]

      if (!location) throw new Error('Für diese Firmenadresse wurde kein Wetterstandort gefunden.')

      const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast')
      forecastUrl.search = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        current: 'temperature_2m,apparent_temperature,is_day,weather_code',
        timezone: 'auto',
      }).toString()

      const forecastResponse = await fetch(forecastUrl.toString())
      if (!forecastResponse.ok) throw new Error('Wetterdaten sind momentan nicht erreichbar.')

      const forecastData = await forecastResponse.json()
      const current = forecastData.current
      if (!current) throw new Error('Aktuelle Wetterdaten sind momentan nicht verfügbar.')

      const isDay = Number(current.is_day) === 1
      const condition = describeWeather(Number(current.weather_code), isDay)
      const latitude = Number(location.latitude)
      const longitude = Number(location.longitude)

      setWeather({
        temperature: Number(current.temperature_2m),
        apparentTemperature: Number(current.apparent_temperature),
        description: condition.description,
        icon: condition.icon,
        isDay,
        city: location.name || city,
        mapUrl: `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=11&size=640x240&markers=${latitude},${longitude},red-pushpin`,
      })
    } catch (weatherLoadError) {
      console.error('Wetter konnte nicht geladen werden:', weatherLoadError)
      setWeatherError(
        weatherLoadError instanceof Error
          ? weatherLoadError.message
          : 'Wetterdaten konnten nicht geladen werden.'
      )
    } finally {
      setWeatherLoading(false)
    }
  }, [])

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true)
      setError('')

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        router.replace('/')
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id, must_change_password, first_name')
        .eq('user_id', user.id)
        .single()

      if (profileError || !profile) {
        setError('Dein Unternehmensprofil konnte nicht geladen werden.')
        setLoading(false)
        return
      }

      setFirstName(profile.first_name || '')

      if (profile.must_change_password) {
        router.replace('/change-password')
        return
      }

      const companyId = profile.company_id

      const [
        companyResult,
        revenueResult,
        costResult,
        paymentResult,
      ] = await Promise.all([
        supabase
          .from('companies')
          .select('name, logo_path, setup_completed, postal_code, city, country')
          .eq('id', companyId)
          .single(),

        supabase
          .from('revenues')
          .select('id, title, customer_name, invoice_date, net_amount, vat_amount, gross_amount, category')
          .eq('company_id', companyId)
          .order('invoice_date', { ascending: false }),

        supabase
          .from('costs')
          .select('id, title, invoice_date, net_amount, vat_amount, gross_amount, category')
          .eq('company_id', companyId)
          .order('invoice_date', { ascending: false }),

        supabase
          .from('revenue_payments')
          .select('id, revenue_id, amount, paid_at')
          .order('paid_at', { ascending: false }),
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

      void loadCompanyWeather(
        companyResult.data.postal_code || '',
        companyResult.data.city || '',
        companyResult.data.country || ''
      )

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

      if (paymentResult.error) {
        console.error('Zahlungen konnten nicht geladen werden:', paymentResult.error.message)
        setError('Die Zahlungsinformationen konnten nicht geladen werden.')
      } else {
        setPayments((paymentResult.data || []) as RevenuePayment[])
      }

      setLoading(false)
    }

    loadDashboard()
  }, [router, loadCompanyWeather])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  const revenueVat = revenues.reduce(
    (sum, item) => sum + Number(item.vat_amount || 0),
    0
  )

  const costVat = costs.reduce(
    (sum, item) => sum + Number(item.vat_amount || 0),
    0
  )

  const vatBalance = revenueVat - costVat

  const allBookings: DashboardBooking[] = [
    ...revenues.map(item => ({ ...item, type: 'Einnahme' as const })),
    ...costs.map(item => ({ ...item, type: 'Ausgabe' as const })),
  ].sort(
    (a, b) =>
      new Date(b.invoice_date).getTime() -
      new Date(a.invoice_date).getTime()
  )

  const filteredBookings = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('de-AT')

    if (!query) return allBookings

    return allBookings.filter(item => {
      const searchableValues = [
        item.title,
        item.customer_name || '',
        item.type,
        item.category || '',
        item.invoice_date,
        dateFormat(item.invoice_date),
        String(item.net_amount),
        String(item.gross_amount),
        euro(Number(item.net_amount)),
        euro(Number(item.gross_amount)),
      ]

      return searchableValues.some(value =>
        value.toLocaleLowerCase('de-AT').includes(query)
      )
    })
  }, [allBookings, search])

  function getPaidAmount(revenueId: string) {
    return roundMoney(
      payments
        .filter(payment => payment.revenue_id === revenueId)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    )
  }

  function getOutstandingAmount(revenue: Booking) {
    return Math.max(
      0,
      roundMoney(Number(revenue.gross_amount || 0) - getPaidAmount(revenue.id))
    )
  }

  function getPaymentStatus(revenue: Booking) {
    const paid = getPaidAmount(revenue.id)
    const gross = Number(revenue.gross_amount || 0)

    if (paid >= gross - 0.005) return 'Vollständig bezahlt'
    if (paid > 0) return 'Teilweise bezahlt'
    return 'Noch offen'
  }

  function openPaymentPanel(revenueId: string) {
    if (activeRevenueId === revenueId) {
      setActiveRevenueId(null)
      return
    }

    setActiveRevenueId(revenueId)
    setPaymentMode('partial')
    setPaymentUnit('euro')
    setPaymentInput('')
  }

  async function savePayment(revenue: Booking) {
    const outstanding = getOutstandingAmount(revenue)

    if (outstanding <= 0) {
      setError('Diese Einnahme ist bereits vollständig bezahlt.')
      return
    }

    let amount = outstanding

    if (paymentMode === 'partial') {
      const inputValue = Number(paymentInput.replace(',', '.'))

      if (!Number.isFinite(inputValue) || inputValue <= 0) {
        setError('Bitte gib einen gültigen Zahlungsbetrag ein.')
        return
      }

      if (paymentUnit === 'percent') {
        if (inputValue > 100) {
          setError('Der Prozentsatz darf höchstens 100 % betragen.')
          return
        }

        amount = roundMoney(
          Number(revenue.gross_amount) * inputValue / 100
        )
      } else {
        amount = roundMoney(inputValue)
      }

      if (amount <= 0) {
        setError('Der Zahlungsbetrag muss größer als 0 € sein.')
        return
      }

      if (amount > outstanding + 0.005) {
        setError(
          `Der Betrag ist höher als der noch offene Restbetrag von ${euro(outstanding)}.`
        )
        return
      }
    }

    setSavingPaymentId(revenue.id)
    setError('')

    const { error: paymentError } = await supabase.rpc(
      'record_revenue_payment',
      {
        p_revenue_id: revenue.id,
        p_amount: amount,
      }
    )

    if (paymentError) {
      setError(paymentError.message || 'Die Zahlung konnte nicht gespeichert werden.')
      setSavingPaymentId(null)
      return
    }

    const { data: updatedPayments, error: refreshError } = await supabase
      .from('revenue_payments')
      .select('id, revenue_id, amount, paid_at')
      .order('paid_at', { ascending: false })

    if (refreshError) {
      setError('Die Zahlung wurde gespeichert, aber die Übersicht konnte nicht aktualisiert werden. Bitte lade die Seite neu.')
    } else {
      setPayments((updatedPayments || []) as RevenuePayment[])
      setActiveRevenueId(null)
      setPaymentInput('')
    }

    setSavingPaymentId(null)
  }

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
            {new Date().getHours() < 12
              ? 'Guten Morgen'
              : new Date().getHours() < 18
                ? 'Guten Tag'
                : 'Guten Abend'}
          </p>

          <h1 className="text-3xl sm:text-4xl font-light">
            Herzlich willkommen{firstName ? `, ${firstName}` : ''}!
          </h1>

          <div className="flex items-center gap-4 mt-4">
            {companyLogoUrl && (
              <img
                src={companyLogoUrl}
                alt={`${companyName} Logo`}
                className="h-16 w-16 rounded-xl bg-white border border-[#e8e3d9] p-2 object-contain"
              />
            )}

            <div>
              <p className="text-lg font-medium">{companyName}</p>
              <p className="text-sm text-gray-500 mt-1">
                Deine finanzielle Übersicht auf einen Blick.
              </p>
            </div>
          </div>
        </div>

        {/* Firmenstandort und aktuelles Wetter */}
        <section className="mb-8 overflow-hidden rounded-2xl border border-[#e8e3d9] bg-[#242424] text-white shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-col justify-center p-6 sm:p-7">
              <p className="text-xs uppercase tracking-[0.22em] text-[#d6bd91]">
                Wetter am Unternehmensstandort
              </p>

              {weatherLoading ? (
                <p className="mt-4 text-sm text-white/65">Wetterdaten werden geladen ...</p>
              ) : weather ? (
                <>
                  <div className="mt-3 flex items-center gap-4">
                    <span className="text-5xl" aria-hidden="true">{weather.icon}</span>
                    <div>
                      <p className="text-4xl font-light tabular-nums">
                        {Math.round(weather.temperature)}°
                      </p>
                      <p className="mt-1 text-sm text-white/75">{weather.description}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-white/55">
                    <span>📍 {weather.city}</span>
                    <span>Gefühlt {Math.round(weather.apparentTemperature)}°</span>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-white/65">
                  {weatherError || 'Hinterlege im Unternehmensprofil eine vollständige Adresse, um das lokale Wetter zu sehen.'}
                </p>
              )}
              <p className="mt-5 text-[11px] text-white/35">
                Wetterdaten: Open-Meteo
              </p>
            </div>

            <div className="relative min-h-[170px] bg-[#343434]">
              {weather ? (
                <img
                  src={weather.mapUrl}
                  alt={`Kartenansicht des Standorts ${weather.city}`}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full min-h-[170px] items-center justify-center px-6 text-center text-sm text-white/40">
                  <span>Die Standortkarte erscheint, sobald die Adresse gefunden wurde.</span>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#242424]/35 via-transparent to-transparent" />
            </div>
          </div>
        </section>

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

        {/* Alle Buchungen */}
        <section className="bg-white rounded-2xl border border-[#e8e3d9] overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium">Alle Buchungen</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Einnahmen, Ausgaben und Zahlungsstände auf einen Blick
                </p>
              </div>

              <div className="text-xs text-gray-400">
                {filteredBookings.length} von {allBookings.length} Buchungen
              </div>
            </div>

            <div className="relative mt-5">
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Suchen nach Name, Datum oder Betrag ..."
                className="w-full rounded-xl border border-[#e8e3d9] bg-[#faf9f6] px-4 py-3 pl-11 text-sm outline-none transition focus:border-[#b69b6b] focus:ring-2 focus:ring-[#d6bd91]/20"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                ⌕
              </span>

              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#8b744d] hover:text-[#292929]"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
          </div>

          {filteredBookings.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <p className="text-lg font-light">
                {allBookings.length === 0
                  ? 'Noch keine Buchungen vorhanden.'
                  : 'Keine passenden Buchungen gefunden.'}
              </p>
              <p className="text-sm mt-2">
                {allBookings.length === 0
                  ? 'Deine ersten Einnahmen und Ausgaben erscheinen hier.'
                  : 'Versuche einen anderen Suchbegriff.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-[#faf9f6] text-gray-500">
                  <tr>
                    <th className="text-left p-4 font-normal">Datum</th>
                    <th className="text-left p-4 font-normal">Bezeichnung</th>
                    <th className="text-left p-4 font-normal">Art</th>
                    <th className="text-right p-4 font-normal">Netto</th>
                    <th className="text-right p-4 font-normal">Brutto</th>
                    <th className="text-center p-4 font-normal">Zahlungsstatus</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredBookings.map(item => {
                    const isRevenue = item.type === 'Einnahme'
                    const paid = isRevenue ? getPaidAmount(item.id) : 0
                    const outstanding = isRevenue
                      ? getOutstandingAmount(item)
                      : 0
                    const status = isRevenue
                      ? getPaymentStatus(item)
                      : ''
                    const isOpen = activeRevenueId === item.id
                    const revenuePayments = isRevenue
                      ? payments.filter(payment => payment.revenue_id === item.id)
                      : []

                    const partialValue = Number(paymentInput.replace(',', '.'))
                    const calculatedPartial = paymentUnit === 'percent'
                      ? roundMoney(Number(item.gross_amount) * partialValue / 100)
                      : roundMoney(partialValue)

                    const paymentIsValid =
                      paymentMode === 'full'
                        ? outstanding > 0
                        : Number.isFinite(partialValue) &&
                          partialValue > 0 &&
                          (paymentUnit === 'percent'
                            ? partialValue <= 100 && calculatedPartial <= outstanding + 0.005
                            : calculatedPartial <= outstanding + 0.005)

                    return (
                      <Fragment key={`${item.type}-${item.id}`}>
                        <tr className="border-t border-gray-100 hover:bg-[#fcfbf8]">
                          <td className="p-4 whitespace-nowrap text-gray-500">
                            {dateFormat(item.invoice_date)}
                          </td>

                          <td className="p-4">
                            <div className="font-medium">{item.title}</div>
                            {isRevenue && item.customer_name && (
                              <div className="text-xs text-gray-400 mt-1">
                                {item.customer_name}
                              </div>
                            )}
                          </td>

                          <td className="p-4">
                            <span className={isRevenue ? 'text-green-700' : 'text-gray-500'}>
                              {item.type}
                            </span>
                          </td>

                          <td className="p-4 text-right whitespace-nowrap">
                            {euro(Number(item.net_amount))}
                          </td>

                          <td className="p-4 text-right whitespace-nowrap font-medium">
                            {euro(Number(item.gross_amount))}
                          </td>

                          <td className="p-4">
                            {isRevenue ? (
                              <div className="flex items-center justify-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => openPaymentPanel(item.id)}
                                  aria-label={`Zahlungsdetails für ${item.title} öffnen`}
                                  aria-pressed={isOpen}
                                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#b69b6b] focus:ring-offset-2 ${
                                    isOpen || paid > 0
                                      ? 'bg-green-600'
                                      : 'bg-gray-300'
                                  }`}
                                >
                                  <span
                                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                                      isOpen || paid > 0
                                        ? 'translate-x-5'
                                        : 'translate-x-1'
                                    }`}
                                  />
                                </button>

                                <div className="min-w-[125px]">
                                  <div className={`text-xs font-medium ${
                                    status === 'Vollständig bezahlt'
                                      ? 'text-green-700'
                                      : status === 'Teilweise bezahlt'
                                        ? 'text-amber-700'
                                        : 'text-gray-500'
                                  }`}>
                                    {status}
                                  </div>
                                  <div className="text-[11px] text-gray-400 mt-1">
                                    {paid > 0
                                      ? `${euro(paid)} bezahlt`
                                      : `${euro(outstanding)} offen`}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center text-gray-300">—</div>
                            )}
                          </td>
                        </tr>

                        {isRevenue && isOpen && (
                          <tr className="border-t border-[#eee8dc] bg-[#faf9f6]">
                            <td colSpan={6} className="p-5 sm:p-6">
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div>
                                  <h3 className="font-medium text-[#292929]">
                                    Zahlung erfassen
                                  </h3>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {item.title} · Rechnungsbetrag {euro(Number(item.gross_amount))}
                                  </p>

                                  <div className="grid grid-cols-2 gap-2 mt-4">
                                    <button
                                      type="button"
                                      onClick={() => setPaymentMode('partial')}
                                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                                        paymentMode === 'partial'
                                          ? 'bg-[#242424] text-[#e0c99e] border-[#242424]'
                                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#b69b6b]'
                                      }`}
                                    >
                                      Teilzahlung
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setPaymentMode('full')}
                                      className={`rounded-lg border px-3 py-2 text-sm transition ${
                                        paymentMode === 'full'
                                          ? 'bg-[#242424] text-[#e0c99e] border-[#242424]'
                                          : 'bg-white text-gray-600 border-gray-200 hover:border-[#b69b6b]'
                                      }`}
                                    >
                                      Rest vollständig bezahlt
                                    </button>
                                  </div>

                                  {paymentMode === 'partial' ? (
                                    <div className="mt-4">
                                      <div className="flex gap-2 mb-3">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPaymentUnit('euro')
                                            setPaymentInput('')
                                          }}
                                          className={`rounded-lg px-3 py-1.5 text-xs border ${
                                            paymentUnit === 'euro'
                                              ? 'border-[#b69b6b] text-[#80683f] bg-[#f5efe3]'
                                              : 'border-gray-200 text-gray-500 bg-white'
                                          }`}
                                        >
                                          Euro-Betrag
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPaymentUnit('percent')
                                            setPaymentInput('')
                                          }}
                                          className={`rounded-lg px-3 py-1.5 text-xs border ${
                                            paymentUnit === 'percent'
                                              ? 'border-[#b69b6b] text-[#80683f] bg-[#f5efe3]'
                                              : 'border-gray-200 text-gray-500 bg-white'
                                          }`}
                                        >
                                          Prozent
                                        </button>
                                      </div>

                                      <div className="relative">
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={paymentInput}
                                          onChange={event => setPaymentInput(event.target.value)}
                                          placeholder={paymentUnit === 'euro' ? 'z. B. 250,00' : 'z. B. 30'}
                                          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 pr-12 text-sm outline-none focus:border-[#b69b6b]"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                                          {paymentUnit === 'euro' ? '€' : '%'}
                                        </span>
                                      </div>

                                      {paymentInput && Number.isFinite(partialValue) && partialValue > 0 && (
                                        <p className="text-xs text-gray-500 mt-2">
                                          Geplanter Zahlungseingang: {euro(calculatedPartial)}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="mt-4 rounded-lg border border-green-100 bg-green-50 p-4">
                                      <p className="text-xs text-green-800">
                                        Es wird nur noch der offene Restbetrag erfasst:
                                      </p>
                                      <p className="text-xl font-medium text-green-800 mt-1">
                                        {euro(outstanding)}
                                      </p>
                                    </div>
                                  )}

                                  <div className="flex flex-wrap items-center gap-3 mt-4">
                                    <button
                                      type="button"
                                      onClick={() => savePayment(item)}
                                      disabled={!paymentIsValid || savingPaymentId === item.id}
                                      className="rounded-lg bg-green-700 px-5 py-2.5 text-sm text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {savingPaymentId === item.id
                                        ? 'Wird gespeichert ...'
                                        : 'Zahlung speichern'}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setActiveRevenueId(null)}
                                      className="rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:text-gray-800"
                                    >
                                      Schließen
                                    </button>
                                  </div>
                                </div>

                                <div>
                                  <h3 className="font-medium text-[#292929]">
                                    Zahlungsübersicht
                                  </h3>

                                  <div className="grid grid-cols-2 gap-3 mt-4">
                                    <div className="rounded-xl bg-white border border-gray-100 p-4">
                                      <p className="text-xs text-gray-400">Bereits bezahlt</p>
                                      <p className="text-lg font-medium text-green-700 mt-1">
                                        {euro(paid)}
                                      </p>
                                    </div>

                                    <div className="rounded-xl bg-white border border-gray-100 p-4">
                                      <p className="text-xs text-gray-400">Noch offen</p>
                                      <p className="text-lg font-medium text-[#8b744d] mt-1">
                                        {euro(outstanding)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-4">
                                    <div
                                      className="h-full rounded-full bg-green-600 transition-all"
                                      style={{
                                        width: `${Number(item.gross_amount) > 0
                                          ? Math.min(100, paid / Number(item.gross_amount) * 100)
                                          : 0}%`,
                                      }}
                                    />
                                  </div>

                                  <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                                    <span>Zahlungsfortschritt</span>
                                    <span>
                                      {Number(item.gross_amount) > 0
                                        ? `${Math.min(100, Math.round(paid / Number(item.gross_amount) * 100))} %`
                                        : '0 %'}
                                    </span>
                                  </div>

                                  <div className="mt-5">
                                    <h4 className="text-xs font-medium text-gray-600 mb-2">
                                      Zahlungshistorie
                                    </h4>

                                    {revenuePayments.length === 0 ? (
                                      <p className="text-xs text-gray-400 bg-white rounded-lg border border-gray-100 p-3">
                                        Für diese Einnahme wurden noch keine Zahlungen erfasst.
                                      </p>
                                    ) : (
                                      <div className="space-y-2 max-h-36 overflow-y-auto">
                                        {revenuePayments.map(payment => (
                                          <div
                                            key={payment.id}
                                            className="flex items-center justify-between gap-3 rounded-lg bg-white border border-gray-100 px-3 py-2"
                                          >
                                            <span className="text-xs text-gray-500">
                                              {new Date(payment.paid_at).toLocaleDateString('de-AT')}
                                            </span>
                                            <span className="text-sm font-medium text-green-700">
                                              {euro(Number(payment.amount))}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
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

        <p className="text-xs text-gray-400 text-center mt-8">
          WORKLEX · Deine Unternehmenszahlen · Alle Beträge sind vorläufige Übersichten und keine Steuerberechnung.
        </p>
      </div>
    </main>
  )
}