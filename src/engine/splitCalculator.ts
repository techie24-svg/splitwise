import type { SplitType, SplitItem } from '../models/types.ts';

/**
 * Calculates and validates individual user shares for an expense based on the chosen split type.
 * Accurately handles floating-point arithmetic and currency rounding (e.g. ₹100 split 3 ways -> 33.34, 33.33, 33.33).
 */
export function calculateSplits(
  totalAmount: number,
  splitType: SplitType,
  participants: { userId: string; value?: number }[]
): SplitItem[] {
  if (participants.length === 0) {
    throw new Error('At least one participant is required to split an expense.');
  }

  const roundedTotal = Math.round(totalAmount * 100) / 100;
  const count = participants.length;

  switch (splitType) {
    case 'EQUAL': {
      // Divide into base cents/paise
      const totalCents = Math.round(roundedTotal * 100);
      const baseShareCents = Math.floor(totalCents / count);
      let remainderCents = totalCents % count;

      return participants.map((p) => {
        let userCents = baseShareCents;
        // Distribute remainder 1 cent at a time to first participants
        if (remainderCents > 0) {
          userCents += 1;
          remainderCents -= 1;
        }
        return {
          userId: p.userId,
          amount: userCents / 100
        };
      });
    }

    case 'EXACT': {
      const splits: SplitItem[] = participants.map((p) => ({
        userId: p.userId,
        amount: Math.round((p.value || 0) * 100) / 100
      }));

      const sum = splits.reduce((acc, s) => acc + s.amount, 0);
      if (Math.abs(sum - roundedTotal) > 0.01) {
        throw new Error(`Exact amounts sum to ${sum.toFixed(2)}, which does not match total amount ${roundedTotal.toFixed(2)}`);
      }
      return splits;
    }

    case 'PERCENT': {
      const totalPercent = participants.reduce((acc, p) => acc + (p.value || 0), 0);
      if (Math.abs(totalPercent - 100) > 0.01) {
        throw new Error(`Percentages sum to ${totalPercent}%, which must equal 100%`);
      }

      let distributedCents = 0;
      const totalCents = Math.round(roundedTotal * 100);

      const splits: SplitItem[] = participants.map((p, idx) => {
        if (idx === count - 1) {
          // Last participant absorbs any rounding difference to ensure exact total match
          const lastCents = totalCents - distributedCents;
          return {
            userId: p.userId,
            percentage: p.value,
            amount: lastCents / 100
          };
        }

        const cents = Math.round((roundedTotal * (p.value || 0)) / 100 * 100);
        distributedCents += cents;
        return {
          userId: p.userId,
          percentage: p.value,
          amount: cents / 100
        };
      });

      return splits;
    }

    case 'SHARES': {
      const totalShares = participants.reduce((acc, p) => acc + (p.value || 1), 0);
      if (totalShares <= 0) {
        throw new Error('Total shares must be greater than zero.');
      }

      let distributedCents = 0;
      const totalCents = Math.round(roundedTotal * 100);

      const splits: SplitItem[] = participants.map((p, idx) => {
        const share = p.value || 1;
        if (idx === count - 1) {
          const lastCents = totalCents - distributedCents;
          return {
            userId: p.userId,
            shares: share,
            amount: lastCents / 100
          };
        }

        const cents = Math.round((totalCents * share) / totalShares);
        distributedCents += cents;
        return {
          userId: p.userId,
          shares: share,
          amount: cents / 100
        };
      });

      return splits;
    }

    default:
      throw new Error(`Unsupported split type: ${splitType}`);
  }
}

/**
 * Convenience helper for equal split among a list of user IDs.
 */
export function calculateEqualSplit(totalAmount: number, userIds: string[]): SplitItem[] {
  return calculateSplits(
    totalAmount,
    'EQUAL',
    userIds.map((uid) => ({ userId: uid }))
  );
}

/**
 * Convenience helper for exact split where amounts are explicitly mapped per user ID.
 */
export function calculateExactSplit(totalAmount: number, userAmounts: { userId: string; amount: number }[]): SplitItem[] {
  return calculateSplits(
    totalAmount,
    'EXACT',
    userAmounts.map((ua) => ({ userId: ua.userId, value: ua.amount }))
  );
}

