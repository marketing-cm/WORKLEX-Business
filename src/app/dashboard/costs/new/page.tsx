'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function NewCostPage() {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Sonstiges')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [amountMode, setAmountMode] = useState<'gross' | 'net'>('gross')
  const [amount, setAmount] = useState('')
  const [vatRate, setVatRate] = useState('20')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const numericAmount = Number(amount) || 0
  const rate = Number(vatRate) / 100

  const netAmount = amountMode === 'gross'
    ? numericAmount / (1 + rate)
    : numericAmount

  const vatAmount = netAmount * rate
  const grossAmount = netAmount + vatAmount

  const euro = (value: number) =>
    new Intl.NumberFormat('de-AT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (!title.trim() || numericAmount <= 0) {
      setError('Bitte Bezeichnung und einen gültigen Betrag eingeben.')
      return
    }

    setSaving(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()

      if (authError || !authData.user) {
        throw new Error('Bitte melde dich erneut an.')
      }

      const userId = authData.user.id

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', userId)
        .single()

      if (profileError || !profile?.company_id) {
        throw new Error('Unternehmensprofil nicht gefunden.')
      }

      const { data: saved, error: insertError } = await supabase
        .from('costs')
        .insert({
          company_id: profile.company_id,
          title: title.trim(),
          category,
          invoice_date: invoiceDate,
          net_amount: Number(netAmount.toFixed(2)),
          vat_rate: Number(vatRate),
          vat_amount: Number(vatAmount.toFixed(2)),
          gross_amount: Number(grossAmount.toFixed(2)),
          notes: notes.trim() || null,
          created_by: userId,
          updated_by: userId,
        })
        .select('id')
        .single()

      if (insertError || !saved) {
        throw new Error(insertError?.message || 'Ausgabe konnte nicht gespeichert werden.')
      }

      if (receipt) {
        const safeName = receipt.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const filePath = `${profile.company_id}/costs/${saved.id}/${Date.now()}-${safeName}`

        const { error: uploadError } = await supabase.storage
          .from('worklex-receipts')
          .upload(filePath, receipt)

        if (uploadError) {
          throw new Error('Ausgabe wurde gespeichert, aber der Beleg-Upload ist fehlgeschlagen: ' + uploadError.message)
        }

        const { error: updateError } = await supabase
          .from('costs')
          .update({ receipt_path: filePath })
          .eq('id', saved.id)

        if (updateError) {
          throw new Error('Ausgabe gespeichert, aber Belegpfad konnte nicht hinterlegt werden.')
        }
      }

      router.push('/dashboard/costs')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.')
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#202226] px-4 py-8 text-[#f8f6f1] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="mb-5 text-sm text-[#c5a46d] hover:text-white"
        >
          ← Zurück
        </button>

        <h1 className="text-3xl font-semibold">Neue Ausgabe erfassen</h1>
        <p className="mb-8 mt-2 text-sm text-[#aaa]">
          Erfasse deine betrieblichen Ausgaben und lade den Beleg direkt hoch.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-[#414247] bg-[#292b30] p-5 sm:p-8">
          <div>
            <label className="mb-2 block text-sm text-[#ccc]">Bezeichnung *</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Büromaterial, Software, Telefon"
              className="w-full rounded-lg border border-[#505157] bg-[#202226] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-[#ccc]">Kategorie</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-[#505157] bg-[#202226] px-4 py-3 text-white"
              >
                <option>Sonstiges</option>
                <option>Büro & Verwaltung</option>
                <option>Software & IT</option>
                <option>Marketing & Werbung</option>
                <option>Telefon & Internet</option>
                <option>Fahrtkosten</option>
                <option>Reisekosten</option>
                <option>Wareneinkauf</option>
                <option>Miete & Betriebskosten</option>
                <option>Versicherungen</option>
                <option>Beratung & Dienstleistungen</option>
                <option>Arbeitsmittel</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#ccc]">Rechnungsdatum *</label>
              <input
                required
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full rounded-lg border border-[#505157] bg-[#202226] px-4 py-3 text-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-3 block text-sm text-[#ccc]">Betragseingabe</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAmountMode('gross')}
                className={`rounded-lg border px-4 py-3 text-sm ${amountMode === 'gross' ? 'border-[#c5a46d] bg-[#c5a46d] text-[#202226]' : 'border-[#505157] text-white'}`}
              >
                Bruttobetrag
              </button>
              <button
                type="button"
                onClick={() => setAmountMode('net')}
                className={`rounded-lg border px-4 py-3 text-sm ${amountMode === 'net' ? 'border-[#c5a46d] bg-[#c5a46d] text-[#202226]' : 'border-[#505157] text-white'}`}
              >
                Nettobetrag
              </button>
            </div>

            <label className="mb-2 block text-sm text-[#ccc]">
              {amountMode === 'gross' ? 'Bruttobetrag in €' : 'Nettobetrag in €'} *
            </label>
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-[#505157] bg-[#202226] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#ccc]">Umsatzsteuersatz</label>
            <select
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              className="w-full rounded-lg border border-[#505157] bg-[#202226] px-4 py-3 text-white"
            >
              <option value="20">20 %</option>
              <option value="13">13 %</option>
              <option value="10">10 %</option>
              <option value="0">0 %</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#414247] bg-[#202226] p-4 sm:gap-4">
            <div>
              <p className="text-xs text-[#aaa]">Netto</p>
              <p className="mt-2 text-sm font-semibold sm:text-lg">{euro(netAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-[#aaa]">Vorsteuer</p>
              <p className="mt-2 text-sm font-semibold text-[#c5a46d] sm:text-lg">{euro(vatAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-[#aaa]">Brutto</p>
              <p className="mt-2 text-sm font-semibold sm:text-lg">{euro(grossAmount)}</p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#ccc]">Notizen</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optionale zusätzliche Informationen ..."
              className="w-full rounded-lg border border-[#505157] bg-[#202226] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-[#ccc]">Beleg hochladen</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setReceipt(e.target.files?.[0] || null)}
              className="w-full text-sm text-[#bbb] file:mr-4 file:rounded-lg file:border-0 file:bg-[#414247] file:px-4 file:py-2 file:text-white"
            />
            {receipt && (
              <p className="mt-2 text-xs text-[#c5a46d]">{receipt.name}</p>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-[#414247] pt-5">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="rounded-lg border border-[#505157] px-5 py-3 text-sm text-white hover:bg-[#414247]"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#c5a46d] px-6 py-3 text-sm font-semibold text-[#202226] hover:bg-[#d8bd91] disabled:opacity-50"
            >
              {saving ? 'Wird gespeichert ...' : 'Ausgabe speichern'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
