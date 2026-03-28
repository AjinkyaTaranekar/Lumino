import {
  Award,
  BookOpen,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Heart,
  Layers,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import type {
  JobCompanyProfile,
  JobCompensation,
  JobEducationRequirement,
  JobHiringTeam,
  JobPreferredQualification,
  JobRoleExpectation,
  JobSoftRequirement,
  RichJobProfile,
} from '../lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-lumino overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
            <Icon className="w-3.5 h-3.5 text-primary-500" aria-hidden="true" />
          </div>
          <span className="text-sm font-semibold text-indigo-950">{title}</span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-slate-400" />
          : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  );
}

function Chip({ label, variant = 'default' }: { label: string; variant?: 'default' | 'green' | 'amber' | 'red' | 'indigo' }) {
  const cls = {
    default: 'bg-slate-100 text-slate-600',
    green:   'bg-emerald-50 text-emerald-700 border border-emerald-100',
    amber:   'bg-amber-50 text-amber-700 border border-amber-100',
    red:     'bg-red-50 text-red-600 border border-red-100',
    indigo:  'bg-indigo-50 text-indigo-600 border border-indigo-100',
  }[variant];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function importanceChip(importance: string) {
  switch (importance) {
    case 'strongly_preferred': return <Chip label="Strongly preferred" variant="amber" />;
    case 'preferred':          return <Chip label="Preferred" variant="indigo" />;
    default:                   return <Chip label="Nice to have" variant="default" />;
  }
}

// ── Section renderers ─────────────────────────────────────────────────────────

function CompanySection({ profile }: { profile: JobCompanyProfile }) {
  return (
    <div className="space-y-3 mt-2">
      {profile.mission && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Mission</p>
          <p className="text-sm text-slate-700 leading-relaxed">{profile.mission}</p>
        </div>
      )}
      {profile.vision && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Vision</p>
          <p className="text-sm text-slate-700 leading-relaxed">{profile.vision}</p>
        </div>
      )}
      {profile.product_description && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Product</p>
          <p className="text-sm text-slate-700 leading-relaxed">{profile.product_description}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {profile.stage && <Chip label={profile.stage} variant="indigo" />}
        {profile.industry && <Chip label={profile.industry} variant="default" />}
        {profile.values?.map(v => <Chip key={v} label={v} variant="green" />)}
        {profile.notable_tech?.map(t => <Chip key={t} label={t} variant="default" />)}
      </div>
    </div>
  );
}

function TeamSection({ team }: { team: JobHiringTeam }) {
  return (
    <div className="space-y-3 mt-2">
      {team.name && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-indigo-950">{team.name}</span>
          {team.team_type && <Chip label={team.team_type} variant="indigo" />}
          {team.team_size_est && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Users className="w-3 h-3" aria-hidden="true" />
              {team.team_size_est}
            </span>
          )}
        </div>
      )}
      {team.description && <p className="text-sm text-slate-700 leading-relaxed">{team.description}</p>}
      {team.product_built && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Builds</p>
          <p className="text-sm text-slate-700">{team.product_built}</p>
        </div>
      )}
      {team.reports_to && (
        <p className="text-xs text-slate-400">Reports to: <span className="text-slate-600">{team.reports_to}</span></p>
      )}
      {team.tech_focus && team.tech_focus.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {team.tech_focus.map(t => <Chip key={t} label={t} variant="default" />)}
        </div>
      )}
    </div>
  );
}

function RoleSection({ role }: { role: JobRoleExpectation }) {
  return (
    <div className="space-y-3 mt-2">
      {role.key_responsibilities && role.key_responsibilities.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Key Responsibilities</p>
          <ul className="space-y-1">
            {role.key_responsibilities.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-primary-400 mt-0.5 flex-shrink-0">•</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {role.success_metrics && role.success_metrics.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Success Metrics</p>
          <ul className="space-y-1">
            {role.success_metrics.map((m, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <Target className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {role.first_30_days && (
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">First 30 Days</p>
            <p className="text-xs text-slate-700 leading-relaxed">{role.first_30_days}</p>
          </div>
        )}
        {role.first_90_days && (
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">First 90 Days</p>
            <p className="text-xs text-slate-700 leading-relaxed">{role.first_90_days}</p>
          </div>
        )}
      </div>
      {role.autonomy_level && (
        <div className="flex items-center gap-2">
          <p className="text-xs text-slate-400">Autonomy level:</p>
          <Chip
            label={role.autonomy_level}
            variant={role.autonomy_level === 'high' ? 'green' : role.autonomy_level === 'low' ? 'red' : 'indigo'}
          />
        </div>
      )}
    </div>
  );
}

function CompensationSection({ comp }: { comp: JobCompensation }) {
  const hasSalary = comp.is_disclosed && (comp.salary_min || comp.salary_max);
  return (
    <div className="space-y-3 mt-2">
      {hasSalary ? (
        <div className="flex items-center gap-3">
          <DollarSign className="w-4 h-4 text-emerald-500 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold text-indigo-950">
            {comp.currency ?? 'USD'}{' '}
            {comp.salary_min?.toLocaleString() ?? '?'} – {comp.salary_max?.toLocaleString() ?? '?'}
            <span className="text-xs text-slate-400 font-normal ml-1">/ year</span>
          </span>
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">Salary not disclosed</p>
      )}
      {comp.equity && (
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-500">Equity: </span>{comp.equity}
        </p>
      )}
      {comp.bonus_structure && (
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-500">Bonus: </span>{comp.bonus_structure}
        </p>
      )}
      {comp.benefits && comp.benefits.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Benefits</p>
          <div className="flex flex-wrap gap-1.5">
            {comp.benefits.map(b => <Chip key={b} label={b} variant="green" />)}
          </div>
        </div>
      )}
    </div>
  );
}

function EducationSection({ reqs }: { reqs: JobEducationRequirement[] }) {
  return (
    <div className="space-y-2 mt-2">
      {reqs.map((r, i) => (
        <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-indigo-950">
                {r.degree_level.charAt(0).toUpperCase() + r.degree_level.slice(1)}
                {r.field ? ` in ${r.field}` : ''}
              </span>
              {r.is_required
                ? <Chip label="Required" variant="red" />
                : <Chip label="Preferred" variant="indigo" />}
            </div>
            {r.description && <p className="text-xs text-slate-400 mt-0.5">{r.description}</p>}
            {r.alternatives && r.alternatives.length > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">
                Alternatives: {r.alternatives.join(', ')}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PreferredQualSection({ quals }: { quals: JobPreferredQualification[] }) {
  return (
    <div className="space-y-2 mt-2">
      {quals.map((q, i) => (
        <div key={i} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-indigo-950">{q.value}</span>
              {importanceChip(q.importance)}
              <Chip label={q.type} variant="default" />
            </div>
            {q.description && <p className="text-xs text-slate-400 mt-0.5">{q.description}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SoftReqSection({ reqs }: { reqs: JobSoftRequirement[] }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {reqs.map((r, i) => (
        <div
          key={i}
          title={r.description ?? undefined}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border ${
            r.is_dealbreaker
              ? 'bg-red-50 border-red-100 text-red-700'
              : 'bg-slate-50 border-slate-100 text-slate-700'
          }`}
        >
          {r.is_dealbreaker && <Zap className="w-3 h-3 flex-shrink-0" aria-hidden="true" />}
          <span className="font-medium">{r.trait}</span>
          {r.is_dealbreaker && <span className="text-[10px] text-red-500 font-semibold">MUST</span>}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RichJobProfile({ profile }: { profile: RichJobProfile }) {
  const hasCompany       = !!profile.company_profile?.mission || !!profile.company_profile?.product_description;
  const hasTeam          = !!profile.hiring_team?.name || !!profile.hiring_team?.description;
  const hasRole          = (profile.role_expectations?.key_responsibilities?.length ?? 0) > 0;
  const hasCompensation  = !!profile.compensation;
  const hasEducation     = (profile.education_requirements?.length ?? 0) > 0;
  const hasPrefQuals     = (profile.preferred_qualifications?.length ?? 0) > 0;
  const hasSoftReqs      = (profile.soft_requirements?.length ?? 0) > 0;

  return (
    <div className="space-y-3">
      {hasCompany && (
        <Section icon={Building2} title="Company">
          <CompanySection profile={profile.company_profile!} />
        </Section>
      )}

      {hasTeam && (
        <Section icon={Users} title="Hiring Team">
          <TeamSection team={profile.hiring_team!} />
        </Section>
      )}

      {hasRole && (
        <Section icon={Briefcase} title="The Role">
          <RoleSection role={profile.role_expectations!} />
        </Section>
      )}

      {hasCompensation && (
        <Section icon={DollarSign} title="Compensation">
          <CompensationSection comp={profile.compensation!} />
        </Section>
      )}

      {hasEducation && (
        <Section icon={BookOpen} title="Education Requirements">
          <EducationSection reqs={profile.education_requirements!} />
        </Section>
      )}

      {hasPrefQuals && (
        <Section icon={Award} title="Preferred Qualifications" defaultOpen={false}>
          <PreferredQualSection quals={profile.preferred_qualifications!} />
        </Section>
      )}

      {hasSoftReqs && (
        <Section icon={Heart} title="Soft Requirements" defaultOpen={false}>
          <SoftReqSection reqs={profile.soft_requirements!} />
        </Section>
      )}

      {!hasCompany && !hasTeam && !hasRole && !hasCompensation && !hasEducation && !hasPrefQuals && !hasSoftReqs && (
        <div className="text-center py-12">
          <Layers className="w-10 h-10 text-slate-200 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-slate-400">No deep profile data extracted yet.</p>
          <p className="text-xs text-slate-300 mt-1">Re-ingest this job with a richer posting text to populate profile sections.</p>
        </div>
      )}
    </div>
  );
}
