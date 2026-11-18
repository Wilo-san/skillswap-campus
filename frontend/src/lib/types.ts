export type Role = 'STUDENT' | 'ADMIN';
export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type Mode = 'ONSITE' | 'REMOTE';
export type BookingStatus = 'PENDING' | 'REFUSED' | 'ACCEPTED' | 'CANCELLED' | 'COMPLETED' | 'DISPUTED';

export interface Me {
  id: string; email: string; firstName: string; lastName: string; field: string; bio: string;
  role: Role; active: boolean; availableCredits: number; blockedCredits: number;
  offeredSkills: string[]; wantedSkills: string[]; createdAt: string;
}
export interface Person { id: string; firstName: string; lastName: string; field: string }
export interface Category { id: string; name: string; active: boolean }
export interface Slot {
  id: string; startsAt: string; endsAt: string; status: 'AVAILABLE' | 'ASSIGNED';
  location: string | null; meetingUrl: string | null; hasPrivateDetails: boolean;
}
export interface Offer {
  id: string; title: string; skill: string; description: string; level: Level; durationHours: number; cost: number;
  mode: Mode; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; hidden: boolean; hiddenReason?: string | null;
  category: Category; teacher: Person; teacherRating?: { avg: number | null; count: number };
  mine: boolean; createdAt: string; slots: Slot[]; pendingRequests?: number;
}
export interface Booking {
  id: string; status: BookingStatus; cost: number; blockedAmount: number;
  refusalReason: string | null; cancelReason: string | null;
  startsAt: string; endsAt: string; createdAt: string; settledAt: string | null;
  offer: { id: string; title: string; skill: string; mode: Mode; durationHours: number; level: Level };
  teacher: Person; learner: Person; myRole: 'TEACHER' | 'LEARNER' | null;
  location: string | null; meetingUrl: string | null; confirmedBy: string[];
  can: { withdraw: boolean; accept: boolean; refuse: boolean; cancel: boolean; confirm: boolean; report: boolean; review: boolean };
  myReview: number | null; disputeId: string | null; disputeStatus: 'OPEN' | 'RESOLVED' | null;
}
export interface LedgerEntry {
  id: string; type: 'WELCOME_BONUS' | 'BLOCK' | 'RELEASE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'REFUND';
  amount: number; availableAfter: number; blockedAfter: number; note: string | null; createdAt: string;
  booking: { id: string; title: string; status: BookingStatus } | null;
}
export interface Notif { id: string; title: string; message: string; link: string | null; read: boolean; createdAt: string }
export interface DisputeComment { id: string; content: string; createdAt: string; authorId: string; author: Person | null }
export interface Dispute {
  id: string; reason: 'ABSENCE' | 'DISAGREEMENT' | 'MISSING_CONFIRMATION' | 'OTHER'; description: string;
  status: 'OPEN' | 'RESOLVED'; decision: 'TRANSFER' | 'REFUND' | null; decisionNote: string | null;
  createdAt: string; decidedAt: string | null; openedBy: Person; comments: DisputeComment[];
  booking: {
    id: string; cost: number; status: BookingStatus; startsAt: string; endsAt: string;
    offer: { id: string; title: string; skill: string }; teacher: Person; learner: Person;
    confirmations: { userId: string }[]; slot: { location: string | null; meetingUrl: string | null };
  };
}
export interface Profile {
  id: string; firstName: string; lastName: string; field: string; bio: string;
  offeredSkills: string[]; wantedSkills: string[]; memberSince: string;
  averageRating: number | null; reviewCount: number; sessionsTaught: number; sessionsAttended: number; publishedOffers: number;
}
export interface Review { id: string; rating: number; comment: string; createdAt: string; reviewer: Person; offerTitle: string }
