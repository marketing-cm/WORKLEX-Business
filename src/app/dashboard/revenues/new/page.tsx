
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type InvoiceType =
  | 'domestic_vat'
  | 'intra_community_supply'
  | 'reverse_charge'
  | 'other_tax_exempt'

export default function NewRevenuePage() {
  const router = useRouter()

  const [editId, setEditId] = useState<string | null>(null)
  const [customer, setCustomer] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Dienstleistung')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('gross')
  const [vatRate, setVatRate] = useState('20')
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('domestic_vat')
  const [skontoEnabled, setSkontoEnabled] = useState(false)
  const [skontoPercent, setSkontoPercent] = useState('2')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [existingReceipt, setExistingReceipt] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadExisting = async () => {
      const id = new URLSearchParams(window.location.search).get('id')

      if (!id) {
        setInitialLoading(false)
        return
      }

      setEditId(id)

      const { data, error } = await supabase
        .from('revenues')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        setMessage('Der Eintrag konnte nicht geladen werden.')
        setInitialLoading(false)
        return
      }

      setCustomer(data.customer_name || '')
      setTitle(data.title || '')
      setCategory(data.category || 'Sonstiges')
      setDate(data.invoice_date || '')
      setVatRate(String(data.vat_rate ?? 20))
      setInvoiceType(data.invoice_type || 'domestic_vat')
      setSkontoEnabled(Boolean(data.skonto_enabled))
      setSkontoPercent(String(data.skonto_percent ?? 0))
      setAmount(String(data.gross_amount ?? ''))
      setMode('gross')
      setNotes(data.notes || '')
      setExistingReceipt(data.receipt_path || '')
      setInitialLoading(false)
    }

    loadExisting()
  }, [])

  const numericAmount = Number(amount) || 0
  const rate = Number(vatRate) || 0

  const effectiveRate =
    invoiceType === 'domestic_vat' ? rate : 0

  const gross =
    mode === 'gross'
      ? numericAmount
      : numericAmount * (1 + effectiveRate / 100)

  const net =
    mode === 'gross'
      ? numericAmount / (1 + effectiveRate / 100)
      : numericAmount

  const vat = gross - net

  const skontoBasis = invoiceType === 'domestic_vat' ? 'gross' : 'net'

  const skontoValue = Number(skontoPercent.replace(',', '.')) || 0

  const euro = (value: number) =>
    value.toLocaleString('de-AT', {
      style: 'currency',
      currency: 'EUR',
    })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    if (skontoEnabled && (skontoValue <= 0 || skontoValue > 100)) {
      setMessage('Bitte gib einen gültigen Skontosatz zwischen 0 und 100 % ein.')
      setLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.replace('/')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single()

    if (profileError || !profile) {
      setMessage('Dein Unternehmensprofil konnte nicht geladen werden.')
      setLoading(false)
      return
    }

    const companyId = profile.company_id

    const values = {
      customer_name: customer || null,
      title,
      category,
      invoice_date: date,
      net_amount: Number(net.toFixed(2)),
      vat_rate: effectiveRate,
      vat_amount: Number(vat.toFixed(2)),
      gross_amount: Number(gross.toFixed(2)),
      invoice_type: invoiceType,
      skonto_enabled: skontoEnabled,
      skonto_percent: skontoEnabled ? skontoValue : 0,
      skonto_basis: skontoBasis,
      notes: notes || null,
      updated_by: user.id,
    }

    let savedId = editId

    if (editId) {
      const { error } = await supabase
        .from('revenues')
        .update(values)
        .eq('id', editId)
        .eq('company_id', companyId)

      if (error) {
        setMessage('Änderungen konnten nicht gespeichert werden: ' + error.message)
        setLoading(false)
        return
      }
    } else {
      const { data: saved, error } = await supabase
        .from('revenues')
        .insert({
          ...values,
          company_id: companyId,
          created_by: user.id,
        })
        .select('id')
        .single()

      if (error || !saved) {
        setMessage('Einnahme konnte nicht gespeichert werden: ' + (error?.message || 'Unbekannter Fehler'))
        setLoading(false)
        return
      }

      savedId = saved.id
    }

    if (receipt && savedId) {
      const safeName = receipt.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${companyId}/revenues/${savedId}/${Date.now()}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('worklex-receipts')
        .upload(path, receipt)

      if (uploadError) {
        setMessage('Eintrag gespeichert, aber Beleg-Upload fehlgeschlagen: ' + uploadError.message)
        setLoading(false)
        return
      }

      const { error: updateError } = await supabase
        .from('revenues')
        .update({ receipt_path: path })
        .eq('id', savedId)
        .eq('company_id', companyId)

      if (updateError) {
        setMessage('Eintrag gespeichert, aber Belegzuordnung fehlgeschlagen: ' + updateError.message)
        setLoading(false)
        return
      }
    }

    router.push('/dashboard/revenues')
    router.refresh()
  }

  const inputClass =
    'w-full rounded-xl border border-[#e5e0d6] bg-white px-4 py-3 text-[#292929] outline-none transition focus:border-[#b49a6b] focus:ring-2 focus:ring-[#b49a6b]/10'

  const labelClass =
    'mb-2 block text-sm font-medium text-gray-600'

  if (initialLoading) {
    return (
      <main className="min-h-screen bg-[#f5f3ee] flex items-center justify-center text-[#8b744d]">
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
              <p className="text-sm text-white/70">Finanzverwaltung</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="text-sm text-[#d6bd91] hover:text-white transition"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-5 py-10">
        <div className="mb-8">
          <p className="text-xs tracking-[0.25em] text-[#a18b65] uppercase mb-2">
            Finanzverwaltung · Einnahmen
          </p>

          <h1 className="text-3xl sm:text-4xl font-light">
            {editId ? 'Einnahme bearbeiten' : 'Neue Einnahme erfassen'}
          </h1>

          <p className="text-sm text-gray-500 mt-2">
            {editId
              ? 'Bearbeite die gespeicherten Buchungsdaten.'
              : 'Erfasse eine Rechnung oder einen Zahlungseingang.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-lg font-medium">Angaben zur Einnahme</h2>
              <p className="text-xs text-gray-400 mt-1">
                Kunde, Bezeichnung und Rechnungsdatum
              </p>
            </div>

            <div>
              <label className={labelClass}>Kunde / Auftraggeber</label>
              <input
                value={customer}
                onChange={e => setCustomer(e.target.value)}
                className={inputClass}
                placeholder="Name des Kunden"
              />
            </div>

            <div>
              <label className={labelClass}>Bezeichnung *</label>
              <input
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                className={inputClass}
                placeholder="z. B. Beratung, Rechnung Nr. 001"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Kategorie</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className={inputClass}
                >
                  <option>Dienstleistung</option>
                  <option>Warenverkauf</option>
                  <option>Beratung</option>
                  <option>Provision</option>
                  <option>Sonstiges</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Rechnungsdatum *</label>
                <input
                  required
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-lg font-medium">Rechnungsart und Umsatzsteuer</h2>
              <p className="text-xs text-gray-400 mt-1">
                Die ausgewählte Steuerart bestimmt die Umsatzsteuer- und Skontoberechnung.
              </p>
            </div>

            <div>
              <label className={labelClass}>Rechnungsart *</label>
              <select
                value={invoiceType}
                onChange={e => setInvoiceType(e.target.value as InvoiceType)}
                className={inputClass}
              >
                <option value="domestic_vat">
                  Inland – normale Rechnung mit Umsatzsteuer
                </option>
                <option value="intra_community_supply">
                  EU-Ausland – innergemeinschaftliche Lieferung
                </option>
                <option value="reverse_charge">
                  EU-Ausland – Reverse Charge
                </option>
                <option value="other_tax_exempt">
                  Sonstige steuerfreie Rechnung
                </option>
              </select>
            </div>

            {invoiceType === 'domestic_vat' ? (
              <div>
                <label className={labelClass}>Umsatzsteuersatz</label>
                <select
                  value={vatRate}
                  onChange={e => setVatRate(e.target.value)}
                  className={inputClass}
                >
                  <option value="20">20 %</option>
                  <option value="13">13 %</option>
                  <option value="10">10 %</option>
                  <option value="0">0 %</option>
                </select>
              </div>
            ) : (
              <div className="rounded-xl border border-[#e8e3d9] bg-[#f8f6f1] p-4">
                <p className="text-sm font-medium text-[#755d36]">
                  Keine österreichische Umsatzsteuer wird berechnet.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  Die Beträge werden ohne Umsatzsteuer erfasst. Bitte wähle diese
                  Rechnungsart nur, wenn die steuerlichen Voraussetzungen erfüllt sind.
                </p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Betrag eingeben in</label>
                <select
                  value={mode}
                  onChange={e => setMode(e.target.value)}
                  className={inputClass}
                >
                  <option value="gross">Brutto</option>
                  <option value="net">Netto</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>
                  Betrag ({mode === 'gross' ? 'Brutto' : 'Netto'} in €) *
                </label>
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className={inputClass}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="bg-[#f8f6f1] border border-[#e8e3d9] rounded-xl p-5 space-y-3">
              <p className="text-xs tracking-wider text-[#a18b65] uppercase">
                Betragsübersicht
              </p>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Netto</span>
                <strong>{euro(net)}</strong>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Umsatzsteuer</span>
                <strong>{euro(vat)}</strong>
              </div>

              <div className="flex justify-between border-t border-[#ded6c8] pt-3">
                <span className="font-medium">Brutto</span>
                <strong className="text-lg text-[#8b744d]">{euro(gross)}</strong>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-lg font-medium">Skonto</h2>
              <p className="text-xs text-gray-400 mt-1">
                Hinterlege den Skontosatz für diese Rechnung.
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e8e3d9] p-4">
              <div>
                <p className="text-sm font-medium">Skonto ermöglichen</p>
                <p className="mt-1 text-xs text-gray-500">
                  Kann bei der Zahlung angewendet werden.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={skontoEnabled}
                onClick={() => setSkontoEnabled(!skontoEnabled)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                  skontoEnabled ? 'bg-emerald-600' : 'bg-[#d8d4cc]'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    skontoEnabled ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {skontoEnabled && (
              <div className="space-y-4 rounded-xl border border-[#e8e3d9] bg-[#faf9f6] p-5">
                <div>
                  <label className={labelClass}>Skontosatz in Prozent</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={skontoPercent}
                      onChange={e => setSkontoPercent(e.target.value)}
                      className={inputClass}
                      placeholder="z. B. 2"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                      %
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-[#e8e3d9] bg-white p-4">
                  <p className="text-xs uppercase tracking-wider text-[#a18b65]">
                    Berechnungsgrundlage
                  </p>
                  <p className="mt-2 font-semibold">
                    {skontoBasis === 'gross' ? 'Bruttobetrag' : 'Nettobetrag'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {skontoBasis === 'gross'
                      ? 'Bei einer normalen Rechnung mit Umsatzsteuerausweis wird das Skonto vom Brutto berechnet.'
                      : 'Bei dieser Rechnungsart wird das Skonto vom Netto berechnet.'}
                  </p>
                </div>

                {skontoValue > 0 && skontoValue <= 100 && (
                  <div className="flex items-center justify-between gap-3 border-t border-[#e8e3d9] pt-4">
                    <span className="text-sm text-gray-500">
                      Skonto bei vollständiger Zahlung
                    </span>
                    <strong className="text-lg text-emerald-700">
                      {euro(
                        (skontoBasis === 'gross' ? gross : net) *
                        skontoValue / 100
                      )}
                    </strong>
                  </div>
                )}
              </div>
            )}

            {!skontoEnabled && (
              <p className="text-xs text-gray-400">
                Für diese Rechnung wird kein Skonto angeboten.
              </p>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-lg font-medium">Weitere Angaben</h2>
              <p className="text-xs text-gray-400 mt-1">
                Notizen und Belege zur Buchung
              </p>
            </div>

            <div>
              <label className={labelClass}>Notizen</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Optionale Anmerkungen ..."
              />
            </div>

            <div>
              <label className={labelClass}>Beleg / Rechnung hochladen</label>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={e => setReceipt(e.target.files?.[0] || null)}
                className="w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#f5f3ee] file:px-4 file:py-2 file:text-sm file:text-[#8b744d] hover:file:bg-[#eee9df]"
              />

              {existingReceipt && !receipt && (
                <p className="text-xs text-green-700 mt-3">
                  ✓ Ein Beleg ist bereits hinterlegt und bleibt erhalten.
                </p>
              )}

              <p className="text-xs text-gray-400 mt-2">
                PDF oder Bilddatei
              </p>
            </div>
          </section>

          {message && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
              {message}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={loading || !amount || numericAmount <= 0}
              className="flex-1 bg-[#242424] text-[#e0c99e] rounded-xl py-4 font-medium hover:bg-[#363636] transition disabled:opacity-50"
            >
              {loading
                ? 'Wird gespeichert ...'
                : editId
                  ? 'Änderungen speichern'
                  : 'Einnahme speichern'}
            </button>

            <button
              type="button"
              onClick={() => router.push('/dashboard/revenues')}
              className="px-8 py-4 rounded-xl border border-[#d8c9aa] text-[#8b744d] hover:bg-[#faf8f3] transition"
            >
              Abbrechen
            </button>
          </div>
        </form>

        <p className="text-xs text-gray-400 text-center mt-8">
          WORKLEX · Deine Unternehmenszahlen
        </p>
      </div>
    </main>
  )
}
