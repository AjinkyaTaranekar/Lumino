import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import Layout from '../../components/Layout'
import { User, RefreshCw, ChevronRight, AlertTriangle, CheckCircle2, Target, Briefcase, Code2, TrendingUp } from 'lucide-react'

const C = {
  card: '#16213e', border: '#0f3460', accent: '#e94560',
  green: '#27ae60', yellow: '#f39c12', muted: '#8892a4', text: '#e0e0e0',
}

function Section({ icon: Icon, title, color, children }) {
  return (
    <div className="rounded-xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} style={{ color: color || C.accent }} />
        <h3 className="font-semibold text-sm" style={{ color: C.text }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function UserProfile() {
  const { session } = useAuth()
  const navigate    = useNavigate()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.describeUser(session.userId)
      setProfile(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [session.userId])

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-10">

        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <User size={20} style={{ color: C.accent }} />
              <h1 className="text-2xl font-bold" style={{ color: C.text }}>Your Profile</h1>
            </div>
            <p className="text-sm" style={{ color: C.muted }}>
              How your knowledge graph describes you — honest, evidence-based.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs"
            style={{ background: C.card, color: C.muted, border: `1px solid ${C.border}` }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 mx-auto mb-4"
                   style={{ borderColor: C.accent, borderTopColor: 'transparent' }} />
              <p className="text-sm" style={{ color: C.muted }}>Generating your profile…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)' }}>
            <p className="text-sm" style={{ color: '#e74c3c' }}>{error}</p>
          </div>
        )}

        {profile && !loading && (
          <div className="space-y-4">

            {/* Identity card */}
            <div className="rounded-xl px-5 py-5"
                 style={{ background: 'linear-gradient(135deg, #16213e 0%, #0f1a30 100%)', border: `1px solid ${C.accent}` }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.accent }}>
                Professional Identity
              </p>
              <p className="text-lg font-bold leading-snug" style={{ color: C.text }}>
                {profile.identity}
              </p>
            </div>

            {/* Career arc */}
            <Section icon={TrendingUp} title="Career Arc" color={C.yellow}>
              <p className="text-sm leading-relaxed" style={{ color: '#c8d0dc' }}>
                {profile.career_arc}
              </p>
            </Section>

            {/* Technical profile */}
            <Section icon={Code2} title="Technical Profile" color="#5b9bd5">
              <p className="text-sm leading-relaxed" style={{ color: '#c8d0dc' }}>
                {profile.technical_profile}
              </p>
            </Section>

            {/* Domain expertise */}
            <Section icon={Briefcase} title="Domain Expertise" color={C.yellow}>
              <p className="text-sm leading-relaxed" style={{ color: '#c8d0dc' }}>
                {profile.domain_expertise}
              </p>
            </Section>

            {/* Honest assessment */}
            <Section icon={CheckCircle2} title="Honest Assessment" color={C.green}>
              <p className="text-sm leading-relaxed" style={{ color: '#c8d0dc' }}>
                {profile.honest_assessment}
              </p>
            </Section>

            {/* Core strengths */}
            {profile.core_strengths?.length > 0 && (
              <Section icon={Target} title="Core Strengths (evidenced)" color={C.green}>
                <ul className="space-y-2">
                  {profile.core_strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#c8d0dc' }}>
                      <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" style={{ color: C.green }} />
                      {s}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Gaps and concerns */}
            {profile.gaps_and_concerns?.length > 0 && (
              <Section icon={AlertTriangle} title="Gaps & Concerns" color={C.accent}>
                <ul className="space-y-2">
                  {profile.gaps_and_concerns.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#c8d0dc' }}>
                      <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: C.accent }} />
                      {g}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Best suited for */}
            <Section icon={Target} title="Best Suited For" color="#5b9bd5">
              <p className="text-sm leading-relaxed" style={{ color: '#c8d0dc' }}>
                {profile.best_suited_for}
              </p>
            </Section>

            {/* Recruiter summary */}
            <div className="rounded-xl px-5 py-4"
                 style={{ background: 'rgba(91,155,213,0.08)', border: '1px solid rgba(91,155,213,0.3)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: '#5b9bd5' }}>
                What a recruiter sees before your interview
              </p>
              <p className="text-sm italic leading-relaxed" style={{ color: '#c8d0dc' }}>
                "{profile.interview_ready_summary}"
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={() => navigate('/user/clarifications')}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold"
                      style={{ background: C.card, color: C.muted, border: `1px solid ${C.border}` }}>
                Verify Profile
              </button>
              <button onClick={() => navigate('/user/edit-graph')}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                      style={{ background: C.accent, color: '#fff' }}>
                Deep Dive Interview <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
