// Core data types for Synthesize mode

export interface User {
	npub: string;
	pubkeyHex: string;
}

// =============================================================================
// PROJECT TYPES
// =============================================================================

export interface ProjectTag {
	name: string;
	color: string;
	deletable?: boolean;
}

export interface Project {
	id: string;
	npub: string;
	title: string;
	createdAt: number; // Unix timestamp
	updatedAt: number;
	tags?: ProjectTag[];
}

// =============================================================================
// TOOL CALL TYPES
// =============================================================================

export interface ToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
	type?: 'tool_call';
}

export interface ToolResult {
	tool_call_id: string;
	name: string;
	content: string;
	error?: string;
}

export type ToolExecutionStatus = 'pending' | 'executing' | 'completed' | 'error';

export interface ToolCallWithStatus extends ToolCall {
	status: ToolExecutionStatus;
	result?: ToolResult;
}

// =============================================================================
// THREAD TYPES
// =============================================================================

export type ThreadStatus = 'idle' | 'busy' | 'interrupted' | 'error';

export interface Thread {
	id: string;
	projectId: string;
	title: string;
	description?: string; // Last message preview or summary
	status: ThreadStatus;
	langGraphThreadId?: string; // LangGraph server's thread ID
	assistantId?: string; // ID of the agent assigned to this thread
	metadata?: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
	viewed?: boolean;
}

export interface Message {
	id: string;
	threadId: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	toolCalls?: ToolCallWithStatus[];
	createdAt: number;
}

// =============================================================================
// ARTIFACT (FILE) TYPES
// =============================================================================

export interface ArtifactVersion {
	index: number;
	title: string;
	content: string; // Markdown content
	createdAt: number;
}

export interface Artifact {
	id: string;
	projectId: string;
	currentVersionIndex: number;
	versions: ArtifactVersion[];
	createdAt: number;
	updatedAt: number;
	viewed?: boolean;
	tags?: string[];
	isDirty?: boolean; // Has unsaved changes
}

// =============================================================================
// SOURCE TYPES
// =============================================================================

export interface Source {
	id: string;
	projectId: string;
	title: string;
	url: string;
	content: string; // Markdown conversion
	metadata?: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
	viewed?: boolean;
}

// =============================================================================
// WORKSPACE TYPES
// =============================================================================

export type TabType = 'artifact' | 'thread' | 'source';

export interface TabItem {
	id: string;
	type: TabType;
}

export interface WorkspaceState {
	leftTabs: TabItem[];
	rightTabs: TabItem[];
	activeLeftTabId: string | null;
	activeRightTabId: string | null;
	rightPanelCollapsed: boolean;
}

// =============================================================================
// AGENT SCRATCH FILES & TODOS
// =============================================================================

export interface ScratchFile {
	path: string;
	content: string[];
	created_at?: string;
	modified_at?: string;
}

export interface TodoItem {
	id?: string;
	content: string;
	status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

// =============================================================================
// PAYMENT TYPES
// =============================================================================

export interface PaymentRequest {
	ecashToken: string;
	amountSats: number;
}

export type PaymentStatus = 'pending' | 'active' | 'exhausted' | 'completed' | 'error' | 'refunded';

export interface CashuPaymentState {
	payment_token: string | null;
	payment_balance_sats: number;
	payment_spent_sats: number;
	payment_refund_token: string | null;
	payment_status: PaymentStatus;
	payment_refund_claimed: boolean;
}

// =============================================================================
// HUMAN-IN-THE-LOOP TYPES
// =============================================================================

export interface HITLActionRequest {
	name: string;
	args: Record<string, unknown>;
	description?: string;
}

export interface HITLReviewConfig {
	action_name: string;
	allowed_decisions: ('approve' | 'edit' | 'reject')[];
}

export interface HITLInterrupt {
	action_requests: HITLActionRequest[];
	review_configs: HITLReviewConfig[];
}

export interface HITLDecision {
	type: 'approve' | 'edit' | 'reject';
	args?: Record<string, unknown>;
}

export interface HITLResumeResponse {
	decisions: HITLDecision[];
}

// =============================================================================
// CLIENT TOOL INTERRUPT TYPES
// =============================================================================

export interface ClientToolInterrupt {
	type: 'client_tool_execution';
	tool_calls: Array<{
		id: string;
		name: string;
		args: Record<string, unknown>;
	}>;
	auto_approve: boolean;
	requires_approval: boolean;
	action_requests?: HITLActionRequest[];
	review_configs?: HITLReviewConfig[];
}

// =============================================================================
// CLARIFICATION TYPES
// =============================================================================

export interface ClarificationInterrupt {
	type: 'clarification_request';
	tool: 'ask_user' | 'ask_choices';
	tool_call_id: string;
	question: string;
	options?: Array<{ id: string; label: string }>;
	allow_multiple?: boolean;
	allow_freeform?: boolean;
}

export interface ClarificationResponse {
	response?: string;
	selected?: string[];
	freeform?: string;
}

export function isClarificationInterrupt(value: unknown): value is ClarificationInterrupt {
	if (!value || typeof value !== 'object') return false;
	const obj = value as Record<string, unknown>;
	return obj.type === 'clarification_request' && typeof obj.tool === 'string';
}

export function isClientToolInterrupt(value: unknown): value is ClientToolInterrupt {
	if (!value || typeof value !== 'object') return false;
	const obj = value as Record<string, unknown>;
	return obj.type === 'client_tool_execution' && Array.isArray(obj.tool_calls);
}

// =============================================================================
// AGENT STREAM STATE
// =============================================================================

export interface AgentStreamState {
	isStreaming: boolean;
	threadId: string | null;
	currentRunId: string | null;
	error: string | null;
	isInterrupted: boolean;
	pendingToolCalls: ToolCallWithStatus[];
	humanInterrupt: HITLInterrupt | null;
}

// =============================================================================
// TOOL LISTS
// =============================================================================

export const AUTO_APPROVE_TOOLS = ['list_files', 'read_file', 'search_files', 'grep_files', 'glob_files'];
export const WRITE_TOOLS = ['write_file', 'patch_file'];

