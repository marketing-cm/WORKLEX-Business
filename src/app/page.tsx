'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.user) {
      setMessage('Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('must_change_password, company_id')
      .eq('user_id', data.user.id)
      .single()

    if (profileError || !profile) {
      setMessage('Dein Benutzerprofil konnte nicht geladen werden. Bitte kontaktiere den Support.')
      setLoading(false)
      return
    }

    if (profile.must_change_password) {
      router.replace('/change-password')
      router.refresh()
      return
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('setup_completed')
      .eq('id', profile.company_id)
      .single()

    if (companyError || !company) {
      setMessage('Deine Unternehmensdaten konnten nicht geladen werden.')
      setLoading(false)
      return
    }

    if (!company.setup_completed) {
      router.replace('/dashboard/setup')
    } else {
      router.replace('/dashboard')
    }

    router.refresh()
  }

  return (
    <main className="min-h-screen bg-[#242424] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <img
            src="/worklex-icon-glas.png"
            alt="WORKLEX"
            className="h-36 w-auto max-w-full object-contain mx-auto"
          />
          <div className="h-px w-16 bg-[#d6bd91] mx-auto mt-5" />
        </div>

        <div className="bg-[#f8f6f1] rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl text-[#292929] font-light text-center">
            Willkommen zurück
          </h1>

          <p className="text-gray-500 text-sm text-center mt-2 mb-8">
            Melde dich in deinem persönlichen Unternehmensportal an.
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-600 mb-2">
                E-Mail-Adresse
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-800 outline-none focus:border-[#b69a68]"
                placeholder="name@unternehmen.at"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-2">
                Passwort
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-800 outline-none focus:border-[#b69a68]"
                placeholder="Dein Passwort"
              />
            </div>

            {message && (
              <p className="text-sm text-center text-red-700">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#292929] text-[#e0c99e] py-3 tracking-wider hover:bg-[#3b3b3b] transition disabled:opacity-50"
            >
              {loading ? 'Anmeldung läuft ...' : 'ANMELDEN'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
