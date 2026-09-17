export enum AudienceSegment {
  ALL_SUBSCRIBED = "ALL_SUBSCRIBED",
  PORTAL_MEMBERS = "PORTAL_MEMBERS",
  VIP_CLIENTS = "VIP_CLIENTS",
  INACTIVE_CLIENTS = "INACTIVE_CLIENTS",
  RECENT_CLIENTS = "RECENT_CLIENTS",
}

export enum DiscountType {
  PERCENTAGE = "PERCENTAGE",
  FIXED_AMOUNT = "FIXED_AMOUNT",
}

export interface MarketingOverviewStatsDto {
  totalSubscribers: number;
  totalAudience: number;
  optInRatePct: number;
  unsubscribedCount: number;
  totalCampaignsSent: number;
  deliveredCount: number;
  failedCount: number;
  deliveryRatePct: number;
  activeCouponsCount: number;
}

export interface SendCampaignExtendedInputDto {
  templateId: string;
  name: string;
  segment?: AudienceSegment;
  couponId?: string;
}

export interface AudienceCustomerDto {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  consentMarketing: boolean;
  consentMarketingAt?: string | null;
  isRegisteredUser: boolean;
  totalAppointments: number;
  totalSpentCents: number;
  lastBookingAt?: string | null;
  createdAt: string;
}

export interface CampaignRecipientDetailDto {
  id: string;
  customerId?: string | null;
  customerName: string;
  recipientEmail: string;
  status: string;
  providerId?: string | null;
  sentAt?: string | null;
  failedAt?: string | null;
  lastError?: string | null;
}

export interface CampaignDetailResponseDto {
  id: string;
  name: string;
  status: string;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  sentAt?: string | null;
  createdAt: string;
  template: {
    id: string;
    name: string;
    subject: string;
  };
  recipients: CampaignRecipientDetailDto[];
}

export interface CouponDto {
  id: string;
  organizationId: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minSpendCents?: number | null;
  maxDiscountCents?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  usageLimit?: number | null;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCouponInputDto {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minSpendCents?: number | null;
  maxDiscountCents?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  usageLimit?: number | null;
  isActive?: boolean;
}

export interface UpdateCouponInputDto {
  code?: string;
  discountType?: DiscountType;
  discountValue?: number;
  minSpendCents?: number | null;
  maxDiscountCents?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  usageLimit?: number | null;
  isActive?: boolean;
}

export interface CustomerPerkOfferDto {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  minSpendCents?: number | null;
  validTo?: string | null;
}

export interface CustomerMarketingPreferenceDto {
  consentMarketing: boolean;
  consentMarketingAt?: string | null;
}
