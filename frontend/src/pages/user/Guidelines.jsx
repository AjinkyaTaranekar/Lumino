import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import {
  BookOpen,
  CheckCircle,
  XCircle,
  Layers,
  Briefcase,
  FolderOpen,
  Globe,
  Heart,
  FileText,
  ArrowLeft,
} from 'lucide-react';

function GuideCard({ icon: Icon, iconBg, iconColor, title, dos, donts, example }) {
  return (
    <div className="card card-p flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <h2 className="font-semibold text-content-primary text-sm">{title}</h2>
      </div>

      <ul className="space-y-2">
        {dos.map((text, i) => (
          <li key={i} className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-success-500 flex-shrink-0 mt-0.5" />
            <span className="text-content-secondary text-sm">{text}</span>
          </li>
        ))}
        {donts.map((text, i) => (
          <li key={i} className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-danger-500 flex-shrink-0 mt-0.5" />
            <span className="text-content-secondary text-sm">{text}</span>
          </li>
        ))}
      </ul>

      {example && (
        <div className="space-y-1.5 pt-1 border-t border-surface-border">
          <p className="text-xs font-medium text-content-muted">{example.label}</p>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 rounded-lg text-xs bg-success-50 border border-success-100 text-success-700">
              ✓ {example.good}
            </div>
            <div className="flex-1 px-3 py-2 rounded-lg text-xs bg-danger-50 border border-danger-100 text-danger-600">
              ✗ {example.bad}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Guidelines() {
  return (
    <Layout>
      <div className="min-h-screen bg-surface-bg pb-12">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">

          {/* Back link */}
          <Link
            to="/user/upload"
            className="inline-flex items-center gap-1.5 text-sm text-content-muted hover:text-primary-500 transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Upload
          </Link>

          {/* Hero header */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-primary-50 border border-primary-200 flex-shrink-0">
              <BookOpen className="w-6 h-6 text-primary-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-content-primary">Resume Guide</h1>
              <p className="text-sm text-content-muted mt-0.5">
                Format your resume to get the most accurate knowledge graph
              </p>
            </div>
          </div>

          {/* Info callout */}
          <div className="alert-info flex items-start gap-3 mb-8">
            <FileText className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-content-secondary">
              Lumino extracts{' '}
              <strong className="text-primary-600">skills</strong>,{' '}
              <strong className="text-primary-600">domains</strong>,{' '}
              <strong className="text-primary-600">experiences</strong>,{' '}
              <strong className="text-primary-600">projects</strong>, and{' '}
              <strong className="text-primary-600">work style preferences</strong>{' '}
              from your resume using an LLM. The clearer these sections are, the richer
              your knowledge graph — and the better the job matches.
            </p>
          </div>

          {/* Guide cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            <GuideCard
              icon={FileText}
              iconBg="bg-primary-50"
              iconColor="text-primary-500"
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
              iconBg="bg-danger-50"
              iconColor="text-danger-500"
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
              iconBg="bg-warning-50"
              iconColor="text-warning-600"
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
                "Vague entries like 'personal project — various technologies'",
              ]}
              example={{
                label: 'Project entry',
                good: 'JobGraph (React, FastAPI, Neo4j) — graph-based job matching engine',
                bad: 'Full-stack web application',
              }}
            />

            <GuideCard
              icon={Globe}
              iconBg="bg-success-50"
              iconColor="text-success-600"
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
              iconBg="bg-danger-50"
              iconColor="text-danger-500"
              title="Work Style Preferences"
              dos={[
                'Mention your preferred work environment in a summary or profile section',
                "Use recognisable phrases: 'remote-first', 'startup culture', 'high-autonomy', 'collaborative'",
                'These feed the culture matching score against job requirements',
              ]}
              donts={[
                'Leaving this section out entirely — culture score will be zero',
              ]}
            />

          </div>

          {/* Work style recognised terms note */}
          <div className="mt-5 card card-p bg-primary-50 border border-primary-200">
            <p className="text-xs text-content-secondary">
              <span className="font-semibold text-primary-600">Recognised work style terms: </span>
              remote, hybrid, onsite, startup, fast-paced, high-autonomy, collaborative,
              data-driven, agile, async, design-focused
            </p>
          </div>

          {/* Bottom CTA */}
          <div className="mt-8 card card-p flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="font-medium text-content-primary text-sm">Ready to upload your resume?</p>
              <p className="text-xs text-content-muted mt-0.5">
                Follow the guide above for the richest knowledge graph.
              </p>
            </div>
            <Link to="/user/upload" className="btn-primary btn-sm flex-shrink-0">
              Upload Resume
              <ArrowLeft className="w-3.5 h-3.5 ml-1 rotate-180" />
            </Link>
          </div>

        </div>
      </div>
    </Layout>
  );
}
