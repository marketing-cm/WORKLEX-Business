'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.replace('/')
        return
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('user_id', user.id)
        .single()

      if (error) {
        setMessage('Benutzerprofil konnte nicht geladen werden.')
        setChecking(false)
        return
      }

      if (!profile.must_change_password) {
        router.replace('/dashboard')
        return
      }

      setChecking(false)
    }

    checkUser()
  }, [router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (password.length < 8) {
      setMessage('Dein Passwort muss mindestens 8 Zeichen enthalten.')
      return
    }

    if (password !== confirmPassword) {
      setMessage('Die Passwörter stimmen nicht überein.')
      return
    }

    setLoading(true)

    const { error: passwordError } = await supabase.auth.updateUser({
      password,
    })

    if (passwordError) {
      setMessage('Passwort konnte nicht geändert werden: ' + passwordError.message)
      setLoading(false)
      return
    }

    const { error: profileError } = await supabase.rpc(
      'complete_password_change'
    )

    if (profileError) {
      setMessage('Passwort wurde geändert, aber die Einrichtung konnte nicht fortgesetzt werden. Bitte melde dich beim Support.')
      setLoading(false)
      return
    }

    router.push('/dashboard/setup')
    router.refresh()
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-[#17191d] text-white flex items-center justify-center">
        Wird geladen ...
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#17191d] text-white flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[#393a3d] bg-[#202226] p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-[#c5a46d] text-sm tracking-[0.3em] uppercase mb-3">
            WORKLEX
          </div>
          <h1 className="text-3xl font-semibold mb-3">
            Neues Passwort
          </h1>
          <p className="text-gray-400">
            Bitte lege zunächst dein persönliches Passwort fest.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Neues Passwort
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mindestens 8 Zeichen"
              className="w-full rounded-lg border border-[#494b50] bg-[#17191d] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Passwort wiederholen
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Passwort erneut eingeben"
              className="w-full rounded-lg border border-[#494b50] bg-[#17191d] px-4 py-3 text-white outline-none focus:border-[#c5a46d]"
            />
          </div>

          {message && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#c5a46d] px-5 py-3 font-semibold text-[#17191d] transition hover:bg-[#d6b981] disabled:opacity-50"
          >
            {loading ? 'Wird gespeichert ...' : 'Passwort speichern'}
          </button>
        </form>
      </div>
    </main>
  )
}
