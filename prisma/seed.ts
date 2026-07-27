import { PrismaClient, KycTier, TransactionType, FeeType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Transaction Limits
  const limits = [
    { kycTier: KycTier.UNVERIFIED, transactionType: TransactionType.SEND, singleLimit: 0, dailyLimit: 0, monthlyLimit: 0 },
    { kycTier: KycTier.UNVERIFIED, transactionType: TransactionType.EXCHANGE, singleLimit: 0, dailyLimit: 0, monthlyLimit: 0 },
    { kycTier: KycTier.UNVERIFIED, transactionType: TransactionType.WITHDRAWAL, singleLimit: 0, dailyLimit: 0, monthlyLimit: 0 },
    { kycTier: KycTier.BASIC, transactionType: TransactionType.SEND, singleLimit: 500, dailyLimit: 5000, monthlyLimit: 50000 },
    { kycTier: KycTier.BASIC, transactionType: TransactionType.EXCHANGE, singleLimit: 500, dailyLimit: 5000, monthlyLimit: 50000 },
    { kycTier: KycTier.BASIC, transactionType: TransactionType.WITHDRAWAL, singleLimit: 500, dailyLimit: 5000, monthlyLimit: 50000 },
    { kycTier: KycTier.FULL, transactionType: TransactionType.SEND, singleLimit: 10000, dailyLimit: 50000, monthlyLimit: 500000 },
    { kycTier: KycTier.FULL, transactionType: TransactionType.EXCHANGE, singleLimit: 10000, dailyLimit: 50000, monthlyLimit: 500000 },
    { kycTier: KycTier.FULL, transactionType: TransactionType.WITHDRAWAL, singleLimit: 10000, dailyLimit: 50000, monthlyLimit: 500000 },
  ];

  for (const l of limits) {
    await prisma.transactionLimit.upsert({
      where: { kycTier_transactionType: { kycTier: l.kycTier, transactionType: l.transactionType } },
      update: {},
      create: {
        kycTier: l.kycTier,
        transactionType: l.transactionType,
        singleLimit: l.singleLimit,
        dailyLimit: l.dailyLimit,
        monthlyLimit: l.monthlyLimit,
        currency: 'USD',
        active: true,
      },
    });
  }

  // Fee Configs
  const fees = [
    { transactionType: TransactionType.SEND, feeType: FeeType.PERCENT, feeValue: 0.5, minFee: 0.1 },
    { transactionType: TransactionType.EXCHANGE, feeType: FeeType.PERCENT, feeValue: 0.5, minFee: 0 },
    { transactionType: TransactionType.WITHDRAWAL, feeType: FeeType.FLAT, feeValue: 1, minFee: 0 },
  ];

  for (const f of fees) {
    await prisma.feeConfig.upsert({
      where: { transactionType: f.transactionType },
      update: {},
      create: {
        transactionType: f.transactionType,
        feeType: f.feeType,
        feeValue: f.feeValue,
        minFee: f.minFee,
        maxFee: null,
        currency: 'USD',
        active: true,
      },
    });
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
