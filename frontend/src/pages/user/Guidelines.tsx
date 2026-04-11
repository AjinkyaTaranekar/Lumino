import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  CheckCircle,
  FileText,
  FolderOpen,
  Globe,
  Heart,
  Layers,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GuideExample {
  label: string;
  good: string;
  bad: string;
}

interface GuideCardProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  dos: string[];
  donts: string[];
  example?: GuideExample;
}

// ─── GuideCard ─────────────────────────────────────────────────────────────────

function GuideCard({ icon: Icon, iconBg, iconColor, title, dos, donts, example }: GuideCardProps) {
  return (
    <div className="card-lumino p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <h2 className="font-semibold text-indigo-950 text-sm">{title}</h2>
      </div>

      <ul className="space-y-2">
        {dos.map((text, i) => (
          <li key={`do-${i}`} className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span className="text-slate-600 text-sm">{text}</span>
          </li>
        ))}
        {donts.map((text, i) => (
          <li key={`dont-${i}`} className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <span className="text-slate-600 text-sm">{text}</span>
          </li>
        ))}
      </ul>

      {example && (
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-400">{example.label}</p>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 rounded-xl text-xs bg-emerald-50 border border-emerald-100 text-emerald-700 leading-relaxed">
              ✓ {example.good}
            </div>
            <div className="flex-1 px-3 py-2 rounded-xl text-xs bg-red-50 border border-red-100 text-red-600 leading-relaxed">
              ✗ {example.bad}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Guidelines ────────────────────────────────────────────────────────────────

export default function Guidelines() {
  return (
    <>
      <title>Resume Guide - Lumino</title>

      <div className="min-h-screen bg-slate-50 pb-12">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">

          {/* Back link */}
          <Link
            to="/user/upload"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-blue-500 transition-colors mb-6 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Upload
          </Link>

          {/* Hero header */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-50 border border-blue-100 flex-shrink-0">
              <BookOpen className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-indigo-950">Resume Quality Guide</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Format your resume to improve extraction quality, ranking confidence, and interview relevance.
              </p>
            </div>
          </div>

          {/* Info callout */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-2xl mb-8 bg-blue-50 border border-blue-100">
            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-600">
              Lumino extracts{' '}
              <strong className="text-blue-600">skills</strong>,{' '}
              <strong className="text-blue-600">domains</strong>,{' '}
              <strong className="text-blue-600">experiences</strong>,{' '}
              <strong className="text-blue-600">projects</strong>, and{' '}
              <strong className="text-blue-600">work style preferences</strong>{' '}
              from your resume using an LLM. The clearer these sections are, the more trustworthy your profile graph and match explanations become.
            </p>
          </div>

          {/* Guide cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <GuideCard
              icon={FileText}
              iconBg="bg-blue-50"
              iconColor="text-blue-500"
              title="File Format"
              dos={[
                'Use a PDF with a real text layer (not a scanned image)',
                'Keep it 1–2 pages for best extraction quality',
                'Use a clean, single-column layout where possible',
              ]}
              donts={[
                'Scanned or photographed resumes (text is not extractable)',
                'Heavy graphics, skill bars, or icons replacing text',
                'Tables with merged cells that break reading order',
              ]}
            />

            <GuideCard
              icon={Layers}
              iconBg="bg-red-50"
              iconColor="text-red-500"
              title="Skills Section"
              dos={[
                'List skills individually, separated by commas or bullets',
                'Group by category: Languages, Frameworks, Tools, Cloud',
                "Use standard names: 'PyTorch' not 'deep learning library'",
              ]}
              donts={[
                'Embedding skills only inside job description sentences',
                'Using skill-bar graphics instead of text',
              ]}
              example={{
                label: 'Skills line',
                good: 'Python, FastAPI, PostgreSQL, Docker, AWS',
                bad: 'Proficient in several backend technologies',
              }}
            />

            <GuideCard
              icon={Briefcase}
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
              title="Work Experience"
              dos={[
                'Include company name, job title, and dates',
                'Use bullet points that mention specific technologies',
                'State what you built or owned, not just responsibilities',
              ]}
              donts={[
                'Omitting the company name (breaks experience hierarchy)',
                'Paragraph blocks without mentioning any tech stack',
              ]}
              example={{
                label: 'Experience bullet',
                good: 'Built real-time pipeline using Kafka + Flink (Java) processing 1M events/day',
                bad: 'Worked on data infrastructure and improved system performance',
              }}
            />

            <GuideCard
              icon={FolderOpen}
              iconBg="bg-purple-50"
              iconColor="text-purple-500"
              title="Projects"
              dos={[
                'Name the project clearly',
                'List the tech stack used (language, frameworks, services)',
                'One-line description of what it does',
              ]}
              donts={[
                "Vague entries like 'personal project - various technologies'",
              ]}
              example={{
                label: 'Project entry',
                good: 'JobGraph (React, FastAPI, Neo4j) - graph-based job matching engine',
                bad: 'Full-stack web application',
              }}
            />

            <GuideCard
              icon={Globe}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
              title="Domain Keywords"
              dos={[
                'Use domain-specific terms in section headers or summaries',
                "Examples: 'machine learning', 'data engineering', 'fintech', 'devops'",
                "Mention industry context (e.g. 'healthcare AI', 'e-commerce platform')",
              ]}
              donts={[
                "Generic buzzwords with no domain signal ('results-driven professional')",
              ]}
              example={{
                label: 'Summary line',
                good: 'Backend engineer specialising in distributed systems and data engineering',
                bad: 'Experienced engineer looking for challenging opportunities',
              }}
            />

            <GuideCard
              icon={Heart}
              iconBg="bg-rose-50"
              iconColor="text-rose-500"
              title="Work Style Preferences"
              dos={[
                'Mention your preferred work environment in a summary or profile section',
                "Use recognisable phrases: 'remote-first', 'startup culture', 'high-autonomy', 'collaborative'",
                'These feed the culture matching score against job requirements',
              ]}
              donts={[
                'Leaving this section out entirely - culture score will be zero',
              ]}
            />

          </div>

          {/* Recognised work style terms */}
          <div className="mt-5 card-lumino p-4 bg-blue-50 border border-blue-100">
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-blue-600">Recognised work style terms: </span>
              remote, hybrid, onsite, startup, fast-paced, high-autonomy, collaborative,
              data-driven, agile, async, design-focused
            </p>
          </div>

          {/* Bottom CTA */}
          <div className="mt-8 card-lumino p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-medium text-indigo-950 text-sm">Ready to build a stronger profile graph?</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Use this checklist to maximize match quality before you upload.
              </p>
            </div>
            <Link
              to="/user/upload"
              className="btn-primary btn-sm flex-shrink-0 flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Upload Resume
              <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
            </Link>
          </div>

        </div>
      </div>
    </>
  );
}
