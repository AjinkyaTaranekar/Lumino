/**
 * Interests page — full-page user preference management.
 *
 * Shows:
 *  - What the system has learned about what the user wants
 *  - Radar chart across 5 preference dimensions
 *  - Per-tag controls (adjust score, remove)
 *  - Explanation of how preferences are built and used
 */

import InterestProfilePanel from '../../components/InterestProfilePanel'
import { useAuth } from '../../context/AuthContext'
import { Info } from 'lucide-react'

export default function Interests() {
  const { session } = useAuth()
  const userId = session?.userId

  if (!userId) return null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-indigo-950">Job Preferences</h1>
        <p className="text-sm text-slate-500 mt-1">
          Your interest profile is built from how you interact with job listings.
          You can always adjust it manually.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3">
        <Info size={16} className="text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-700 space-y-1">
          <p className="font-semibold">How your preferences are built</p>
          <ul className="space-y-0.5 text-indigo-600">
            <li>❤️ <strong>Liking</strong> a job: strong positive (+2)</li>
            <li>🔖 <strong>Bookmarking</strong>: moderate positive (+1.5)</li>
            <li>🔍 <strong>Clicking</strong> "Explore": light positive (+1)</li>
            <li>👁 <strong>Viewing</strong> for 5+ seconds: slight positive (+0.5)</li>
            <li>👎 <strong>Disliking</strong>: strong negative (−2)</li>
          </ul>
          <p className="mt-2 text-indigo-500">
            These signals are time-decayed — recent interactions count more than old ones.
            Your preferences directly influence job ranking alongside your graph match score.
          </p>
        </div>
      </div>

      {/* Panel */}
      <div className="card-lumino p-5">
        <InterestProfilePanel userId={userId} />
      </div>

      {/* Scoring transparency */}
      <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-600">How preferences affect your recommendations</p>
        <p>
          Final job ranking = <strong>75% graph match</strong> (skills, domain, culture fit)
          + <strong>25% interest score</strong> (your preference profile vs job tags).
        </p>
        <p className="text-slate-400">
          Graph match is the primary signal — it measures fit based on your actual experience.
          Interest score adjusts for what you <em>want</em>, not just what you qualify for.
        </p>
      </div>
    </div>
  )
}
