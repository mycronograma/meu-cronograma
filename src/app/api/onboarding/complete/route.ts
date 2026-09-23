import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createDefaultOnboardingSetup } from '@/services/onboarding';
import type { OnboardingAnswers } from '@/types';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const answers = body.answers as OnboardingAnswers;
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!answers) {
      return NextResponse.json({ error: 'Respostas não enviadas' }, { status: 400 });
    }

    const setup = createDefaultOnboardingSetup(answers);
    setup.profile.userId = userId;

    try {
      await prisma.userProfile.upsert({
        where: { userId },
        update: {
          ...setup.profile,
          active_days: JSON.stringify(setup.profile.active_days),
          focus_subjects: JSON.stringify(setup.profile.focus_subjects),
        },
        create: {
          ...setup.profile,
          active_days: JSON.stringify(setup.profile.active_days),
          focus_subjects: JSON.stringify(setup.profile.focus_subjects),
        },
      });
    } catch (err) {
      console.warn('Não foi possível salvar no banco (Prisma):', err);
    }

    return NextResponse.json(setup);
  } catch (error) {
    console.error('Erro no onboarding:', error);
    return NextResponse.json({ error: 'Falha ao completar onboarding' }, { status: 500 });
  }
}
