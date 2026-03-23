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
} from 'lucide-react';
import Layout from '../../components/Layout';
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
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh] bg-surface-bg">
          <div className="flex flex-col items-center gap-3">
            <span className="spinner" />
            <p className="text-content-secondary text-sm">Loading your profile…</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-16 px-4 bg-surface-bg min-h-screen">
          <div className="alert-error">{error}</div>
          <button className="btn-primary mt-4" onClick={() => fetchProfile()}>
            Try Again
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-surface-bg pb-12">

        {/* Hero Card */}
        <div className="bg-gradient-to-br from-primary-700 to-primary-500 px-6 py-10 md:px-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="text-primary-100 text-xs font-semibold uppercase tracking-widest mb-1">
                    Lumino Profile
                  </p>
                  <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                    {profile?.identity ?? userId}
                  </h1>
                </div>
              </div>
              <button
                onClick={() => fetchProfile(true)}
                disabled={refreshing}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors disabled:opacity-60 flex-shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 mt-8">
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-primary-600 text-sm font-semibold hover:bg-primary-50 transition-colors shadow-sm"
                onClick={() => navigate('/user/clarifications')}
              >
                Verify Profile
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 border border-white/40 text-white text-sm font-semibold hover:bg-white/30 transition-colors"
                onClick={() => navigate('/user/edit-graph')}
              >
                <MessageSquare className="w-4 h-4" />
                Deep Dive Interview
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 md:px-6 mt-8 space-y-6">

          {/* Career Arc */}
          {profile?.career_arc && (
            <div className="card card-p fade-in">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary-500" />
                <p className="section-title">Career Arc</p>
              </div>
              <p className="text-content-primary leading-relaxed">{profile.career_arc}</p>
            </div>
          )}

          {/* Technical Profile + Domain Expertise */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {profile?.technical_profile && (
              <div className="card card-p fade-in">
                <div className="flex items-center gap-2 mb-3">
                  <Code2 className="w-4 h-4 text-primary-500" />
                  <p className="section-title">Technical Profile</p>
                </div>
                <p className="text-content-secondary leading-relaxed text-sm">
                  {profile.technical_profile}
                </p>
              </div>
            )}
            {profile?.domain_expertise && (
              <div className="card card-p fade-in">
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="w-4 h-4 text-primary-500" />
                  <p className="section-title">Domain Expertise</p>
                </div>
                <p className="text-content-secondary leading-relaxed text-sm">
                  {profile.domain_expertise}
                </p>
              </div>
            )}
          </div>

          {/* Core Strengths & Gaps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {profile?.core_strengths?.length > 0 && (
              <div className="card card-p fade-in">
                <p className="section-title mb-3">Core Strengths</p>
                <ul className="space-y-2.5">
                  {profile.core_strengths.map((strength, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle className="w-4 h-4 text-success-500 flex-shrink-0 mt-0.5" />
                      <span className="text-content-primary text-sm">{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {profile?.gaps_and_concerns?.length > 0 && (
              <div className="card card-p fade-in">
                <p className="section-title mb-3">Gaps &amp; Concerns</p>
                <ul className="space-y-2.5">
                  {profile.gaps_and_concerns.map((gap, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-warning-500 flex-shrink-0 mt-0.5" />
                      <span className="text-content-secondary text-sm">{gap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Honest Assessment */}
          {profile?.honest_assessment && (
            <div className="card card-p fade-in">
              <p className="section-title mb-3">Honest Assessment</p>
              <p className="text-content-secondary leading-relaxed text-sm">
                {profile.honest_assessment}
              </p>
            </div>
          )}

          {/* Best Suited For */}
          {profile?.best_suited_for && (
            <div className="card card-p fade-in bg-primary-50 border border-primary-200">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-primary-500" />
                <p className="section-title">Best Suited For</p>
              </div>
              <p className="text-content-primary leading-relaxed">{profile.best_suited_for}</p>
            </div>
          )}

          {/* Interview Ready Summary */}
          {profile?.interview_ready_summary && (
            <div className="card card-p fade-in border-l-4 border-primary-500">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-primary-500" />
                <p className="section-title">Interview Ready Summary</p>
              </div>
              <blockquote className="text-content-primary text-base leading-relaxed italic pl-2">
                "{profile.interview_ready_summary}"
              </blockquote>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="flex flex-wrap gap-3 pt-2 pb-4">
            <button
              className="btn-primary btn-lg"
              onClick={() => navigate('/user/clarifications')}
            >
              Verify Profile
              <ChevronRight className="w-4 h-4 ml-1" />
            </button>
            <button
              className="btn-secondary btn-lg"
              onClick={() => navigate('/user/edit-graph')}
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              Deep Dive Interview
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
