import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Star,
  Target,
  MessageSquare,
  ChevronRight,
  User,
  TrendingUp,
  Code2,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function UserProfile() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.userId;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchProfile = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await api.describeUser(userId);
        setProfile(data);
      } catch (err) {
        setError('Failed to load profile. Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (userId) fetchProfile();
  }, [userId, fetchProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-primary-500" />
          <p className="text-slate-400 text-sm">Loading your profile…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm mb-4">
          <AlertCircle size={15} />
          {error}
        </div>
        <button
          className="px-4 py-2 bg-primary-500 text-white rounded-xl font-bold hover:bg-primary-600 transition-all"
          onClick={() => fetchProfile()}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">

      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
            <User className="w-8 h-8 text-indigo-700" />
          </div>
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Lumino Profile</p>
            <h1 className="text-4xl font-extrabold font-display text-indigo-950 tracking-tight">
              {profile?.identity ?? userId}
            </h1>
          </div>
        </div>
        <button
          onClick={() => fetchProfile(true)}
          disabled={refreshing}
          className="self-start flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-10">
        <button
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary-500 text-white text-sm font-bold hover:bg-primary-600 transition-all shadow-sm"
          onClick={() => navigate('/user/clarifications')}
        >
          Verify Profile
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-all"
          onClick={() => navigate('/user/edit-graph')}
        >
          <MessageSquare className="w-4 h-4" />
          Deep Dive Interview
        </button>
      </div>

      <div className="space-y-6">

        {/* Career Arc */}
        {profile?.career_arc && (
          <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary-500" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Career Arc</p>
            </div>
            <p className="text-indigo-950 leading-relaxed">{profile.career_arc}</p>
          </div>
        )}

        {/* Technical Profile + Domain Expertise */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {profile?.technical_profile && (
            <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Code2 className="w-4 h-4 text-primary-500" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Technical Profile</p>
              </div>
              <p className="text-slate-600 leading-relaxed text-sm">{profile.technical_profile}</p>
            </div>
          )}
          {profile?.domain_expertise && (
            <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4 text-primary-500" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Domain Expertise</p>
              </div>
              <p className="text-slate-600 leading-relaxed text-sm">{profile.domain_expertise}</p>
            </div>
          )}
        </div>

        {/* Core Strengths & Gaps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {profile?.core_strengths?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Core Strengths</p>
              <ul className="space-y-2.5">
                {profile.core_strengths.map((strength, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span className="text-indigo-950 text-sm">{strength}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {profile?.gaps_and_concerns?.length > 0 && (
            <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-6">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Gaps &amp; Concerns</p>
              <ul className="space-y-2.5">
                {profile.gaps_and_concerns.map((gap, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-600 text-sm">{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Honest Assessment */}
        {profile?.honest_assessment && (
          <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-6">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Honest Assessment</p>
            <p className="text-slate-600 leading-relaxed text-sm">{profile.honest_assessment}</p>
          </div>
        )}

        {/* Best Suited For */}
        {profile?.best_suited_for && (
          <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-6 bg-primary-50 border-primary-200">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-primary-500" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Best Suited For</p>
            </div>
            <p className="text-indigo-950 leading-relaxed">{profile.best_suited_for}</p>
          </div>
        )}

        {/* Interview Ready Summary */}
        {profile?.interview_ready_summary && (
          <div className="bg-white rounded-2xl shadow-prism border border-slate-100 p-6 border-l-4 border-l-primary-500">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-primary-500" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Interview Ready Summary</p>
            </div>
            <blockquote className="text-indigo-950 text-base leading-relaxed italic pl-2">
              "{profile.interview_ready_summary}"
            </blockquote>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex flex-wrap gap-3 pt-2 pb-4">
          <button
            className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-xl font-bold hover:bg-primary-600 transition-all"
            onClick={() => navigate('/user/clarifications')}
          >
            Verify Profile
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            className="flex items-center gap-2 px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
            onClick={() => navigate('/user/edit-graph')}
          >
            <MessageSquare className="w-4 h-4" />
            Deep Dive Interview
          </button>
        </div>
      </div>
    </div>
  );
}
