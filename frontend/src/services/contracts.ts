import type {
  AdminEvent,
  AdminUser,
  FollowUpInput,
  LocationValue,
  MapSuggestion,
  OperationalStatus,
  Priority,
  ProblemCluster,
  ReportRecord,
  ReportSubmission,
  SubmissionResult,
} from "../types";

export interface ReportService {
  submit(input: ReportSubmission): Promise<SubmissionResult>;
  requestClarification(description: string, revision: number): Promise<{ question: string | null; revision: number }>;
  getPublicReport(folio: string): Promise<ReportRecord | null>;
}

export interface MapService {
  autocomplete(query: string, signal?: AbortSignal): Promise<MapSuggestion[]>;
  geocode(placeId: string): Promise<LocationValue>;
}

export interface RealtimeService {
  listReports(): Promise<ReportRecord[]>;
  subscribe(listener: (event: AdminEvent) => void, onError?: (error: Error) => void): () => void;
}

export interface AdminService {
  listClusters(): Promise<ProblemCluster[]>;
  updateStatus(reportId: string, status: OperationalStatus, note?: string): Promise<ReportRecord>;
  assign(reportId: string, assignee: string, team: string): Promise<ReportRecord>;
  scheduleFollowUp(reportId: string, input: FollowUpInput): Promise<ReportRecord>;
  completeFollowUp(reportId: string, followUpId: string): Promise<ReportRecord>;
  addNote(reportId: string, text: string): Promise<ReportRecord>;
  changePriority(reportId: string, priority: Priority, reason: string): Promise<ReportRecord>;
  createMasterIncident(clusterId: string, owner: string): Promise<ProblemCluster>;
  updateClusterStatus(clusterId: string, status: ProblemCluster["status"]): Promise<ProblemCluster>;
  resetDemoData(): Promise<void>;
}

export interface AuthService {
  currentUser(): Promise<AdminUser | null>;
  login(email: string, password: string): Promise<AdminUser>;
  logout(): Promise<void>;
  getToken(): Promise<string | null>;
  onChange(listener: (user: AdminUser | null) => void): () => void;
}

export interface Services {
  reports: ReportService;
  maps: MapService;
  realtime: RealtimeService;
  admin: AdminService;
  auth: AuthService;
}
