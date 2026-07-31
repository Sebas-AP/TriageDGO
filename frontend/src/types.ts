export type Priority = "P0" | "P1" | "P2" | "P3";
export type AgentName = "classifier" | "pattern" | "acuse";
export type AgentStatus = "pending" | "running" | "done" | "error";
export type ReportStatus = "received" | "processing" | "ready" | "failed";
export type ChannelSource = "form" | "whatsapp" | "call" | "manual";
export type OperationalStatus =
  | "new"
  | "review"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed"
  | "duplicate"
  | "cancelled";
export type ClusterTrend = "growing" | "stable" | "decreasing";
export type ClusterStatus = "detected" | "investigating" | "action_planned" | "resolved";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface LocationValue extends Coordinates {
  address: string;
  placeId?: string;
  neighborhood?: string;
}

export interface MapSuggestion {
  placeId: string;
  label: string;
  context?: string;
}

export interface AgentProgress {
  agent: AgentName;
  status: AgentStatus;
  error?: string;
}

export interface SimilarReport {
  id: string;
  category: string;
  coordinates: Coordinates;
  distanceKm: number;
}

export interface Ticket {
  id: string;
  folio: string;
  priority: Priority;
  originalPriority?: Priority;
  area: string;
  category: string;
  patternDetected: boolean;
  triggeredRule: string;
  acknowledgmentSent: boolean;
  manualReview: boolean;
}

export interface ChannelDetails {
  originalText?: string;
  transcript?: string;
  callDurationSeconds?: number;
  transcriptionConfidence?: number;
  mediaCount?: number;
  capturedBy?: string;
}

export interface FollowUp {
  id: string;
  dueAt: string;
  reason: string;
  expectedAction: string;
  owner: string;
  completed: boolean;
  createdAt: string;
}

export interface AdministrativeNote {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  type: "created" | "classified" | "assigned" | "status" | "follow_up" | "note" | "priority" | "linked";
  label: string;
  detail: string;
  actor: string;
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  folio: string;
  citizenName: string;
  phone: string;
  description: string;
  location: LocationValue;
  status: ReportStatus;
  operationalStatus: OperationalStatus;
  channel: ChannelSource;
  channelDetails?: ChannelDetails;
  createdAt: string;
  updatedAt: string;
  assignee?: string;
  team?: string;
  dueAt?: string;
  agents: Record<AgentName, AgentProgress>;
  ticket?: Ticket;
  similarReports: SimilarReport[];
  followUps: FollowUp[];
  notes: AdministrativeNote[];
  auditLog: AuditEvent[];
  clusterId?: string;
}

export interface ProblemCluster {
  id: string;
  title: string;
  category: string;
  zone: string;
  coordinates: Coordinates;
  radiusMeters: number;
  reportIds: string[];
  reportCount: number;
  trend: ClusterTrend;
  growthPercent: number;
  highestPriority: Priority;
  probableCause: string;
  status: ClusterStatus;
  owner?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  masterIncidentFolio?: string;
  channelCounts: Record<ChannelSource, number>;
}

export interface ReportSubmission {
  citizenName: string;
  phone: string;
  consent: boolean;
  location: LocationValue;
  description: string;
  clarificationAnswer?: string;
  photo?: File;
  /** Reused by the wizard when a failed submission is retried. Sent only as an HTTP header. */
  idempotencyKey?: string;
}

export type AdminEvent =
  | { eventId: string; reportId: string; timestamp: string; type: "report.received"; payload: ReportRecord }
  | { eventId: string; reportId: string; timestamp: string; type: "agent.status"; payload: AgentProgress }
  | { eventId: string; reportId: string; timestamp: string; type: "ticket.ready"; payload: Ticket }
  | { eventId: string; reportId: string; timestamp: string; type: "report.updated"; payload: ReportRecord }
  | { eventId: string; reportId: string; timestamp: string; type: "report.failed"; payload: { message: string } };

export interface SubmissionResult {
  reportId: string;
  folio: string;
  status: ReportStatus;
}

export interface AdminUser {
  uid: string;
  email: string;
  role: "admin";
}

export interface FollowUpInput {
  dueAt: string;
  reason: string;
  expectedAction: string;
  owner: string;
}

export interface OperationalMetrics {
  receivedToday: number;
  active: number;
  critical: number;
  unassigned: number;
  overdue: number;
  followUpsToday: number;
  resolvedToday: number;
  frequentProblems: number;
}
