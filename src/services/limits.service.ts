import { PrismaClient, Transaction, TransactionLimit, FeeConfig, KycTier, TransactionType, FeeType } from '@prisma/client';
import { ExchangeRatesService } from '../services/exchange-rates.service';
import { BadRequestError, UnprocessableEntityError } from '../utils/errors';

export class LimitsService {
  private prisma = new PrismaClient();
  private exchangeRates = new ExchangeRatesService();

  /** Determine KYC tier from user record */
  async getUserKycTier(userId: string): Promise<KycTier> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestError('User not found');
    return user.kycStatus;
  }

  /** Calculate USD amount using exchange rates */
  async convertToUsd(amount: string, currency: string): Promise<string> {
    try {
      return await this.exchangeRates.convert(amount, currency, 'USD');
    } catch (e) {
      // Gracefully handle missing rates
      throw new BadRequestError('Unsupported currency or missing exchange rate');
    }
  }

  /** Retrieve active limit config for tier & type */
  async getActiveLimit(kycTier: KycTier, txType: TransactionType): Promise<TransactionLimit | null> {
    return this.prisma.transactionLimit.findFirst({
      where: { kycTier, transactionType: txType, active: true },
    });
  }

  /** Retrieve active fee config for type */
  async getActiveFee(txType: TransactionType): Promise<FeeConfig | null> {
    return this.prisma.feeConfig.findFirst({
      where: { transactionType: txType, active: true },
    });
  }

  /** Calculate daily and monthly usage for user and transaction type */
  async getUsage(userId: string, txType: TransactionType): Promise<{ daily: string; monthly: string }> {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const daily = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: txType,
        createdAt: { gte: startOfDay },
      },
      _sum: { amount: true },
    });
    const monthly = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: txType,
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });
    return {
      daily: daily._sum.amount?.toString() ?? '0',
      monthly: monthly._sum.amount?.toString() ?? '0',
    };
  }

  /** Validate limits and calculate remaining allowances */
  async validateAndCompute(userId: string, tx: {
    amount: string;
    currency: string;
    type: TransactionType;
  }) {
    const kycTier = await this.getUserKycTier(userId);
    const usdAmountStr = await this.convertToUsd(tx.amount, tx.currency);
    const usdAmount = parseFloat(usdAmountStr);

    const limit = await this.getActiveLimit(kycTier, tx.type);
    if (!limit || !limit.active) {
      throw new UnprocessableEntityError('No active limit configuration');
    }

    if (kycTier === KycTier.UNVERIFIED) {
      throw new UnprocessableEntityError('UNVERIFIED users cannot transact');
    }

    // Single transaction check
    if (limit.singleLimit && usdAmount > parseFloat(limit.singleLimit.toString())) {
      throw new UnprocessableEntityError('Single transaction limit exceeded');
    }

    const usage = await this.getUsage(userId, tx.type);
    const dailyUsed = parseFloat(usage.daily);
    const monthlyUsed = parseFloat(usage.monthly);

    if (limit.dailyLimit && dailyUsed + usdAmount > parseFloat(limit.dailyLimit.toString())) {
      throw new UnprocessableEntityError('Daily limit exceeded');
    }
    if (limit.monthlyLimit && monthlyUsed + usdAmount > parseFloat(limit.monthlyLimit.toString())) {
      throw new UnprocessableEntityError('Monthly limit exceeded');
    }

    const remainingDaily = parseFloat(limit.dailyLimit.toString()) - (dailyUsed + usdAmount);
    const remainingMonthly = parseFloat(limit.monthlyLimit.toString()) - (monthlyUsed + usdAmount);

    // Fee calculation
    const feeConfig = await this.getActiveFee(tx.type);
    let fee = 0;
    if (feeConfig) {
      if (feeConfig.feeType === FeeType.PERCENT) {
        fee = (usdAmount * parseFloat(feeConfig.feeValue.toString())) / 100;
      } else if (feeConfig.feeType === FeeType.FLAT) {
        fee = parseFloat(feeConfig.feeValue.toString());
      }
      if (fee < parseFloat(feeConfig.minFee.toString())) fee = parseFloat(feeConfig.minFee.toString());
      if (feeConfig.maxFee && fee > parseFloat(feeConfig.maxFee.toString())) fee = parseFloat(feeConfig.maxFee.toString());
    }

    return {
      remainingDaily: Math.max(remainingDaily, 0),
      remainingMonthly: Math.max(remainingMonthly, 0),
      fee,
    };
  }
}
