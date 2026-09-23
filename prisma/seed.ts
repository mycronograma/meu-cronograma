/**
 * Database Seed Script
 * Populates the database with mock data for development and testing
 */

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to generate random number in range
const randomInRange = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Helper to generate random date in past days
const randomPastDate = (maxDaysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - randomInRange(0, maxDaysAgo));
  return date;
};

// Subject colors
const subjectColors = [
  '#00B4FF', // Neon Blue
  '#7F00FF', // Neon Purple
  '#00FFC8', // Neon Cyan
  '#FF00AA', // Neon Pink
  '#FFAA00', // Orange
  '#00FF88', // Green
];

// Achievement definitions
const achievementData = [
  {
    name: 'Getting Started',
    description: 'Maintain a 3-day study streak',
    icon: 'flame',
    xpReward: 50,
    condition: JSON.stringify({ type: 'streak', value: 3 }),
    rarity: 'common',
  },
  {
    name: 'Week Warrior',
    description: 'Maintain a 7-day study streak',
    icon: 'flame',
    xpReward: 150,
    condition: JSON.stringify({ type: 'streak', value: 7 }),
    rarity: 'rare',
  },
  {
    name: 'Monthly Master',
    description: 'Maintain a 30-day study streak',
    icon: 'flame',
    xpReward: 500,
    condition: JSON.stringify({ type: 'streak', value: 30 }),
    rarity: 'epic',
  },
  {
    name: 'First Steps',
    description: 'Study for 10 total hours',
    icon: 'clock',
    xpReward: 100,
    condition: JSON.stringify({ type: 'hours', value: 10 }),
    rarity: 'common',
  },
  {
    name: 'Dedicated Learner',
    description: 'Study for 50 total hours',
    icon: 'clock',
    xpReward: 300,
    condition: JSON.stringify({ type: 'hours', value: 50 }),
    rarity: 'rare',
  },
  {
    name: 'Knowledge Seeker',
    description: 'Study for 100 total hours',
    icon: 'clock',
    xpReward: 600,
    condition: JSON.stringify({ type: 'hours', value: 100 }),
    rarity: 'epic',
  },
  {
    name: 'Consistent Student',
    description: 'Complete 10 study sessions',
    icon: 'check-circle',
    xpReward: 75,
    condition: JSON.stringify({ type: 'sessions', value: 10 }),
    rarity: 'common',
  },
  {
    name: 'Session Pro',
    description: 'Complete 50 study sessions',
    icon: 'check-circle',
    xpReward: 250,
    condition: JSON.stringify({ type: 'sessions', value: 50 }),
    rarity: 'rare',
  },
  {
    name: 'Rising Star',
    description: 'Reach level 5',
    icon: 'star',
    xpReward: 200,
    condition: JSON.stringify({ type: 'level', value: 5 }),
    rarity: 'common',
  },
  {
    name: 'Veteran Scholar',
    description: 'Reach level 10',
    icon: 'star',
    xpReward: 400,
    condition: JSON.stringify({ type: 'level', value: 10 }),
    rarity: 'rare',
  },
];

async function main() {
  console.log('🌱 Starting database seed...\n');
  const demoPasswordHash = await bcrypt.hash('Nexora@123', 12);

  // Clean existing data
  console.log('🧹 Cleaning existing data...');
  await prisma.userAchievement.deleteMany();
  await prisma.studySession.deleteMany();
  await prisma.studyBlock.deleteMany();
  await prisma.weeklyStats.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.presetSubject.deleteMany();
  await prisma.studyPreset.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.user.deleteMany();

  // Create achievements
  console.log('🏆 Creating achievements...');
  const achievements = await Promise.all(
    achievementData.map((data) =>
      prisma.achievement.create({ data })
    )
  );
  console.log(`   Created ${achievements.length} achievements`);

  // Create study presets
  console.log('📋 Creating study presets...');
  
  // ENEM Preset
  const enemPreset = await prisma.studyPreset.create({
    data: {
      name: 'ENEM',
      description: 'Preparação completa para o Exame Nacional do Ensino Médio com todas as áreas do conhecimento',
      subjects: {
        create: [
          { name: 'Matemática', priority: 5, difficulty: 4, recommendedWeeklyHours: 12 },
          { name: 'Redação', priority: 5, difficulty: 3, recommendedWeeklyHours: 8 },
          { name: 'Português / Linguagens', priority: 4, difficulty: 3, recommendedWeeklyHours: 10 },
          { name: 'Biologia', priority: 4, difficulty: 3, recommendedWeeklyHours: 8 },
          { name: 'Física', priority: 4, difficulty: 4, recommendedWeeklyHours: 8 },
          { name: 'Química', priority: 4, difficulty: 4, recommendedWeeklyHours: 8 },
          { name: 'História', priority: 3, difficulty: 2, recommendedWeeklyHours: 6 },
          { name: 'Geografia', priority: 3, difficulty: 2, recommendedWeeklyHours: 6 },
          { name: 'Filosofia', priority: 3, difficulty: 2, recommendedWeeklyHours: 4 },
          { name: 'Sociologia', priority: 3, difficulty: 2, recommendedWeeklyHours: 4 },
        ],
      },
    },
    include: {
      subjects: true,
    },
  });
  console.log(`   Created ENEM preset with ${enemPreset.subjects.length} subjects`);

  // Medicina Preset
  const medicinaPreset = await prisma.studyPreset.create({
    data: {
      name: 'Medicina',
      description: 'Preparação para vestibular de Medicina com foco em ciências da natureza e exatas',
      subjects: {
        create: [
          { name: 'Biologia Avançada', priority: 5, difficulty: 5, recommendedWeeklyHours: 15 },
          { name: 'Química Avançada', priority: 5, difficulty: 5, recommendedWeeklyHours: 12 },
          { name: 'Física', priority: 4, difficulty: 4, recommendedWeeklyHours: 10 },
          { name: 'Matemática', priority: 4, difficulty: 4, recommendedWeeklyHours: 10 },
          { name: 'Redação', priority: 4, difficulty: 3, recommendedWeeklyHours: 8 },
          { name: 'Português', priority: 3, difficulty: 2, recommendedWeeklyHours: 6 },
          { name: 'História', priority: 2, difficulty: 2, recommendedWeeklyHours: 4 },
          { name: 'Geografia', priority: 2, difficulty: 2, recommendedWeeklyHours: 4 },
        ],
      },
    },
    include: {
      subjects: true,
    },
  });
  console.log(`   Created Medicina preset with ${medicinaPreset.subjects.length} subjects`);

  // Concursos Preset
  const concursosPreset = await prisma.studyPreset.create({
    data: {
      name: 'Concursos Públicos',
      description: 'Preparação para concursos públicos com foco em português, raciocínio lógico e direito',
      subjects: {
        create: [
          { name: 'Português', priority: 5, difficulty: 3, recommendedWeeklyHours: 12 },
          { name: 'Raciocínio Lógico', priority: 4, difficulty: 4, recommendedWeeklyHours: 10 },
          { name: 'Direito Constitucional', priority: 4, difficulty: 3, recommendedWeeklyHours: 8 },
          { name: 'Direito Administrativo', priority: 4, difficulty: 3, recommendedWeeklyHours: 8 },
          { name: 'Informática', priority: 3, difficulty: 2, recommendedWeeklyHours: 6 },
          { name: 'Atualidades', priority: 3, difficulty: 2, recommendedWeeklyHours: 6 },
        ],
      },
    },
    include: {
      subjects: true,
    },
  });
  console.log(`   Created Concursos preset with ${concursosPreset.subjects.length} subjects`);

  // Create demo user
  console.log('👤 Creating demo user...');
  const user = await prisma.user.create({
    data: {
      email: 'alex.chen@nexora.dev',
      name: 'Alex Chen',
      passwordHash: demoPasswordHash,
      emailVerified: new Date(),
      xp: 15450,
      level: 12,
      streak: 7,
      longestStreak: 14,
      lastStudyDate: new Date(),
      dailyGoalHours: 4.0,
      preferredStart: '09:00',
      preferredEnd: '21:00',
      maxBlockMinutes: 120,
      breakMinutes: 15,
      aiDifficulty: 'adaptive',
      focusMode: false,
    },
  });
  console.log(`   Created user: ${user.name} (${user.email})`);

  // Create subjects
  console.log('📚 Creating subjects...');
  const subjectsData = [
    {
      name: 'Mathematics',
      color: '#00B4FF',
      icon: 'calculator',
      priority: 8,
      difficulty: 7,
      targetHours: 12,
      completedHours: 8.5,
      totalHours: 156,
      sessionsCount: 45,
      averageScore: 82,
    },
    {
      name: 'Physics',
      color: '#7F00FF',
      icon: 'atom',
      priority: 9,
      difficulty: 8,
      targetHours: 10,
      completedHours: 6,
      totalHours: 98,
      sessionsCount: 32,
      averageScore: 78,
    },
    {
      name: 'Computer Science',
      color: '#00FFC8',
      icon: 'code',
      priority: 10,
      difficulty: 6,
      targetHours: 15,
      completedHours: 12,
      totalHours: 234,
      sessionsCount: 78,
      averageScore: 91,
    },
    {
      name: 'Chemistry',
      color: '#FF00AA',
      icon: 'flask',
      priority: 7,
      difficulty: 7,
      targetHours: 8,
      completedHours: 5.5,
      totalHours: 87,
      sessionsCount: 28,
      averageScore: 75,
    },
    {
      name: 'Biology',
      color: '#FFAA00',
      icon: 'leaf',
      priority: 6,
      difficulty: 5,
      targetHours: 6,
      completedHours: 4,
      totalHours: 45,
      sessionsCount: 15,
      averageScore: 85,
    },
    {
      name: 'English Literature',
      color: '#AA88FF',
      icon: 'book',
      priority: 5,
      difficulty: 4,
      targetHours: 5,
      completedHours: 5,
      totalHours: 62,
      sessionsCount: 20,
      averageScore: 88,
    },
  ];

  const subjects = await Promise.all(
    subjectsData.map((data) =>
      prisma.subject.create({
        data: {
          ...data,
          userId: user.id,
        },
      })
    )
  );
  console.log(`   Created ${subjects.length} subjects`);

  // Create study blocks for today and upcoming days
  console.log('📅 Creating study blocks...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const blocksData = [
    // Today's blocks
    {
      subjectId: subjects[0].id, // Mathematics
      date: today,
      startTime: '09:00',
      endTime: '11:00',
      durationMinutes: 120,
      status: 'completed',
    },
    {
      subjectId: subjects[0].id,
      date: today,
      startTime: '11:00',
      endTime: '11:15',
      durationMinutes: 15,
      status: 'completed',
      isBreak: true,
    },
    {
      subjectId: subjects[1].id, // Physics
      date: today,
      startTime: '11:15',
      endTime: '13:00',
      durationMinutes: 105,
      status: 'in-progress',
    },
    {
      subjectId: subjects[2].id, // CS
      date: today,
      startTime: '14:00',
      endTime: '16:00',
      durationMinutes: 120,
      status: 'scheduled',
    },
    {
      subjectId: subjects[3].id, // Chemistry
      date: today,
      startTime: '16:15',
      endTime: '17:30',
      durationMinutes: 75,
      status: 'scheduled',
    },
  ];

  // Add blocks for next 6 days
  for (let dayOffset = 1; dayOffset <= 6; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);

    // Skip Sunday (day 0)
    if (date.getDay() === 0) continue;

    // Random subjects for each day
    const shuffledSubjects = [...subjects].sort(() => Math.random() - 0.5);
    let currentTime = 9 * 60; // Start at 9:00 AM

    for (let i = 0; i < 3; i++) {
      const subject = shuffledSubjects[i];
      const duration = randomInRange(60, 120);

      if (currentTime + duration <= 18 * 60) {
        blocksData.push({
          subjectId: subject.id,
          date,
          startTime: `${Math.floor(currentTime / 60)
            .toString()
            .padStart(2, '0')}:${(currentTime % 60).toString().padStart(2, '0')}`,
          endTime: `${Math.floor((currentTime + duration) / 60)
            .toString()
            .padStart(2, '0')}:${((currentTime + duration) % 60)
            .toString()
            .padStart(2, '0')}`,
          durationMinutes: duration,
          status: 'scheduled',
        });

        currentTime += duration + 15; // Add break time
      }
    }
  }

  const blocks = await Promise.all(
    blocksData.map((data) =>
      prisma.studyBlock.create({
        data: {
          ...data,
          userId: user.id,
          isBreak: data.isBreak || false,
          isAutoGenerated: true,
        },
      })
    )
  );
  console.log(`   Created ${blocks.length} study blocks`);

  // Create past study sessions
  console.log('📝 Creating study sessions...');
  const sessionsData = [];

  for (let dayOffset = 1; dayOffset <= 30; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);

    // Skip some days randomly (weekends more likely)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    if (isWeekend && Math.random() > 0.3) continue;
    if (!isWeekend && Math.random() > 0.85) continue;

    // Create 2-4 sessions per day
    const sessionCount = randomInRange(2, 4);
    for (let i = 0; i < sessionCount; i++) {
      const subject = subjects[randomInRange(0, subjects.length - 1)];
      const plannedMinutes = randomInRange(45, 120);
      const actualMinutes = plannedMinutes - randomInRange(-15, 20);
      const focusScore = randomInRange(60, 95);
      const productivityScore = randomInRange(55, 95);

      const startedAt = new Date(date);
      startedAt.setHours(9 + i * 3, randomInRange(0, 30));

      const endedAt = new Date(startedAt);
      endedAt.setMinutes(endedAt.getMinutes() + actualMinutes);

      sessionsData.push({
        userId: user.id,
        subjectId: subject.id,
        startedAt,
        endedAt,
        plannedMinutes,
        actualMinutes: Math.max(actualMinutes, 0),
        focusScore,
        productivityScore,
        xpEarned: Math.floor(actualMinutes * (focusScore / 100) * 1.5),
      });
    }
  }

  const sessions = await Promise.all(
    sessionsData.map((data) => prisma.studySession.create({ data }))
  );
  console.log(`   Created ${sessions.length} study sessions`);

  // Unlock some achievements for the user
  console.log('🎖️ Unlocking achievements...');
  const achievementsToUnlock = achievements.filter(
    (a) => a.rarity === 'common' || (a.rarity === 'rare' && Math.random() > 0.5)
  );

  await Promise.all(
    achievementsToUnlock.map((achievement) =>
      prisma.userAchievement.create({
        data: {
          userId: user.id,
          achievementId: achievement.id,
          unlockedAt: randomPastDate(60),
        },
      })
    )
  );
  console.log(`   Unlocked ${achievementsToUnlock.length} achievements`);

  // Create weekly stats
  console.log('📊 Creating weekly stats...');
  for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - weekOffset * 7 + 1);
    weekStart.setHours(0, 0, 0, 0);

    const dailyBreakdown = [];
    for (let day = 0; day < 7; day++) {
      const hours = day === 0 || day === 6 ? randomInRange(1, 3) : randomInRange(3, 6);
      dailyBreakdown.push({
        date: new Date(weekStart.getTime() + day * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        hours: hours + Math.random(),
        sessions: randomInRange(2, 5),
        focusScore: randomInRange(65, 90),
      });
    }

    await prisma.weeklyStats.create({
      data: {
        userId: user.id,
        weekStart,
        totalHours: dailyBreakdown.reduce((sum, d) => sum + d.hours, 0),
        sessionsCount: dailyBreakdown.reduce((sum, d) => sum + d.sessions, 0),
        avgFocusScore:
          dailyBreakdown.reduce((sum, d) => sum + d.focusScore, 0) / 7,
        avgProductivity: randomInRange(65, 85),
        goalsCompleted: randomInRange(3, 6),
        xpEarned: randomInRange(500, 1500),
        dailyBreakdown: JSON.stringify(dailyBreakdown),
      },
    });
  }
  console.log('   Created 8 weeks of stats');

  console.log('\n✅ Database seeded successfully!');
  console.log('\n📋 Summary:');
  console.log(`   • 1 user (${user.email})`);
  console.log(`   • ${subjects.length} subjects`);
  console.log(`   • ${blocks.length} study blocks`);
  console.log(`   • ${sessions.length} study sessions`);
  console.log(`   • ${achievements.length} achievements (${achievementsToUnlock.length} unlocked)`);
  console.log(`   • 8 weeks of stats\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
