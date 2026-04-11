import { ArrowLeft, Briefcase, Building2, Clock, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import RichJobProfile from '../../components/RichJobProfile';
import { api } from '../../lib/api';
import type { RichJobProfile as RichJobProfileType } from '../../lib/types';

export default function JobProfileView() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<RichJobProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getJobProfile(jobId);
      setProfile(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load job profile.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <title>{profile?.title ? `${profile.title} – Job Details` : 'Job Details'} - Lumino</title>

      <div className="px-6 py-8 max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary btn-sm flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back
          </button>
          <button
            onClick={load}
            disabled={loading}
            aria-label="Refresh"
            className="btn-secondary btn-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>

        {/* Job identity card */}
        {profile && (
          <div className="card-lumino p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-5 h-5 text-primary-500" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-bold text-indigo-950">
                  {profile.title ?? profile.job_id}
                </h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-400">
                  {profile.company && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" aria-hidden="true" />
                      {profile.company}
                    </span>
                  )}
                  {profile.experience_years_min != null && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {profile.experience_years_min}+ yrs
                    </span>
                  )}
                  {profile.remote_policy && (
                    <span className="badge badge-gray">{profile.remote_policy}</span>
                  )}
                  {profile.company_size && (
                    <span className="badge badge-gray">{profile.company_size}</span>
                  )}
                </div>
                {profile.description_preview && (
                  <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                    {profile.description_preview}
                  </p>
                )}
              </div>
            </div>

            {/* Tags */}
            {profile.tags && profile.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                {profile.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="alert-error mb-6">{error}</div>
        )}

        {/* Loading */}
        {loading && !profile && (
          <div role="status" className="flex items-center justify-center py-20 gap-3 text-slate-400">
            <span className="spinner-sm" aria-hidden="true" />
            <span className="text-sm">Loading role intelligence...</span>
          </div>
        )}

        {/* Profile sections */}
        {profile && <RichJobProfile profile={profile} />}

      </div>
    </>
  );
}
