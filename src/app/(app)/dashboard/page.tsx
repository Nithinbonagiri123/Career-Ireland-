import { ArrowUpRight, Briefcase, Trophy, UserPlus, Users } from 'lucide-react';
import { FadeUp, StaggerContainer, StaggerItem } from '@/components/motion/motion-primitives';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const stats = [
  { label: 'Active candidates', value: '—', delta: 'Awaiting first import', icon: Users },
  { label: 'New leads (7d)', value: '—', delta: 'Awaiting lead intake', icon: UserPlus },
  { label: 'Open requisitions', value: '—', delta: 'Awaiting employers', icon: Briefcase },
  { label: 'Placements (30d)', value: '—', delta: 'Awaiting first placement', icon: Trophy },
] as const;

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              Foundation
            </Badge>
            <span className="text-xs text-muted-foreground">Milestone 5.0</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Good day, team.</h1>
          <p className="text-sm text-muted-foreground">
            The shell is live. Real data appears as modules ship in Milestone 5.1 onward.
          </p>
        </div>
      </FadeUp>

      <StaggerContainer className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <StaggerItem key={s.label}>
            <Card className="transition-shadow hover:shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs">{s.label}</CardDescription>
                  <s.icon className="size-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-3xl font-semibold tracking-tight">{s.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowUpRight className="size-3" />
                  {s.delta}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <FadeUp delay={0.15} className="mt-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What's next</CardTitle>
            <CardDescription>The roadmap ships vertically — one module at a time.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Milestone 5.1 (Users & Auth) adds real login, password hashing, session cookies,
            middleware protection, and an admin seed script. Once you provision a Neon database and
            set <code className="rounded bg-muted px-1 py-0.5 text-xs">DATABASE_URL</code>, we can
            begin.
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}
