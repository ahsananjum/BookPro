export type DashboardBookingStatus = "PUBLISHED" | "UNPUBLISHED";

export interface DashboardOrganizationDto {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  logoUrl?: string | null;
  brandName?: string | null;
  primaryColor?: string | null;
  bookingPage: {
    status: DashboardBookingStatus;
    url: string | null;
  };
}

export interface DashboardTodayMetricsDto {
  appointments: {
    total: number;
    completed: number;
    upcoming: number;
  };
  collectedRevenueCents: number;
  expectedRevenueCents: number;
  currency: string;
}

export interface DashboardUpcomingAppointmentDto {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  priceCents: number;
  currency: string;
  originalPriceCents?: number;
  originalCurrency?: string;
  customer?: {
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
  } | null;
  service?: {
    id: string;
    name: string;
    durationMin: number;
  } | null;
  staff?: {
    id: string;
    displayName: string;
  } | null;
  location?: {
    id: string;
    name: string;
  } | null;
  paymentStatus?: "PAID" | "DEPOSIT_PAID" | "UNPAID" | "REFUNDED" | null;
}

export interface DashboardHealthIssueDto {
  code: string;
  message: string;
  severity: "critical" | "attention" | "info";
  actionLabel: string;
  actionHref: string;
}

export interface DashboardPerformanceDto {
  period: string;
  bookingsCount: number;
  bookingsVsPrev: number | null;
  collectedRevenueCents: number;
  revenueVsPrev: number | null;
  cancellationCount: number;
  utilizationRate: number | null;
  currency: string;
}

export interface DashboardWaitlistOpportunityDto {
  pendingCount: number;
  earliestRequestedAt?: string | null;
}

export interface DashboardForexRateDto {
  chosenCurrency: string;
  baseCurrency: string;
  exchangeRate: number;
  availableCurrencies: string[];
  updatedAt: number;
}

export interface DashboardOverviewResponseDto {
  organization: DashboardOrganizationDto;
  today: DashboardTodayMetricsDto;
  upcomingAppointments: DashboardUpcomingAppointmentDto[];
  health: {
    bookingReady: boolean;
    issues: DashboardHealthIssueDto[];
  };
  performance: DashboardPerformanceDto;
  waitlistOpportunity: DashboardWaitlistOpportunityDto | null;
  forex?: DashboardForexRateDto;
}
