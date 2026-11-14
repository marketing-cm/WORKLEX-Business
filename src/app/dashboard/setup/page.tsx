
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CompanySetupPage() {
  const router = useRouter()

  const [companyId, setCompanyId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [street, setStreet] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('Österreich')

  const [logoPath, setLogoPath] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadCompany() {
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

      if (profileError || !profile?.company_id) {
        setMessage('Unternehmensprofil konnte nicht geladen werden.')
        setLoading(false)
        return
      }

      setCompanyId(profile.company_id)

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('name, logo_path, street, postal_code, city, country')
        .eq('id', profile.company_id)
        .single()

      if (companyError) {
        setMessage('Unternehmensdaten konnten nicht geladen werden.')
        setLoading(false)
        return
      }

      setCompanyName(
        company.name === 'Mein Unternehmen' ? '' : company.name || ''
      )
      setStreet(company.street || '')
      setPostalCode(company.postal_code || '')
      setCity(company.city || '')
      setCountry(company.country || 'Österreich')
      setLogoPath(company.logo_path || '')

      if (company.logo_path) {
        const { data } = await supabase.storage
          .from('worklex-logos')
          .createSignedUrl(company.logo_path, 3600)

        if (data?.signedUrl) {
          setLogoUrl(data.signedUrl)
        }
      }

      setLoading(false)
    }

    loadCompany()
  }, [router])

  function handleLogoChange(file: File | null) {
    setMessage('')

    if (!file) return

    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/webp',
    ]

    if (!allowedTypes.includes(file.type)) {
      setMessage('Bitte lade ein PNG-, JPG- oder WebP-Bild hoch.')
      return
    }

    if (file.size > 3 * 1024 * 1024) {
      setMessage('Das Logo darf maximal 3 MB groß sein.')
      return
    }

    setLogoFile(file)
    setLogoUrl(URL.createObjectURL(file))
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setMessage('')

    if (!companyName.trim()) {
      setMessage('Bitte gib deinen Unternehmensnamen ein.')
      return
    }

    if (!street.trim() || !postalCode.trim() || !city.trim()) {
      setMessage('Bitte vervollständige deine Unternehmensadresse.')
      return
    }

    if (!companyId) {
      setMessage('Unternehmen wurde nicht gefunden.')
      return
    }

    setSaving(true)

    let newLogoPath = logoPath

    if (logoFile) {
      const extension =
        logoFile.name.split('.').pop()?.toLowerCase() || 'png'

      const path = `${companyId}/logo-${Date.now()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from('worklex-logos')
        .upload(path, logoFile, {
          contentType: logoFile.type,
          upsert: false,
        })

      if (uploadError) {
        setMessage(
          'Logo konnte nicht hochgeladen werden: ' +
          uploadError.message
        )
        setSaving(false)
        return
      }

      newLogoPath = path
    }

    const { error } = await supabase
      .from('companies')
      .update({
        name: companyName.trim(),
        street: street.trim(),
        postal_code: postalCode.trim(),
        city: city.trim(),
        country: country.trim(),
        logo_path: newLogoPath || null,
        setup_completed: true,
      })
      .eq('id', companyId)

    if (error) {
      setMessage('Speichern fehlgeschlagen: ' + error.message)
      setSaving(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#17191d] text-white flex items-center justify-center">
        Einrichtung wird geladen ...
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#17191d] text-white flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-[#393a3d] bg-[#202226] p-8 shadow-2xl">

        <div className="text-center mb-8">
          <div className="text-[#c5a46d] text-sm tracking-[0.3em] uppercase mb-3">
            WORKLEX
          </div>

          <h1 className="text-3xl font-semibold mb-3">
            Dein Unternehmen
          </h1>

          <p className="text-gray-400">
            Richte deinen persönlichen Unternehmensbereich ein.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Unternehmensname *
            </label>

            <input
              type="text"
              required
              maxLength={100}
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="z. B. Musterfirma GmbH"
              className="w-full rounded-lg border border-[#494b50] bg-[#17191d] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
            />
          </div>

          <div className="border-t border-[#393a3d] pt-6">
            <h2 className="text-lg font-medium mb-2">
              Unternehmensstandort
            </h2>

            <p className="text-sm text-gray-400 mb-5">
              Diese Adresse verwenden wir später für die lokale Wetteranzeige in deinem Dashboard.
            </p>

            <div className="space-y-4">

              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Straße und Hausnummer *
                </label>

                <input
                  type="text"
                  required
                  maxLength={150}
                  value={street}
                  onChange={(event) => setStreet(event.target.value)}
                  placeholder="z. B. Hauptstraße 12"
                  className="w-full rounded-lg border border-[#494b50] bg-[#17191d] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">

                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Postleitzahl *
                  </label>

                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={postalCode}
                    onChange={(event) => setPostalCode(event.target.value)}
                    placeholder="z. B. 6271"
                    className="w-full rounded-lg border border-[#494b50] bg-[#17191d] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    Ort *
                  </label>

                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="z. B. Uderns"
                    className="w-full rounded-lg border border-[#494b50] bg-[#17191d] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
                  />
                </div>

              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  Land *
                </label>

                <input
                  type="text"
                  required
                  maxLength={100}
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  placeholder="Österreich"
                  className="w-full rounded-lg border border-[#494b50] bg-[#17191d] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
                />
              </div>

            </div>
          </div>

          <div className="border-t border-[#393a3d] pt-6">
            <label className="block text-sm text-gray-300 mb-2">
              Unternehmenslogo
            </label>

            <div className="rounded-xl border border-dashed border-[#68615a] bg-[#17191d] p-6 text-center">

              {logoUrl ? (
                <div className="mb-4 flex justify-center">
                  <img
                    src={logoUrl}
                    alt="Logo-Vorschau"
                    className="max-h-32 max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="text-gray-500 mb-4">
                  Hier erscheint deine Logo-Vorschau
                </div>
              )}

              <label className="inline-block cursor-pointer rounded-lg bg-[#c5a46d] px-5 py-3 font-medium text-[#17191d] hover:bg-[#d6b981]">
                Logo auswählen

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) =>
                    handleLogoChange(
                      event.target.files?.[0] || null
                    )
                  }
                />
              </label>

              <p className="mt-3 text-xs text-gray-500">
                PNG, JPG oder WebP · maximal 3 MB
              </p>

            </div>
          </div>

          {message && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-[#c5a46d] px-5 py-3 font-semibold text-[#17191d] transition hover:bg-[#d6b981] disabled:opacity-50"
          >
            {saving
              ? 'Wird gespeichert ...'
              : 'Unternehmen einrichten'}
          </button>

        </form>
      </div>
    </main>
  )
}
