
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Revenue = {
  id: string
  customer_name: string | null
  title: string
  category: string | null
  invoice_date: string
  net_amount: number
  vat_rate: number | null
  vat_amount: number
  gross_amount: number
  invoice_type: string | null
  skonto_enabled: boolean | null
  skonto_percent: number | null
  skonto_basis: string | null
  notes: string | null
  receipt_path: string | null
}

type Payment = {
  id: string
  amount: number
  invoice_amount?: number | null
  skonto_amount?: number | null
  received_amount?: number | null
  payment_method?: string | null
  paid_at: string
}

type Document = {
  id: string
  document_type: 'invoice' | 'payment_proof'
  file_name: string
  file_path: string
  content_type: string | null
  file_size: number | null
  created_at: string
}

const euro = (value: number) =>
  Number(value || 0).toLocaleString('de-AT', {
    style: 'currency',
    currency: 'EUR',
  })

const dateFormat = (value: string) =>
  value
    ? new Date(value + (value.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('de-AT')
    : '–'

const invoiceLabels: Record<string, string> = {
  domestic_vat: 'Inland – Rechnung mit Umsatzsteuer',
  intra_community_supply: 'EU-Ausland – innergemeinschaftliche Lieferung',
  reverse_charge: 'Reverse Charge',
  other_tax_exempt: 'Sonstige steuerfreie Rechnung',
}

export default function RevenueDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [revenue, setRevenue] = useState<Revenue | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})

  async function loadData() {
    setLoading(true)
    setMessage('')

    const { data: revenueData, error: revenueError } = await supabase
      .from('revenues')
      .select('*')
      .eq('id', id)
      .single()

    if (revenueError || !revenueData) {
      setMessage('Die Einnahme konnte nicht geladen werden.')
      setLoading(false)
      return
    }

    setRevenue(revenueData as Revenue)

    const { data: paymentData, error: paymentError } = await supabase
      .from('revenue_payments')
      .select('*')
      .eq('revenue_id', id)
      .order('paid_at', { ascending: false })

    if (paymentError) {
      setMessage('Zahlungen konnten nicht geladen werden: ' + paymentError.message)
    } else {
      setPayments((paymentData || []) as Payment[])
    }

    const { data: documentData, error: documentError } = await supabase
      .from('revenue_documents')
      .select('*')
      .eq('revenue_id', id)
      .order('created_at', { ascending: false })

    if (documentError) {
      setMessage('Dokumente konnten nicht geladen werden: ' + documentError.message)
    } else {
      const docs = (documentData || []) as Document[]
      setDocuments(docs)

      const urls: Record<string, string> = {}

      for (const doc of docs) {
        const { data } = await supabase.storage
          .from('worklex-receipts')
          .createSignedUrl(doc.file_path, 300)

        if (data?.signedUrl) {
          urls[doc.id] = data.signedUrl
        }
      }

      setSignedUrls(urls)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (id) loadData()
  }, [id])

  async function uploadDocuments(
    event: React.ChangeEvent<HTMLInputElement>,
    documentType: 'invoice' | 'payment_proof'
  ) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''

    if (!files.length || !revenue) return

    setUploading(true)
    setMessage('')

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
      setMessage('Unternehmensprofil konnte nicht geladen werden.')
      setUploading(false)
      return
    }

    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        setMessage(`${file.name}: Nur PDF, JPG, PNG und WEBP sind erlaubt.`)
        continue
      }

      if (file.size > 15 * 1024 * 1024) {
        setMessage(`${file.name}: Die Datei darf maximal 15 MB groß sein.`)
        continue
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const folder = documentType === 'invoice' ? 'invoices' : 'payment-proofs'
      const path = `${profile.company_id}/revenue/${id}/${folder}/${crypto.randomUUID()}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('worklex-receipts')
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        setMessage(`Upload von ${file.name} fehlgeschlagen: ${uploadError.message}`)
        continue
      }

      const { error: insertError } = await supabase
        .from('revenue_documents')
        .insert({
          company_id: profile.company_id,
          revenue_id: id,
          document_type: documentType,
          file_name: file.name,
          file_path: path,
          content_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
        })

      if (insertError) {
        await supabase.storage
          .from('worklex-receipts')
          .remove([path])

        setMessage(`Zuordnung von ${file.name} fehlgeschlagen: ${insertError.message}`)
      }
    }

    await loadData()
    setUploading(false)
  }

  async function deleteDocument(doc: Document) {
    const confirmed = window.confirm(
      `Möchtest du "${doc.file_name}" wirklich löschen?`
    )

    if (!confirmed) return

    setMessage('')

    const { error: storageError } = await supabase.storage
      .from('worklex-receipts')
      .remove([doc.file_path])

    if (storageError) {
      setMessage('Datei konnte nicht gelöscht werden: ' + storageError.message)
      return
    }

    const { error: deleteError } = await supabase
      .from('revenue_documents')
      .delete()
      .eq('id', doc.id)
      .eq('revenue_id', id)

    if (deleteError) {
      setMessage('Dokumenteintrag konnte nicht gelöscht werden: ' + deleteError.message)
      return
    }

    await loadData()
  }

  const invoiceDocuments = documents.filter(d => d.document_type === 'invoice')
  const proofDocuments = documents.filter(d => d.document_type === 'payment_proof')

  const paidTotal = payments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  )

  const outstanding = Math.max(
    0,
    Number(revenue?.gross_amount || 0) - paidTotal
  )

  const invoiceTypeLabel = revenue?.invoice_type
    ? invoiceLabels[revenue.invoice_type] || revenue.invoice_type
    : 'Keine Angabe'

  const inputClass =
    'block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#f5f3ee] file:px-4 file:py-2 file:text-sm file:text-[#8b744d] hover:file:bg-[#eee9df]'

  function DocumentSection({
    title,
    description,
    type,
    items,
  }: {
    title: string
    description: string
    type: 'invoice' | 'payment_proof'
    items: Document[]
  }) {
    return (
      <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 space-y-5">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-xs text-gray-400 mt-1">{description}</p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#ded6c8] bg-[#faf9f6] p-5 text-center">
            <p className="text-sm text-gray-500">
              Noch keine Dokumente hinterlegt.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(doc => (
              <div
                key={doc.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#eee9df] p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-[#f5f3ee] flex items-center justify-center text-[#8b744d]">
                    <span className="text-xs font-semibold">
                      {doc.content_type === 'application/pdf' ? 'PDF' : 'IMG'}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{doc.file_name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {dateFormat(doc.created_at.slice(0, 10))}
                      {doc.file_size
                        ? ` · ${(doc.file_size / 1024 / 1024).toFixed(2)} MB`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {signedUrls[doc.id] ? (
                    <a
                      href={signedUrls[doc.id]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[#8b744d] hover:text-[#242424] font-medium"
                    >
                      Öffnen ↗
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">Wird geladen ...</span>
                  )}

                  <button
                    type="button"
                    onClick={() => deleteDocument(doc)}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Löschen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-[#e8e3d9] bg-[#faf9f6] p-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            {uploading ? 'Upload läuft ...' : 'Weitere Dateien hinzufügen'}
          </label>
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            disabled={uploading}
            onChange={event => uploadDocuments(event, type)}
            className={inputClass}
          />
          <p className="text-xs text-gray-400 mt-2">
            PDF, JPG, PNG oder WEBP · maximal 15 MB pro Datei
          </p>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f3ee] flex items-center justify-center text-[#8b744d]">
        WORKLEX wird geladen ...
      </main>
    )
  }

  if (!revenue) {
    return (
      <main className="min-h-screen bg-[#f5f3ee] p-8">
        <p className="text-red-700">{message || 'Einnahme nicht gefunden.'}</p>
        <button
          onClick={() => router.push('/dashboard/revenues')}
          className="mt-4 text-[#8b744d]"
        >
          ← Zurück zu den Einnahmen
        </button>
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
            onClick={() => router.push('/dashboard/revenues')}
            className="text-sm text-[#d6bd91] hover:text-white transition"
          >
            ← Einnahmen
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 py-10">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 mb-8">
          <div>
            <p className="text-xs tracking-[0.25em] text-[#a18b65] uppercase mb-2">
              Finanzverwaltung · Einnahmen · Details
            </p>
            <h1 className="text-3xl sm:text-4xl font-light">
              {revenue.title}
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              {revenue.customer_name || 'Kein Kunde hinterlegt'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/dashboard/revenues/new?id=${id}`)}
            className="rounded-xl bg-[#242424] text-[#e0c99e] px-6 py-3 text-sm font-medium hover:bg-[#363636] transition"
          >
            Bearbeiten
          </button>
        </div>

        {message && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
          </div>
        )}

        <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-medium mb-6">Angaben zur Einnahme</h2>

          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-5">
            <div>
              <p className="text-xs text-gray-400 mb-1">Kunde / Auftraggeber</p>
              <p className="font-medium">{revenue.customer_name || '–'}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1">Bezeichnung</p>
              <p className="font-medium">{revenue.title}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1">Kategorie</p>
              <p className="font-medium">{revenue.category || '–'}</p>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1">Rechnungsdatum</p>
              <p className="font-medium">{dateFormat(revenue.invoice_date)}</p>
            </div>

            <div className="sm:col-span-2">
              <p className="text-xs text-gray-400 mb-1">Rechnungsart</p>
              <p className="font-medium">{invoiceTypeLabel}</p>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-medium mb-5">Betragsübersicht</h2>

          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Nettobetrag</span>
              <strong>{euro(Number(revenue.net_amount))}</strong>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-500">
                Umsatzsteuer ({Number(revenue.vat_rate || 0)} %)
              </span>
              <strong>{euro(Number(revenue.vat_amount))}</strong>
            </div>

            <div className="flex justify-between border-t border-[#ded6c8] pt-4">
              <span className="font-medium">Rechnungsbetrag brutto</span>
              <strong className="text-xl text-[#8b744d]">
                {euro(Number(revenue.gross_amount))}
              </strong>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-medium mb-5">Skonto</h2>

          {revenue.skonto_enabled ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Skontosatz</span>
                <strong>{Number(revenue.skonto_percent || 0)} %</strong>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Berechnungsgrundlage</span>
                <strong>
                  {revenue.skonto_basis === 'gross' ? 'Brutto' : 'Netto'}
                </strong>
              </div>

              <div className="flex justify-between border-t border-[#ded6c8] pt-3">
                <span className="text-gray-500">Skonto bei vollständiger Zahlung</span>
                <strong className="text-emerald-700">
                  {euro(
                    (revenue.skonto_basis === 'gross'
                      ? Number(revenue.gross_amount)
                      : Number(revenue.net_amount)) *
                    Number(revenue.skonto_percent || 0) / 100
                  )}
                </strong>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Für diese Rechnung ist kein Skonto vorgesehen.</p>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 mb-6">
          <h2 className="text-lg font-medium mb-5">Zahlungsübersicht</h2>

          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <div className="rounded-xl bg-[#f8f6f1] p-4">
              <p className="text-xs text-gray-500">Rechnungsbetrag</p>
              <p className="text-lg font-semibold mt-2">
                {euro(Number(revenue.gross_amount))}
              </p>
            </div>

            <div className="rounded-xl bg-[#f8f6f1] p-4">
              <p className="text-xs text-gray-500">Verbuchte Zahlungen</p>
              <p className="text-lg font-semibold text-emerald-700 mt-2">
                {euro(paidTotal)}
              </p>
            </div>

            <div className="rounded-xl bg-[#f8f6f1] p-4">
              <p className="text-xs text-gray-500">Offener Betrag</p>
              <p className="text-lg font-semibold text-[#8b744d] mt-2">
                {euro(outstanding)}
              </p>
            </div>
          </div>

          {payments.length === 0 ? (
            <p className="text-sm text-gray-500">
              Für diese Einnahme wurden noch keine Zahlungen erfasst.
            </p>
          ) : (
            <div className="space-y-3">
              {payments.map(payment => (
                <div
                  key={payment.id}
                  className="rounded-xl border border-[#eee9df] p-4"
                >
                  <div className="flex justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {euro(Number(payment.received_amount ?? payment.amount))}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {dateFormat(payment.paid_at.slice(0, 10))}
                        {payment.payment_method
                          ? ` · ${payment.payment_method === 'transfer' ? 'Überweisung' : payment.payment_method === 'cash' ? 'Barzahlung' : payment.payment_method}`
                          : ''}
                      </p>
                    </div>

                    {Number(payment.skonto_amount || 0) > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Abgezogenes Skonto</p>
                        <p className="text-sm text-emerald-700 font-medium">
                          {euro(Number(payment.skonto_amount))}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {revenue.notes && (
          <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 mb-6">
            <h2 className="text-lg font-medium mb-3">Notizen</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {revenue.notes}
            </p>
          </section>
        )}

        <DocumentSection
          title="Rechnungen & sonstige Dokumente"
          description="Rechnungen, Gutschriften, Lieferscheine, Verträge und weitere Unterlagen."
          type="invoice"
          items={invoiceDocuments}
        />

        <div className="mt-6">
          <DocumentSection
            title="Zahlungsbelege"
            description="Überweisungsbestätigungen, Kontoauszüge und sonstige Zahlungsnachweise."
            type="payment_proof"
            items={proofDocuments}
          />
        </div>

        {revenue.receipt_path && (
          <section className="bg-white rounded-2xl border border-[#e8e3d9] p-6 sm:p-8 mt-6">
            <h2 className="text-lg font-medium mb-3">Bisheriger Beleg</h2>
            <p className="text-sm text-gray-500 mb-3">
              Dieser Beleg wurde mit der bisherigen Erfassungsmaske hochgeladen.
            </p>

            <button
              type="button"
              onClick={async () => {
                const { data, error } = await supabase.storage
                  .from('worklex-receipts')
                  .createSignedUrl(revenue.receipt_path!, 300)

                if (error || !data?.signedUrl) {
                  setMessage('Der bisherige Beleg konnte nicht geöffnet werden.')
                  return
                }

                window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
              }}
              className="text-sm font-medium text-[#8b744d] hover:text-[#242424]"
            >
              Bisherigen Beleg öffnen ↗
            </button>
          </section>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button
            type="button"
            onClick={() => router.push(`/dashboard/revenues/new?id=${id}`)}
            className="flex-1 rounded-xl bg-[#242424] text-[#e0c99e] py-4 font-medium hover:bg-[#363636] transition"
          >
            Einnahme bearbeiten
          </button>

          <button
            type="button"
            onClick={() => router.push('/dashboard/revenues')}
            className="px-8 py-4 rounded-xl border border-[#d8c9aa] text-[#8b744d] hover:bg-[#faf8f3] transition"
          >
            Zurück zur Übersicht
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-8">
          WORKLEX · Deine Unternehmenszahlen
        </p>
      </div>
    </main>
  )
}
