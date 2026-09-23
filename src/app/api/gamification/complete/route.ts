import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { estimateMissionXp, toBrazilDateKey, trainerLevelFromXp } from '@/services/studyTrainer';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const readPositiveMinutes = (value: unknown) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return null;
  return Math.min(480, Math.max(1, Math.round(minutes)));
};

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!isRecord(body) || typeof body.blockId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Bloco de estudo invalido.' },
        { status: 400 }
      );
    }

    const minutesSpent = readPositiveMinutes(body.minutesSpent);
    if (!minutesSpent) {
      return NextResponse.json(
        { success: false, error: 'Tempo de estudo invalido.' },
        { status: 400 }
      );
    }

    const block = await prisma.studyBlock.findFirst({
      where: {
        id: body.blockId,
        userId,
      },
      select: {
        id: true,
        userId: true,
        subjectId: true,
        durationMinutes: true,
        isBreak: true,
        status: true,
      },
    });

    if (!block || block.isBreak) {
      return NextResponse.json(
        { success: false, error: 'Missao de estudo nao encontrada.' },
        { status: 404 }
      );
    }

    if (block.status === 'completed') {
      return NextResponse.json(
        { success: true, duplicate: true, xpEarned: 0, message: 'Missao ja concluida.' }
      );
    }

    const now = new Date();
    const eventKey = `task:${block.id}:complete`;
    const xpEarned = estimateMissionXp(minutesSpent);
    const dateKey = toBrazilDateKey(now);

    const result = await prisma.$transaction(async (tx) => {
      const existingEvent = await tx.xpEvent.findUnique({
        where: {
          userId_eventKey: {
            userId,
            eventKey,
          },
        },
      });

      if (existingEvent) {
        return {
          duplicate: true,
          xpEarned: 0,
          totalXp: null,
          level: null,
        };
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { xp: true },
      });

      if (!user) {
        throw new Error('Usuario nao encontrado.');
      }

      const newTotalXp = Math.max(0, user.xp + xpEarned);
      const nextLevel = trainerLevelFromXp(newTotalXp).level;

      await tx.xpEvent.create({
        data: {
          userId,
          eventKey,
          source: 'task',
          sourceId: block.id,
          blockId: block.id,
          amount: xpEarned,
          reason: 'Missao de estudo concluida',
          dateKey,
          metadata: {
            minutesSpent,
            plannedMinutes: block.durationMinutes,
            subjectId: block.subjectId,
          } as Prisma.InputJsonValue,
        },
      });

      await tx.studySession.upsert({
        where: { blockId: block.id },
        update: {
          endedAt: now,
          actualMinutes: minutesSpent,
          xpEarned,
        },
        create: {
          userId,
          subjectId: block.subjectId,
          blockId: block.id,
          startedAt: now,
          endedAt: now,
          plannedMinutes: block.durationMinutes,
          actualMinutes: minutesSpent,
          xpEarned,
        },
      });

      await tx.studyBlock.update({
        where: { id: block.id },
        data: {
          status: 'completed',
          completedAt: now,
          durationMinutes: minutesSpent,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          xp: newTotalXp,
          level: nextLevel,
          lastStudyDate: now,
        },
      });

      return {
        duplicate: false,
        xpEarned,
        totalXp: newTotalXp,
        level: nextLevel,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Gamification complete error:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao validar XP da sessao.' },
      { status: 500 }
    );
  }
}
