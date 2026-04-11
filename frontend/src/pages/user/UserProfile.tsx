import {
  AlertTriangle,
  Award,
  BookOpen,
  Briefcase,
  CheckCircle,
  ChevronRight,
  Code2,
  FileText,
  Globe,
  GraduationCap,
  Heart,
  Loader,
  MessageSquare,
  RefreshCw,
  Shield,
  Star,
  Target,
  TrendingUp,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type {
  ExtractedAchievementItem,
  ExtractedCertificationItem,
  ExtractedCourseworkItem,
  ExtractedEducationItem,
  ExtractedLanguageItem,
  ExtractedPublicationItem,
  ExtractedVolunteerItem,
  UserDescribeResponse,
} from '../../lib/types';

const PROFICIENCY_ORDER = ['native', 'fluent', 'professional', 'conversational', 'basic'];
const PROFICIENCY_COLOR: Record<string, string> = {
  native: 'bg-emerald-100 text-emerald-800',
  fluent: 'bg-blue-100 text-blue-800',
  professional: 'bg-indigo-100 text-indigo-800',
  conversational: 'bg-amber-100 text-amber-800',
  basic: 'bg-slate-100 text-slate-600',
};

export default function UserProfile() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.userId;

  const [profile, setProfile] = useState<UserDescribeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await api.describeUser(userId!);
        setProfile(data);
      } catch {
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
      <>
        <title>My Profile - Lumino</title>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <Loader size={28} className="animate-spin text-blue-500" />
            <p className="text-slate-500 text-sm">Loading your profile…</p>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <title>My Profile - Lumino</title>
        <div className="max-w-2xl mx-auto py-16 px-4">
          <div className="alert-error mb-4">{error}</div>
          <button
            className="btn-primary focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            onClick={() => fetchProfile()}
          >
            Try Again
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <title>My Profile - Lumino</title>

      <div className="min-h-screen bg-slate-50 pb-12">

        {/* Hero gradient section */}
        <div className="bg-gradient-to-br from-indigo-700 to-indigo-500 px-6 py-10 md:px-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest mb-1">
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
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-medium transition-colors disabled:opacity-60 flex-shrink-0 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                aria-label="Refresh profile"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mt-8">
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-indigo-600 text-sm font-semibold hover:bg-indigo-50 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                onClick={() => navigate('/user/clarifications')}
              >
                Improve Accuracy
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 border border-white/40 text-white text-sm font-semibold hover:bg-white/30 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                onClick={() => navigate('/user/edit-graph')}
              >
                <MessageSquare className="w-4 h-4" />
                Optimize Profile Graph
              </button>
            </div>
          </div>
        </div>

        {/* Content cards */}
        <div className="max-w-4xl mx-auto px-4 md:px-6 mt-8 space-y-6">

          {/* Career Arc */}
          {profile?.career_arc && (
            <div className="card-lumino p-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Career Arc</p>
              </div>
              <p className="text-slate-700 leading-relaxed">{profile.career_arc}</p>
            </div>
          )}

          {/* Technical Profile + Domain Expertise */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {profile?.technical_profile && (
              <div className="card-lumino p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Code2 className="w-4 h-4 text-blue-500" />
                  <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Technical Profile</p>
                </div>
                <p className="text-slate-600 leading-relaxed text-sm">{profile.technical_profile}</p>
              </div>
            )}
            {profile?.domain_expertise && (
              <div className="card-lumino p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="w-4 h-4 text-blue-500" />
                  <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Domain Expertise</p>
                </div>
                <p className="text-slate-600 leading-relaxed text-sm">{profile.domain_expertise}</p>
              </div>
            )}
          </div>

          {/* Core Strengths + Gaps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(profile?.core_strengths?.length ?? 0) > 0 && (
              <div className="card-lumino p-6">
                <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide mb-3">
                  Core Strengths
                </p>
                <ul className="space-y-2.5">
                  {profile!.core_strengths!.map((strength, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-indigo-950 text-sm">{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(profile?.gaps_and_concerns?.length ?? 0) > 0 && (
              <div className="card-lumino p-6">
                <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide mb-3">
                  Gaps &amp; Concerns
                </p>
                <ul className="space-y-2.5">
                  {profile!.gaps_and_concerns!.map((gap, i) => (
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
            <div className="card-lumino p-6">
              <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide mb-3">
                Honest Assessment
              </p>
              <p className="text-slate-600 leading-relaxed text-sm">{profile.honest_assessment}</p>
            </div>
          )}

          {/* Best Suited For */}
          {profile?.best_suited_for && (
            <div className="card-lumino p-6 bg-blue-50 border-blue-100">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-blue-500" />
                <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Best Suited For</p>
              </div>
              <p className="text-slate-700 leading-relaxed">{profile.best_suited_for}</p>
            </div>
          )}

          {/* Interview Ready Summary */}
          {profile?.interview_ready_summary && (
            <div className="card-lumino p-6 border-l-4 border-blue-500">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-blue-500" />
                <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">
                  Interview Ready Summary
                </p>
              </div>
              <blockquote className="text-indigo-950 text-base leading-relaxed italic pl-2">
                "{profile.interview_ready_summary}"
              </blockquote>
            </div>
          )}

          {/* Education */}
          {(profile?.education?.length ?? 0) > 0 && (
            <div className="card-lumino p-6">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="w-4 h-4 text-blue-500" />
                <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Education</p>
              </div>
              <div className="space-y-4">
                {profile!.education!.map((edu: ExtractedEducationItem, i: number) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-indigo-950 text-sm">
                          {edu.degree}{edu.field_of_study ? ` · ${edu.field_of_study}` : ''}
                        </p>
                        {edu.institution && (
                          <p className="text-slate-500 text-xs">{edu.institution}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {edu.is_ongoing && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">In Progress</span>
                        )}
                        {edu.graduation_year && !edu.is_ongoing && (
                          <span className="text-xs text-slate-400">{edu.graduation_year}</span>
                        )}
                      </div>
                    </div>
                    {(edu.gpa || edu.honors) && (
                      <p className="text-xs text-slate-500">
                        {[edu.gpa, edu.honors].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certifications + Languages (side by side) */}
          {((profile?.certifications?.length ?? 0) > 0 || (profile?.languages?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(profile?.certifications?.length ?? 0) > 0 && (
                <div className="card-lumino p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Certifications</p>
                  </div>
                  <div className="space-y-3">
                    {profile!.certifications!.map((cert: ExtractedCertificationItem, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-indigo-950">{cert.name}</p>
                          {(cert.issuer || cert.date_obtained) && (
                            <p className="text-xs text-slate-400">
                              {[cert.issuer, cert.date_obtained].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(profile?.languages?.length ?? 0) > 0 && (
                <div className="card-lumino p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Globe className="w-4 h-4 text-blue-500" />
                    <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Languages</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[...profile!.languages!]
                      .sort((a: ExtractedLanguageItem, b: ExtractedLanguageItem) =>
                        PROFICIENCY_ORDER.indexOf(a.proficiency) - PROFICIENCY_ORDER.indexOf(b.proficiency)
                      )
                      .map((lang: ExtractedLanguageItem, i: number) => (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${PROFICIENCY_COLOR[lang.proficiency] ?? 'bg-slate-100 text-slate-600'}`}
                        >
                          {lang.name}
                          <span className="opacity-70 capitalize">· {lang.proficiency}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Achievements */}
          {(profile?.achievements?.length ?? 0) > 0 && (
            <div className="card-lumino p-6">
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Achievements & Awards</p>
              </div>
              <div className="space-y-3">
                {profile!.achievements!.map((ach: ExtractedAchievementItem, i: number) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Star className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-indigo-950">{ach.title}</p>
                      {(ach.description || ach.impact) && (
                        <p className="text-xs text-slate-500">
                          {[ach.description, ach.impact].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {ach.date && <p className="text-xs text-slate-400">{ach.date}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Publications & Research */}
          {(profile?.publications?.length ?? 0) > 0 && (
            <div className="card-lumino p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-blue-500" />
                <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Publications & Research</p>
              </div>
              <div className="space-y-4">
                {profile!.publications!.map((pub: ExtractedPublicationItem, i: number) => (
                  <div key={i} className="border-l-2 border-slate-200 pl-3">
                    <p className="text-sm font-medium text-indigo-950">{pub.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">{pub.type.replace('_', ' ')}</span>
                      {pub.venue && <span className="text-xs text-slate-500">{pub.venue}</span>}
                      {pub.year && <span className="text-xs text-slate-400">{pub.year}</span>}
                      {pub.is_first_author && (
                        <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">First Author</span>
                      )}
                    </div>
                    {pub.description && <p className="text-xs text-slate-500 mt-1">{pub.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coursework + Volunteer (side by side) */}
          {((profile?.coursework?.length ?? 0) > 0 || (profile?.volunteer_work?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(profile?.coursework?.length ?? 0) > 0 && (
                <div className="card-lumino p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="w-4 h-4 text-blue-500" />
                    <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Notable Coursework</p>
                  </div>
                  <div className="space-y-2.5">
                    {profile!.coursework!.map((course: ExtractedCourseworkItem, i: number) => (
                      <div key={i}>
                        <p className="text-sm text-indigo-950">{course.name}</p>
                        {course.provider && (
                          <p className="text-xs text-slate-400">{course.provider}{course.year_completed ? ` · ${course.year_completed}` : ''}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(profile?.volunteer_work?.length ?? 0) > 0 && (
                <div className="card-lumino p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Heart className="w-4 h-4 text-rose-500" />
                    <p className="text-sm font-semibold text-indigo-950 uppercase tracking-wide">Volunteer & Community</p>
                  </div>
                  <div className="space-y-3">
                    {profile!.volunteer_work!.map((vol: ExtractedVolunteerItem, i: number) => (
                      <div key={i}>
                        <p className="text-sm font-medium text-indigo-950">{vol.role}</p>
                        {vol.organization && (
                          <p className="text-xs text-slate-400">{vol.organization}</p>
                        )}
                        {vol.description && (
                          <p className="text-xs text-slate-500 mt-0.5">{vol.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom action buttons */}
          <div className="flex flex-wrap gap-3 pt-2 pb-4">
            <button
              className="btn-primary btn-lg flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              onClick={() => navigate('/user/clarifications')}
            >
              Improve Accuracy
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              className="btn-secondary btn-lg flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
              onClick={() => navigate('/user/edit-graph')}
            >
              <MessageSquare className="w-4 h-4" />
              Optimize Profile Graph
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
