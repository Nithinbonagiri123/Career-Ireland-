import './_bootstrap-env';
import { db } from '@/lib/db/client';
import { skills } from '@/lib/db/schema/reference';
import { assertSetupTarget } from './_assert-local-db';

// Decision 8: manual-testing DB only with ALLOW_MANUAL_DB_MIGRATE=1.
// The db client connects lazily, so no query has run yet.
assertSetupTarget('seed-skills');

/**
 * Idempotent seed for the Skills catalog. The CV parser's catalog-hit
 * path (src/modules/cv-parse/suggest.ts) can only surface skills that
 * are already in this table — on a bare DB it returned nothing because
 * `skills` was empty. This bootstrap lets the catalog match common tech,
 * trade, office, and language skills found in most CVs.
 *
 * Tracey can keep adding niche skills via /admin/skills; this just means
 * every candidate's rescan has something to match on day one.
 *
 * Run via:  pnpm db:seed:skills
 */

const SKILLS: string[] = [
  // ─── Programming languages ─────────────────────────────────────
  'Python',
  'JavaScript',
  'TypeScript',
  'Java',
  'C',
  'C++',
  'C#',
  'Go',
  'Rust',
  'Ruby',
  'PHP',
  'Swift',
  'Kotlin',
  'Scala',
  'R',
  'MATLAB',
  'SQL',
  'Bash',
  'Shell scripting',

  // ─── Web / frontend ────────────────────────────────────────────
  'React',
  'Next.js',
  'Vue',
  'Angular',
  'Node.js',
  'Express',
  'HTML',
  'CSS',
  'Tailwind CSS',
  'GraphQL',
  'REST APIs',

  // ─── Databases ─────────────────────────────────────────────────
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'SQLite',
  'Oracle',
  'SQL Server',

  // ─── Cloud / DevOps ────────────────────────────────────────────
  'AWS',
  'Azure',
  'Google Cloud Platform',
  'Docker',
  'Kubernetes',
  'Terraform',
  'Ansible',
  'Jenkins',
  'GitHub Actions',
  'CI/CD',
  'Linux',
  'Nginx',

  // ─── Data / ML ─────────────────────────────────────────────────
  'Machine Learning',
  'Deep Learning',
  'TensorFlow',
  'PyTorch',
  'Pandas',
  'NumPy',
  'Scikit-learn',
  'Data Analysis',
  'Data Science',
  'ETL',
  'Power BI',
  'Tableau',

  // ─── Software engineering concepts ─────────────────────────────
  'Distributed Systems',
  'Microservices',
  'System Design',
  'Data Structures',
  'Algorithms',
  'Design Patterns',
  'Object-Oriented Programming',
  'Functional Programming',
  'Agile',
  'Scrum',
  'Test-Driven Development',
  'Git',
  'Unit Testing',

  // ─── Office / business ─────────────────────────────────────────
  'Microsoft Excel',
  'Microsoft Word',
  'Microsoft PowerPoint',
  'Microsoft Office',
  'Google Workspace',
  'Project Management',
  'Communication',
  'Leadership',
  'Teamwork',
  'Problem Solving',
  'Customer Service',

  // ─── Trade / manual ────────────────────────────────────────────
  'Forklift',
  'MIG Welding',
  'TIG Welding',
  'Plumbing',
  'Electrical',
  'Carpentry',
  'HGV Class 1',
  'HGV Class 2',

  // ─── Languages ─────────────────────────────────────────────────
  'English',
  'Irish',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Mandarin',
  'Hindi',
  'Arabic',
];

async function main() {
  // Rely on the unique(name) constraint for idempotency — ON CONFLICT
  // DO NOTHING skips any skill already present so re-runs are a no-op.
  const rows = SKILLS.map((name) => ({ name }));
  const inserted = await db
    .insert(skills)
    .values(rows)
    .onConflictDoNothing({ target: skills.name })
    .returning({ id: skills.id });
  console.log(
    `skills: ${inserted.length} inserted, ${rows.length - inserted.length} already present`,
  );
  console.log('✓ skills seed complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ skills seed failed:', err);
  process.exit(1);
});
