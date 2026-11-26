import type {
  FinanceEntry,
  FinanceEntryType,
  FinanceSummaryResponse,
  FinancialLineItem,
  FinancialReport,
} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {NotFoundError} from '../../shared/errors/AppError.ts';
import {minorUnitsToRupees, rupeesToMinorUnits} from '../../shared/utils/crypto.ts';

export class FinanceService {
  constructor(private readonly adapter: DataAdapter) {}

  async submitFinancialReport(
    eventId: string,
    actor: {id: string; name: string},
    input: {lineItems: FinancialLineItem[]; notes: string},
  ): Promise<FinancialReport> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');

    const collectionsMinor = input.lineItems
      .filter((i) => i.type === 'collection')
      .reduce((sum, i) => sum + rupeesToMinorUnits(i.amount), 0);
    const expensesMinor = input.lineItems
      .filter((i) => i.type === 'expense')
      .reduce((sum, i) => sum + rupeesToMinorUnits(i.amount), 0);
    const netMinor = collectionsMinor - expensesMinor;

    const totalCollections = minorUnitsToRupees(collectionsMinor);
    const totalExpenses = minorUnitsToRupees(expensesMinor);
    const netBalance = minorUnitsToRupees(netMinor);

    const report = await this.adapter.upsertFinancialReport({
      eventId: event.id,
      eventTitle: event.title,
      clubId: event.clubId,
      clubName: event.clubName,
      submittedBy: actor.id,
      submittedByName: actor.name,
      totalCollections,
      totalExpenses,
      netBalance,
      totalCollectionsMinorUnits: collectionsMinor,
      totalExpensesMinorUnits: expensesMinor,
      netBalanceMinorUnits: netMinor,
      lineItems: input.lineItems,
      notes: input.notes,
    });

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Finance · ${event.clubName}`,
      action: 'SUBMITTED_FINANCIAL_REPORT',
      targetType: 'report',
      targetId: report.id,
      targetLabel: event.title,
      details: `Collections: ${totalCollections}, Expenses: ${totalExpenses}, Net: ${netBalance}.`,
    });

    return report;
  }

  async getFinancialReport(eventId: string): Promise<FinancialReport | null> {
    return this.adapter.getFinancialReport(eventId);
  }

  async getClubFinanceSummary(clubId: string): Promise<FinanceSummaryResponse> {
    const club = await this.adapter.getClubDetail(clubId);
    if (!club) throw new NotFoundError('Club not found');
    return this.adapter.getFinanceSummary({clubId: club.id});
  }

  async getEventFinanceSummary(eventId: string): Promise<FinanceSummaryResponse> {
    const event = await this.adapter.getEventById(eventId);
    if (!event) throw new NotFoundError('Event not found');
    return this.adapter.getFinanceSummary({eventId: event.id});
  }

  async createEntry(
    clubId: string,
    actor: {id: string; name: string},
    input: {
      eventId?: string | null;
      entryType: FinanceEntryType;
      sourceOrCategory: string;
      description: string;
      amountMinorUnits?: number;
      amount?: number;
      transactionDate: string;
      vendorOrRecipient: string;
      receiptUrl?: string;
      notes?: string;
    },
  ): Promise<FinanceEntry> {
    const amountMinorUnits =
      typeof input.amountMinorUnits === 'number'
        ? Math.max(0, Math.trunc(input.amountMinorUnits))
        : rupeesToMinorUnits(input.amount ?? 0);

    const entry = await this.adapter.createFinanceEntry({
      clubId,
      eventId: input.eventId ?? null,
      entryType: input.entryType,
      sourceOrCategory: input.sourceOrCategory,
      description: input.description,
      amountMinorUnits,
      transactionDate: input.transactionDate,
      vendorOrRecipient: input.vendorOrRecipient,
      receiptUrl: input.receiptUrl,
      notes: input.notes,
      createdBy: actor.id,
      createdByName: actor.name,
    });

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: `Club Finance · ${entry.clubName || clubId}`,
      action:
        entry.entryType === 'income' ? 'RECORDED_FINANCE_INCOME' : 'RECORDED_FINANCE_EXPENSE',
      targetType: 'report',
      targetId: entry.id,
      targetLabel: `${entry.sourceOrCategory} (${entry.amount})`,
      details: `${entry.entryType.toUpperCase()}: ${entry.description} (${amountMinorUnits} paise).`,
    });

    return entry;
  }

  async deleteEntry(
    clubId: string,
    entryId: string,
    actor: {id: string; name: string},
  ): Promise<void> {
    const deleted = await this.adapter.deleteFinanceEntry(clubId, entryId);
    if (!deleted) throw new NotFoundError('Finance entry not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Club Finance',
      action: 'DELETED_FINANCE_ENTRY',
      targetType: 'report',
      targetId: entryId,
      targetLabel: entryId,
      details: `Removed finance ledger entry ${entryId} from club ${clubId}.`,
    });
  }
}
