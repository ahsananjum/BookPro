const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const INDUSTRY_TEMPLATES = [
  {
    slug: 'beauty-hair-salon',
    name: 'Beauty & Hair Salon',
    description: 'Styling, haircutting, coloring, chair resource management & buffers',
    icon: 'Scissors',
    sortOrder: 1,
  },
  {
    slug: 'wellness-spa',
    name: 'Wellness & Spa',
    description: 'Massages, skin therapy, private treatment rooms & relaxation intervals',
    icon: 'Sparkles',
    sortOrder: 2,
  },
  {
    slug: 'medical-dental-clinic',
    name: 'Medical & Dental Clinic',
    description: 'Doctor consultations, treatment bays, specialized intake & follow-ups',
    icon: 'Activity',
    sortOrder: 3,
  },
  {
    slug: 'barbershop',
    name: 'Barbershop',
    description: 'Men grooming, beard sculpting, chair scheduling & appointment queue',
    icon: 'UserCheck',
    sortOrder: 4,
  },
  {
    slug: 'professional-consulting',
    name: 'Professional Consulting',
    description: 'Hourly legal, tax, financial advisory & strategy client appointments',
    icon: 'Briefcase',
    sortOrder: 5,
  },
  {
    slug: 'fitness-personal-training',
    name: 'Fitness & Personal Training',
    description: '1-on-1 coaching, studio bays, group classes & equipment pool locks',
    icon: 'Flame',
    sortOrder: 6,
  },
  {
    slug: 'creative-photo-video',
    name: 'Creative Photo / Video Studio',
    description: 'Camera gear, sound stages, lighting rigs & studio session buffers',
    icon: 'Camera',
    sortOrder: 7,
  },
  {
    slug: 'automotive-equipment-repair',
    name: 'Automotive & Equipment Repair',
    description: 'Diagnostic bays, certified mechanics, parts buffer & service intake',
    icon: 'Wrench',
    sortOrder: 8,
  },
  {
    slug: 'general-services',
    name: 'General / Other Services',
    description: 'Flexible custom scheduling rules, customizable staff & room assignments',
    icon: 'Layers',
    sortOrder: 9,
  }
];

async function main() {
  console.log('Seeding industry templates...');
  for (const item of INDUSTRY_TEMPLATES) {
    await prisma.industryTemplate.upsert({
      where: { slug: item.slug },
      create: item,
      update: {
        name: item.name,
        description: item.description,
        icon: item.icon,
        sortOrder: item.sortOrder,
        isActive: true,
      },
    });
  }
  console.log('✅ Successfully seeded ' + INDUSTRY_TEMPLATES.length + ' industry templates.');
}

main()
  .catch((e) => {
    console.error('Error seeding industry templates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
