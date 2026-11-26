import type {
  AdminAnalyticsResponse,
  AdminDashboardStats,
  AuditLogEntry,
  Club,
  ClubStatus,
  EventReport,
  FinanceSummaryResponse,
  FinancialReport,
  SystemSettings,
  UserAccount,
} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {BusinessRuleError, NotFoundError} from '../../shared/errors/AppError.ts';
import {
  escapeCsvCell,
  minorUnitsToRupees,
  rupeesToMinorUnits,
} from '../../shared/utils/crypto.ts';

export class AdminService {
  constructor(private readonly adapter: DataAdapter) {}

  async getDashboard(): Promise<AdminDashboardStats> {
    return this.adapter.getAdminDashboardStats();
  }

  async getAnalytics(): Promise<AdminAnalyticsResponse> {
    return this.adapter.getAdminAnalytics();
  }

  async listAllClubs(status?: ClubStatus): Promise<Club[]> {
    return this.adapter.listClubs({
      status,
      includeAllStatuses: !status,
    });
  }

  async listAllMemberships() {
    return this.adapter.listAllMemberships();
  }

  async updateClubStatus(
    clubId: string,
    status: ClubStatus,
    actor: {id: string; name: string},
    reason?: string,
  ): Promise<Club> {
    const club = await this.adapter.updateClubStatus(clubId, status);
    if (!club) throw new NotFoundError('Club not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: `CLUB_STATUS_${status.toUpperCase()}`,
      targetType: 'club',
      targetId: club.id,
      targetLabel: club.name,
      details: reason || `Changed club status to ${status}.`,
    });
    return club;
  }

  async listUsers(): Promise<UserAccount[]> {
    return this.adapter.listUsers();
  }

  async updateUserStatus(
    userId: string,
    status: 'active' | 'suspended',
    actor: {id: string; name: string},
    reason?: string,
  ): Promise<UserAccount> {
    if (userId === actor.id && status === 'suspended') {
      throw new BusinessRuleError(
        'CANNOT_SELF_SUSPEND',
        'Super Admin cannot suspend their own account',
      );
    }
    const user = await this.adapter.updateUserStatus(userId, status);
    if (!user) throw new NotFoundError('User not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: `USER_STATUS_${status.toUpperCase()}`,
      targetType: 'user',
      targetId: user.id,
      targetLabel: `${user.name} (${user.email})`,
      details: reason || `Set account status to ${status}.`,
    });
    return user;
  }

  async listAllEventReports(): Promise<EventReport[]> {
    return this.adapter.listAllEventReports();
  }

  async reviewEventReport(
    reportId: string,
    actor: {id: string; name: string},
    input: {
      status: 'under_review' | 'changes_requested' | 'approved' | 'rejected';
      reviewNotes: string;
    },
  ): Promise<EventReport> {
    const updated = await this.adapter.reviewEventReport(reportId, actor, input);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: `REVIEWED_EVENT_REPORT_${input.status.toUpperCase()}`,
      targetType: 'report',
      targetId: updated.id,
      targetLabel: updated.eventTitle,
      details: input.reviewNotes
        ? `Marked report ${input.status}: ${input.reviewNotes}`
        : `Marked report ${input.status}.`,
    });
    return updated;
  }

  async listAllFinancialReports(): Promise<{
    reports: FinancialReport[];
    totalCollections: number;
    totalExpenses: number;
    netBalance: number;
    ledgerSummary: FinanceSummaryResponse;
  }> {
    const [reports, ledgerSummary] = await Promise.all([
      this.adapter.listAllFinancialReports(),
      this.adapter.getFinanceSummary(),
    ]);

    const reportCollectionsMinor = reports.reduce(
      (s, r) => s + (r.totalCollectionsMinorUnits ?? rupeesToMinorUnits(r.totalCollections)),
      0,
    );
    const reportExpensesMinor = reports.reduce(
      (s, r) => s + (r.totalExpensesMinorUnits ?? rupeesToMinorUnits(r.totalExpenses)),
      0,
    );

    const totalCollectionsMinor = reportCollectionsMinor + ledgerSummary.totalIncomeMinorUnits;
    const totalExpensesMinor = reportExpensesMinor + ledgerSummary.totalExpensesMinorUnits;

    return {
      reports,
      totalCollections: minorUnitsToRupees(totalCollectionsMinor),
      totalExpenses: minorUnitsToRupees(totalExpensesMinor),
      netBalance: minorUnitsToRupees(totalCollectionsMinor - totalExpensesMinor),
      ledgerSummary,
    };
  }

  async exportReportsCsv(): Promise<{filename: string; csv: string}> {
    const reports = await this.adapter.listAllEventReports();
    const headers = [
      'Report ID',
      'Event Title',
      'Club',
      'Status',
      'Completion Status',
      'Actual Attendance',
      'Registered Total',
      'Submitted By',
      'Submitted At',
      'Reviewed By',
      'Reviewed At',
      'Review Notes',
    ];
    const lines = [headers.map((h) => escapeCsvCell(h)).join(',')];
    for (const r of reports) {
      lines.push(
        [
          r.id,
          r.eventTitle,
          r.clubName,
          r.status,
          r.completionStatus,
          r.actualAttendance,
          r.registeredTotal,
          r.submittedByName,
          r.submittedAt,
          r.reviewedByName || '',
          r.reviewedAt || '',
          r.reviewNotes || '',
        ]
          .map((c) => escapeCsvCell(c))
          .join(','),
      );
    }
    return {
      filename: 'campusverse-event-reports.csv',
      csv: lines.join('\r\n'),
    };
  }

  async exportFinanceCsv(): Promise<{filename: string; csv: string}> {
    const {reports, ledgerSummary} = await this.listAllFinancialReports();
    const headers = [
      'Record Source',
      'Record ID',
      'Club',
      'Event',
      'Type',
      'Category / Source',
      'Description / Notes',
      'Amount (INR)',
      'Vendor / Recipient',
      'Date',
      'Recorded By',
    ];
    const lines = [headers.map((h) => escapeCsvCell(h)).join(',')];

    for (const entry of ledgerSummary.entries) {
      lines.push(
        [
          'Ledger Entry',
          entry.id,
          entry.clubName || entry.clubId,
          entry.eventTitle || 'Club General',
          entry.entryType,
          entry.sourceOrCategory,
          entry.description,
          entry.amount.toFixed(2),
          entry.vendorOrRecipient,
          entry.transactionDate,
          entry.createdByName,
        ]
          .map((c) => escapeCsvCell(c))
          .join(','),
      );
    }

    for (const rep of reports) {
      lines.push(
        [
          'Event Finance Report',
          rep.id,
          rep.clubName,
          rep.eventTitle,
          'summary',
          'Event Report Settlement',
          rep.notes || 'Consolidated event finance report',
          rep.netBalance.toFixed(2),
          'CampusVerse Event Settlement',
          rep.submittedAt,
          rep.submittedByName,
        ]
          .map((c) => escapeCsvCell(c))
          .join(','),
      );
    }

    return {
      filename: 'campusverse-institutional-finance.csv',
      csv: lines.join('\r\n'),
    };
  }

  async listAuditLogs(): Promise<AuditLogEntry[]> {
    return this.adapter.listAuditLogs();
  }

  async getSettings(): Promise<SystemSettings> {
    return this.adapter.getSystemSettings();
  }

  async updateSettings(
    updates: Partial<SystemSettings>,
    actor: {id: string; name: string},
  ): Promise<SystemSettings> {
    const updated = await this.adapter.updateSystemSettings(updates);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action: 'UPDATED_SYSTEM_SETTINGS',
      targetType: 'system',
      targetId: 'system-settings',
      targetLabel: 'CampusVerse Policy Config',
      details: `Updated institutional configuration flags.`,
    });
    return updated;
  }
}
